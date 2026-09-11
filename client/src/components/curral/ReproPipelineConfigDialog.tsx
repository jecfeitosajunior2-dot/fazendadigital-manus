import { FormCard } from "@/components/FormCard";
import {
  FD_PRIMARY,
  FormInput,
  FormLabel,
  formCheckboxCls,
} from "@/components/FormFields";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import type { ReproPipelineConfig } from "@shared/reproPipeline";
import { DEFAULT_REPRO_PIPELINE_CONFIG } from "@shared/reproPipeline";
import { mergeReproPipelineConfig } from "@shared/reproPipelineConfig";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type Props = {
  fazendaId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const LIMITES = {
  diasParaDgAposInseminacao: { min: 15, max: 120 },
  diasParaDgAposMonta: { min: 30, max: 180 },
  maxTentativasIatfAntesMonta: { min: 1, max: 10 },
} as const;

function parseCampoNumerico(
  raw: string,
  fallback: number,
  limit: { min: number; max: number },
): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(limit.max, Math.max(limit.min, Math.round(n)));
}

export function ReproPipelineConfigDialog({ fazendaId, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const { data: configRemota, isLoading } = trpc.reproducao.getPipelineConfig.useQuery(
    { fazendaId },
    { enabled: open && fazendaId > 0 },
  );

  const [form, setForm] = useState<ReproPipelineConfig>(DEFAULT_REPRO_PIPELINE_CONFIG);

  useEffect(() => {
    if (configRemota) setForm(configRemota);
  }, [configRemota]);

  useEffect(() => {
    if (!open) setForm(configRemota ?? DEFAULT_REPRO_PIPELINE_CONFIG);
  }, [open, configRemota]);

  const saveMutation = trpc.reproducao.updatePipelineConfig.useMutation({
    onSuccess: async () => {
      toast.success("Parâmetros reprodutivos salvos.");
      await utils.reproducao.getPipelineConfig.invalidate({ fazendaId });
      onOpenChange(false);
    },
    onError: err => toast.error(err.message || "Não foi possível salvar os parâmetros."),
  });

  const pending = saveMutation.isPending;

  const salvar = (e?: FormEvent) => {
    e?.preventDefault();
    saveMutation.mutate({
      fazendaId,
      config: mergeReproPipelineConfig(form),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next && !pending) onOpenChange(false);
      }}
    >
      <DialogContent
        className={[
          "w-[calc(100%-2rem)] sm:max-w-md p-0 gap-0 overflow-hidden",
          "!flex !flex-col min-h-0 max-h-[min(88dvh,36rem)]",
          "border-gray-200 shadow-xl bg-[#F7F9FA]",
          "[&_[data-slot=dialog-close]]:right-3.5 [&_[data-slot=dialog-close]]:top-3.5",
        ].join(" ")}
        data-repro-pipeline-modal
      >
        <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3.5 pr-11">
          <h2
            className="text-[18px] font-semibold text-gray-900 leading-tight"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Parâmetros reprodutivos
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-500 leading-relaxed">
            Configuração desta fazenda — prazos para alertas de DG no curral e na ficha da
            matriz.
          </p>
        </div>

        <form onSubmit={salvar} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
            {isLoading ? (
              <FormCard compact title="Carregando">
                <p className="text-[11px] text-gray-500">Carregando parâmetros…</p>
              </FormCard>
            ) : (
              <>
                <FormCard compact title="Diagnóstico de prenhez (DG)">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FormLabel>DG após inseminação (dias)</FormLabel>
                      <FormInput
                        variant="light"
                        type="number"
                        inputMode="numeric"
                        min={LIMITES.diasParaDgAposInseminacao.min}
                        max={LIMITES.diasParaDgAposInseminacao.max}
                        value={String(form.diasParaDgAposInseminacao)}
                        onChange={v =>
                          setForm(prev => ({
                            ...prev,
                            diasParaDgAposInseminacao: parseCampoNumerico(
                              v,
                              prev.diasParaDgAposInseminacao,
                              LIMITES.diasParaDgAposInseminacao,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <FormLabel>DG após monta (dias)</FormLabel>
                      <FormInput
                        variant="light"
                        type="number"
                        inputMode="numeric"
                        min={LIMITES.diasParaDgAposMonta.min}
                        max={LIMITES.diasParaDgAposMonta.max}
                        value={String(form.diasParaDgAposMonta)}
                        onChange={v =>
                          setForm(prev => ({
                            ...prev,
                            diasParaDgAposMonta: parseCampoNumerico(
                              v,
                              prev.diasParaDgAposMonta,
                              LIMITES.diasParaDgAposMonta,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Sugestão inicial do sistema:{" "}
                    <span className="font-semibold text-gray-600">
                      {DEFAULT_REPRO_PIPELINE_CONFIG.diasParaDgAposInseminacao}
                    </span>{" "}
                    dias (IATF) ·{" "}
                    <span className="font-semibold text-gray-600">
                      {DEFAULT_REPRO_PIPELINE_CONFIG.diasParaDgAposMonta}
                    </span>{" "}
                    dias (monta)
                  </p>
                </FormCard>

                <FormCard compact title="IATF e monta">
                  <div>
                    <FormLabel>Máx. IATF antes de monta</FormLabel>
                    <FormInput
                      variant="light"
                      type="number"
                      inputMode="numeric"
                      min={LIMITES.maxTentativasIatfAntesMonta.min}
                      max={LIMITES.maxTentativasIatfAntesMonta.max}
                      value={String(form.maxTentativasIatfAntesMonta)}
                      onChange={v =>
                        setForm(prev => ({
                          ...prev,
                          maxTentativasIatfAntesMonta: parseCampoNumerico(
                            v,
                            prev.maxTentativasIatfAntesMonta,
                            LIMITES.maxTentativasIatfAntesMonta,
                          ),
                        }))
                      }
                    />
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Alerta quando a matriz ultrapassar este limite antes da monta natural.
                  </p>
                </FormCard>

                <FormCard compact title="Alertas">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.sugerirDescarteAposMontaVazia}
                      onChange={e =>
                        setForm(prev => ({
                          ...prev,
                          sugerirDescarteAposMontaVazia: e.target.checked,
                        }))
                      }
                      className={formCheckboxCls}
                    />
                    <span className="text-[12px] text-gray-700 leading-snug pt-0.5">
                      Sugerir revisão de descarte após DG vazia pós-monta
                    </span>
                  </label>
                </FormCard>
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || isLoading}
              className="inline-flex items-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {pending ? "Salvando…" : "Salvar parâmetros"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
