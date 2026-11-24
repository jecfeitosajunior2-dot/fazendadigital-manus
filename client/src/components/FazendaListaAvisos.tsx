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
import { modoExclusaoBloqueada, type ModoExclusaoBloqueada } from "@/lib/fazendasListagem";
import type { FazendaDeleteBlocker } from "@shared/fazendaDeleteBlockers";

const BOTAO_NEUTRO =
  "rounded-full border-0 bg-gray-100 text-gray-800 shadow-none hover:bg-gray-200 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2";
const BOTAO_ACAO =
  "rounded-full text-white hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2";

export type AvisoListaFazenda =
  | { tipo: "inativar" | "reativar"; id: number; nome: string }
  | { tipo: "excluir"; nome: string; blockers: FazendaDeleteBlocker[]; conferencia: "ok" | "falhou" };

type Props = {
  aviso: AvisoListaFazenda | null;
  enviando?: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
};

function Nome({ children }: { children: string }) {
  return <strong className="font-semibold text-gray-900">&quot;{children}&quot;</strong>;
}

function TextoExclusao({ nome, modo, conferencia }: { nome: string; modo: ModoExclusaoBloqueada; conferencia: "ok" | "falhou" }) {
  if (conferencia === "falhou") {
    return (
      <>
        <p>A fazenda <Nome>{nome}</Nome> não será excluída.</p>
        <p className="mt-3">A conferência dos vínculos não pôde ser concluída. Por segurança, a exclusão física permanece bloqueada e nenhum registro foi alterado.</p>
      </>
    );
  }
  if (modo.modo === "subdivisoes") {
    return (
      <>
        <p>
          A fazenda <Nome>{nome}</Nome> possui{" "}
          <strong className="font-semibold text-gray-900">{modo.quantidade} subdivisões vinculadas</strong>.
        </p>
        <p className="mt-3">Por segurança, sua exclusão está bloqueada para preservar os dados e históricos existentes.</p>
        <p className="mt-3">Se você não pretende mais utilizar essa propriedade, poderá optar pela inativação.</p>
      </>
    );
  }
  if (modo.modo === "vinculos") {
    return (
      <>
        <p>
          A fazenda <Nome>{nome}</Nome> possui{" "}
          <strong className="font-semibold text-gray-900">{modo.frase}</strong>.
        </p>
        <p className="mt-3">Por segurança, sua exclusão está bloqueada para preservar os dados e históricos existentes.</p>
        <p className="mt-3">Se você não pretende mais utilizar essa propriedade, poderá optar pela inativação.</p>
      </>
    );
  }
  return (
    <>
      <p>A fazenda <Nome>{nome}</Nome> não será excluída nesta etapa.</p>
      <p className="mt-3">Por segurança, a exclusão física permanece bloqueada, mesmo sem subdivisões, para preservar os dados e históricos existentes.</p>
      <p className="mt-3">Se você não pretende mais utilizar essa propriedade, poderá optar pela inativação.</p>
    </>
  );
}

export default function FazendaListaAvisos({ aviso, enviando = false, onFechar, onConfirmar }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ultimo = useRef<AvisoListaFazenda | null>(null);
  if (aviso) ultimo.current = aviso;
  const atual = aviso ?? ultimo.current;
  const aberto = aviso != null;
  const excluir = atual?.tipo === "excluir";
  const reativar = atual?.tipo === "reativar";
  const corIcone = excluir ? "text-red-500" : reativar ? "text-[#16A34A]" : "text-[#D97706]";
  const icone = excluir ? "warning" : "info";
  const titulo = excluir
    ? "Não é possível excluir a fazenda"
    : reativar
      ? "Reativar fazenda"
      : "Inativar fazenda";
  const corBotao = reativar ? "#16A34A" : "#D97706";

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
                  <p>A fazenda <Nome>{atual.nome}</Nome> ficará inativa e deixará de estar disponível para novas operações.</p>
                  <p className="mt-3">Os cadastros e históricos vinculados serão preservados.</p>
                </>
              )}
              {atual?.tipo === "reativar" && (
                <>
                  <p>A fazenda <Nome>{atual.nome}</Nome> voltará a ficar ativa e poderá ser utilizada nas operações autorizadas do sistema.</p>
                  <p className="mt-3">Os cadastros e históricos existentes serão preservados.</p>
                </>
              )}
              {atual?.tipo === "excluir" && (
                <TextoExclusao nome={atual.nome} modo={modoExclusaoBloqueada(atual.blockers)} conferencia={atual.conferencia} />
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          {excluir ? (
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
                {enviando ? "Aguarde..." : reativar ? "Reativar" : "Inativar"}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
