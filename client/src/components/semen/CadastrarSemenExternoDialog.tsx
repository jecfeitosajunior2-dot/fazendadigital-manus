import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FD_PRIMARY } from "@/components/FormFields";
import { trpc } from "@/lib/trpc";
import type { SemenReprodutorExternoCatalogoItem } from "@shared/semenReprodutorExternoCatalogo";

export const CADASTRAR_SEMEN_EXTERNO_TITULO = "Novo sêmen";
export const CADASTRAR_SEMEN_EXTERNO_HINT =
  "Cadastro reutilizável. Partida e custo ficam no manejo da inseminação.";
export const CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR = "Reprodutor / sêmen";
export const CADASTRAR_SEMEN_EXTERNO_LABEL_CENTRAL = "Central padrão";
export const CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_REPRODUTOR = "Ex.: ABS 1234";
export const CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_CENTRAL = "Ex.: Alta";

export type CadastrarSemenExternoSubmitInput = {
  reprodutorTexto: string;
  centralPadrao?: string;
};

export function canSaveCadastrarSemenExterno(reprodutorTexto: string): boolean {
  return Boolean(String(reprodutorTexto ?? "").trim());
}

/** Payload do modal: só identificação. Não envia observação. */
export function buildCadastrarSemenExternoSubmitInput(form: {
  reprodutorTexto: string;
  centralPadrao: string;
}): CadastrarSemenExternoSubmitInput {
  const payload: CadastrarSemenExternoSubmitInput = {
    reprodutorTexto: form.reprodutorTexto,
  };
  const central = String(form.centralPadrao ?? "").trim();
  if (central) payload.centralPadrao = central;
  return payload;
}

type CadastrarSemenExternoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fazendaId: number;
  /** Pós-sucesso por contexto: Manejo seleciona; Sêmen utilizado só fecha/toast. */
  onCreated: (item: SemenReprodutorExternoCatalogoItem) => void;
};

export function CadastrarSemenExternoDialog({
  open,
  onOpenChange,
  fazendaId,
  onCreated,
}: CadastrarSemenExternoDialogProps) {
  const trpcUtils = trpc.useUtils();
  const createCatalogoExterno = trpc.semen.createCatalogoExterno.useMutation();
  const [reprodutorTexto, setReprodutorTexto] = useState("");
  const [centralPadrao, setCentralPadrao] = useState("");
  const [erro, setErro] = useState("");
  const [existente, setExistente] = useState<SemenReprodutorExternoCatalogoItem | null>(null);

  const reset = () => {
    setReprodutorTexto("");
    setCentralPadrao("");
    setErro("");
    setExistente(null);
  };

  const fechar = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const usarExistente = () => {
    if (!existente) return;
    onCreated(existente);
    fechar(false);
  };

  const salvar = async () => {
    if (!canSaveCadastrarSemenExterno(reprodutorTexto) || fazendaId <= 0) return;
    setErro("");
    setExistente(null);
    try {
      const result = await createCatalogoExterno.mutateAsync({
        fazendaId,
        ...buildCadastrarSemenExternoSubmitInput({ reprodutorTexto, centralPadrao }),
      });
      if (result.status === "invalid") {
        setErro(result.message);
        return;
      }
      if (result.status === "already_exists") {
        setErro(result.message);
        setExistente(result.item);
        return;
      }
      await trpcUtils.semen.listCatalogoExternos.invalidate();
      onCreated(result.item);
      fechar(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível cadastrar o sêmen.");
    }
  };

  const pending = createCatalogoExterno.isPending;
  const fieldCls =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px]";
  const labelCls = "block text-[11px] font-medium text-gray-600 mb-0.5";

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{CADASTRAR_SEMEN_EXTERNO_TITULO}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {CADASTRAR_SEMEN_EXTERNO_HINT}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <div>
            <label className={labelCls}>
              {CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reprodutorTexto}
              onChange={e => {
                setReprodutorTexto(e.target.value);
                setExistente(null);
                setErro("");
              }}
              placeholder={CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_REPRODUTOR}
              className={fieldCls}
              maxLength={500}
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>{CADASTRAR_SEMEN_EXTERNO_LABEL_CENTRAL}</label>
            <input
              type="text"
              value={centralPadrao}
              onChange={e => setCentralPadrao(e.target.value)}
              placeholder={CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_CENTRAL}
              className={fieldCls}
              maxLength={150}
            />
          </div>
          {erro ? <p className="text-[12px] text-amber-700">{erro}</p> : null}
        </div>
        <DialogFooter className="gap-2">
          {existente ? (
            <button
              type="button"
              onClick={usarExistente}
              className="px-4 py-1.5 rounded text-[12px] font-semibold text-white min-h-[34px]"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              Usar {existente.reprodutorTexto}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fechar(false)}
                className="px-4 py-1.5 rounded text-[12px] font-semibold border border-gray-300 text-gray-600 min-h-[34px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void salvar()}
                disabled={pending || fazendaId <= 0 || !canSaveCadastrarSemenExterno(reprodutorTexto)}
                className="px-4 py-1.5 rounded text-[12px] font-semibold text-white min-h-[34px] disabled:opacity-50"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {pending ? "Salvando…" : "Salvar"}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CadastrarSemenExternoDialog as NovoSemenModal };
