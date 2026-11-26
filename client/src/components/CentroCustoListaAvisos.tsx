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
const BOTAO_ACAO =
  "rounded-full text-white hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2";

export type AvisoListaCentro =
  | { tipo: "inativar" | "reativar"; id: number; nome: string }
  | { tipo: "excluir"; id: number; nome: string; podeExcluir: boolean; conferencia: "ok" | "falhou" };

type Props = {
  aviso: AvisoListaCentro | null;
  enviando?: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
};

function Nome({ children }: { children: string }) {
  return <strong className="font-semibold text-gray-900">&quot;{children}&quot;</strong>;
}

function TextoExclusao({ nome, podeExcluir, conferencia }: { nome: string; podeExcluir: boolean; conferencia: "ok" | "falhou" }) {
  if (conferencia === "falhou") {
    return (
      <>
        <p>O centro de custo <Nome>{nome}</Nome> não será excluído.</p>
        <p className="mt-3">A conferência dos vínculos não pôde ser concluída. Por segurança, a exclusão permanece bloqueada e nenhum registro foi alterado.</p>
      </>
    );
  }
  if (podeExcluir) {
    return <p>O centro de custo <Nome>{nome}</Nome> será excluído.</p>;
  }
  return <p>O centro de custo <Nome>{nome}</Nome> não pode ser excluído.</p>;
}

export default function CentroCustoListaAvisos({ aviso, enviando = false, onFechar, onConfirmar }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ultimo = useRef<AvisoListaCentro | null>(null);
  if (aviso) ultimo.current = aviso;
  const atual = aviso ?? ultimo.current;
  const aberto = aviso != null;
  const excluir = atual?.tipo === "excluir";
  const confirmarExclusao = Boolean(excluir && atual.podeExcluir && atual.conferencia === "ok");
  const reativar = atual?.tipo === "reativar";
  const corIcone = excluir ? "text-red-500" : reativar ? "text-[#16A34A]" : "text-[#D97706]";
  const icone = excluir ? "warning" : "info";
  const titulo = excluir
    ? (confirmarExclusao ? "Excluir centro de custo" : "Não é possível excluir o centro de custo")
    : reativar
      ? "Reativar centro de custo"
      : "Inativar centro de custo";
  const corBotao = confirmarExclusao ? "#B91C1C" : reativar ? "#16A34A" : "#D97706";
  const rotuloAcao = confirmarExclusao ? "Excluir" : reativar ? "Reativar" : "Inativar";

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
            <span className={`material-icons text-[22px] ${corIcone}`}>{icone}</span>
            {titulo}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-gray-600">
              {atual?.tipo === "inativar" && (
                <>
                  <p>O centro de custo <Nome>{atual.nome}</Nome> ficará inativo.</p>
                  <p className="mt-3">Os cadastros e históricos vinculados serão preservados.</p>
                </>
              )}
              {atual?.tipo === "reativar" && (
                <p>O centro de custo <Nome>{atual.nome}</Nome> volta a ficar ativo.</p>
              )}
              {atual?.tipo === "excluir" && (
                <TextoExclusao nome={atual.nome} podeExcluir={atual.podeExcluir} conferencia={atual.conferencia} />
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          {excluir && !confirmarExclusao ? (
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
          ) : (
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
                  if (!enviando) onConfirmar();
                }}
                className={`${BOTAO_ACAO} disabled:opacity-60`}
                style={{ minHeight: 44, backgroundColor: corBotao }}
              >
                {enviando ? "Aguarde..." : rotuloAcao}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
