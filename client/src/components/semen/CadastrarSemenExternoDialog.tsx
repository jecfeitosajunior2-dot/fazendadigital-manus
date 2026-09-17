import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FD_PRIMARY, FormLabel } from "@/components/FormFields";
import {
  SEMEN_ENTRADA_FIELD_LIGHT,
  semenEntradaModalLayout,
} from "@/lib/semenEntradaModalLayout";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type { SemenReprodutorExternoCatalogoItem } from "@shared/semenReprodutorExternoCatalogo";

export const CADASTRAR_SEMEN_EXTERNO_TITULO = "Novo Reprodutor";
export const CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR = "Reprodutor";
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
  /** Pré-preenche o nome ao abrir (ex.: texto digitado na Nova entrada). */
  initialReprodutorTexto?: string;
  /** Pós-sucesso por contexto: Manejo seleciona; Sêmen utilizado só fecha/toast. */
  onCreated: (item: SemenReprodutorExternoCatalogoItem) => void;
};

export function CadastrarSemenExternoDialog({
  open,
  onOpenChange,
  fazendaId,
  initialReprodutorTexto,
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

  useEffect(() => {
    if (!open) return;
    setReprodutorTexto(String(initialReprodutorTexto ?? "").trim());
    setCentralPadrao("");
    setErro("");
    setExistente(null);
  }, [open, initialReprodutorTexto]);

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

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className={cn(semenEntradaModalLayout.content, "max-h-[min(28rem,calc(100dvh-2rem))]")}>
        <div className={semenEntradaModalLayout.shell}>
          <DialogHeader className={semenEntradaModalLayout.header}>
            <DialogTitle className="text-[15px] font-semibold text-gray-900 leading-tight">
              {CADASTRAR_SEMEN_EXTERNO_TITULO}
            </DialogTitle>
          </DialogHeader>

          <div className={cn(semenEntradaModalLayout.body, "space-y-3")}>
            <section className={semenEntradaModalLayout.opCard}>
              <div className={semenEntradaModalLayout.opCardHead}>
                <h3 className={semenEntradaModalLayout.opCardTitle}>Reprodutor</h3>
              </div>
              <div className={semenEntradaModalLayout.opCardBody}>
                <div>
                  <FormLabel required className="mb-1">
                    {CADASTRAR_SEMEN_EXTERNO_LABEL_REPRODUTOR}
                  </FormLabel>
                  <input
                    type="text"
                    value={reprodutorTexto}
                    onChange={e => {
                      setReprodutorTexto(e.target.value);
                      setExistente(null);
                      setErro("");
                    }}
                    placeholder={CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_REPRODUTOR}
                    className={SEMEN_ENTRADA_FIELD_LIGHT}
                    maxLength={500}
                    autoFocus
                  />
                </div>
                <div>
                  <FormLabel className="mb-1">{CADASTRAR_SEMEN_EXTERNO_LABEL_CENTRAL}</FormLabel>
                  <input
                    type="text"
                    value={centralPadrao}
                    onChange={e => setCentralPadrao(e.target.value)}
                    placeholder={CADASTRAR_SEMEN_EXTERNO_PLACEHOLDER_CENTRAL}
                    className={SEMEN_ENTRADA_FIELD_LIGHT}
                    maxLength={150}
                  />
                </div>
                {erro ? <p className="text-[12px] text-amber-700">{erro}</p> : null}
              </div>
            </section>
          </div>

          <div className={semenEntradaModalLayout.footer}>
            <div className={semenEntradaModalLayout.footerActions}>
              {existente ? (
                <button
                  type="button"
                  onClick={usarExistente}
                  className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800"
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Usar {existente.reprodutorTexto}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => fechar(false)}
                    className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void salvar()}
                    disabled={pending || fazendaId <= 0 || !canSaveCadastrarSemenExterno(reprodutorTexto)}
                    className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50"
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    {pending ? "Salvando…" : "Salvar"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { CadastrarSemenExternoDialog as NovoSemenModal };
