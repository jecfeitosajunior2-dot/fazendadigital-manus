import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BOTAO_NEUTRO =
  "rounded-full border-0 bg-gray-100 text-gray-800 shadow-none hover:bg-gray-200 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2";

export type AvisoSubcategoria = {
  id: number;
  nome: string;
  podeExcluir: boolean;
  conferencia: "ok" | "falhou";
};

function Nome({ children }: { children: string }) {
  return <strong className="font-semibold text-gray-900">&quot;{children}&quot;</strong>;
}

export default function SubcategoriaAvisos({
  aviso,
  enviando = false,
  onFechar,
  onConfirmar,
}: {
  aviso: AvisoSubcategoria | null;
  enviando?: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ultimo = useRef<AvisoSubcategoria | null>(null);
  if (aviso) ultimo.current = aviso;
  const atual = aviso ?? ultimo.current;
  const aberto = aviso != null;
  const confirmar = Boolean(atual && atual.podeExcluir && atual.conferencia === "ok");

  return (
    <AlertDialog open={aberto} onOpenChange={(open) => { if (!open && !enviando) onFechar(); }}>
      <AlertDialogContent
        className="max-w-[420px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
            <span className="material-icons text-[22px] text-red-500">warning</span>
            {confirmar ? "Excluir subcategoria" : "Não é possível excluir a subcategoria"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-gray-600">
              {atual?.conferencia === "falhou" ? (
                <>
                  <p>A subcategoria <Nome>{atual.nome}</Nome> não será excluída.</p>
                  <p className="mt-3">A conferência dos vínculos não pôde ser concluída. Por segurança, a exclusão permanece bloqueada e nenhum registro foi alterado.</p>
                </>
              ) : confirmar && atual ? (
                <p>A subcategoria <Nome>{atual.nome}</Nome> será excluída.</p>
              ) : atual ? (
                <p>A subcategoria <Nome>{atual.nome}</Nome> não pode ser excluída.</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          {confirmar ? (
            <>
              <AlertDialogCancel
                ref={cancelRef}
                disabled={enviando}
                onClick={(event) => {
                  event.preventDefault();
                  if (!enviando) onFechar();
                }}
                className={BOTAO_NEUTRO}
                style={{ minHeight: 44 }}
              >
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={enviando}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirmar();
                }}
                className="rounded-full text-white hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ backgroundColor: "#B91C1C", minHeight: 44 }}
              >
                Excluir
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction
              ref={cancelRef}
              onClick={(event) => {
                event.preventDefault();
                onFechar();
              }}
              className={BOTAO_NEUTRO}
              style={{ minHeight: 44 }}
            >
              Entendi
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
