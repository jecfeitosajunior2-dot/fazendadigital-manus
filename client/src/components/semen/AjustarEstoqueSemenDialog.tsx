import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FD_PRIMARY,
  FormInput,
  FormLabel,
  FormNativeSelect,
  FormTextarea,
} from "@/components/FormFields";
import { formatCurrencyBrl } from "@/lib/utils";
import { formatMoedaBrlExcel } from "@shared/parseMoedaBr";
import {
  SEMEN_AJUSTE_MODO_AMBOS,
  SEMEN_AJUSTE_MODO_QUANTIDADE,
  SEMEN_AJUSTE_MODO_VALOR,
  SEMEN_AJUSTE_MODOS,
  SEMEN_AJUSTE_MOTIVO_OUTRO,
  SEMEN_AJUSTE_MOTIVOS,
  evaluateSemenAjusteEstoque,
  MSG_SEMEN_AJUSTE_CONFIRMACAO,
  MSG_SEMEN_AJUSTE_SEM_ALTERACAO,
  validateSemenAjusteMotivo,
} from "@shared/semenEstoqueAjuste";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export type SemenAjustePartidaAtual = {
  id: number;
  saldoDoses: number;
  custoUnitario: string | number | null;
  valorAtualEstoque: number;
};

type Props = {
  open: boolean;
  partida: SemenAjustePartidaAtual | null;
  onClose: () => void;
  onSuccess: (result: { partidaId: number }) => void;
};

function dosesLabel(n: number): string {
  return n === 1 ? "1 dose" : `${n} doses`;
}

export default function AjustarEstoqueSemenDialog({
  open,
  partida,
  onClose,
  onSuccess,
}: Props) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [modo, setModo] = useState("");
  const [saldoNovo, setSaldoNovo] = useState("");
  const [valorNovo, setValorNovo] = useState("");
  const [motivoCodigo, setMotivoCodigo] = useState("");
  const [motivoDescricao, setMotivoDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erroLocal, setErroLocal] = useState("");

  const ajustar = trpc.semen.ajustarEstoque.useMutation({
    onError: err => {
      setErroLocal(err.message);
      setStep("form");
    },
  });

  useEffect(() => {
    if (!open || !partida) return;
    setStep("form");
    setModo(SEMEN_AJUSTE_MODO_VALOR);
    setSaldoNovo(String(partida.saldoDoses));
    setValorNovo(formatMoedaBrlExcel(Number(partida.valorAtualEstoque) || 0));
    setMotivoCodigo("");
    setMotivoDescricao("");
    setObservacao("");
    setErroLocal("");
  }, [open, partida?.id]);

  const estado = useMemo(() => {
    if (!partida) return null;
    return evaluateSemenAjusteEstoque({
      saldoAtual: partida.saldoDoses,
      custoMedioAtual: partida.custoUnitario,
      valorAtual: partida.valorAtualEstoque,
      modo,
      saldoNovo: modo === SEMEN_AJUSTE_MODO_VALOR ? partida.saldoDoses : saldoNovo,
      valorNovo: modo === SEMEN_AJUSTE_MODO_QUANTIDADE ? undefined : valorNovo,
    });
  }, [partida, modo, saldoNovo, valorNovo]);

  const motivo = useMemo(
    () => validateSemenAjusteMotivo(motivoCodigo, motivoDescricao),
    [motivoCodigo, motivoDescricao],
  );

  const formValido = Boolean(estado?.ok && motivo.ok);

  const irParaConfirmacao = () => {
    if (!estado || !estado.ok) {
      setErroLocal(estado && !estado.ok ? estado.message : MSG_SEMEN_AJUSTE_SEM_ALTERACAO);
      return;
    }
    if (!motivo.ok) {
      setErroLocal(motivo.message);
      return;
    }
    setErroLocal("");
    setStep("confirm");
  };

  const confirmar = async () => {
    if (!partida || !estado?.ok || !motivo.ok || ajustar.isPending) return;
    await ajustar.mutateAsync({
      partidaId: partida.id,
      modo,
      saldoNovo:
        modo === SEMEN_AJUSTE_MODO_QUANTIDADE || modo === SEMEN_AJUSTE_MODO_AMBOS
          ? estado.value.saldoNovo
          : undefined,
      valorNovo:
        modo === SEMEN_AJUSTE_MODO_VALOR || modo === SEMEN_AJUSTE_MODO_AMBOS
          ? estado.value.valorNovo
          : undefined,
      motivoCodigo,
      motivoDescricao: motivoCodigo === SEMEN_AJUSTE_MOTIVO_OUTRO ? motivoDescricao.trim() : undefined,
      observacao: observacao.trim() || undefined,
    });
    toast.success("Ajuste de estoque registrado. O histórico anterior foi preservado.");
    onSuccess({ partidaId: partida.id });
  };

  if (!partida) return null;

  const showSaldo = modo === SEMEN_AJUSTE_MODO_QUANTIDADE || modo === SEMEN_AJUSTE_MODO_AMBOS;
  const showValor = modo === SEMEN_AJUSTE_MODO_VALOR || modo === SEMEN_AJUSTE_MODO_AMBOS;

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v && !ajustar.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden flex flex-col max-h-[min(36rem,calc(100dvh-2rem))]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 pr-12">
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            {step === "form" ? "Ajustar estoque" : "Confirmar ajuste"}
          </DialogTitle>
        </DialogHeader>

        {step === "form" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 space-y-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Estado atual
              </p>
              <ResumoLinha label="Saldo" value={dosesLabel(partida.saldoDoses)} />
              <ResumoLinha
                label="Custo médio"
                value={formatMoedaBrlExcel(Number(partida.custoUnitario) || 0)}
              />
              <ResumoLinha label="Valor atual" value={formatMoedaBrlExcel(Number(partida.valorAtualEstoque) || 0)} />
            </div>

            <div>
              <FormLabel required>Tipo de ajuste</FormLabel>
              <FormNativeSelect
                value={modo}
                onChange={setModo}
                placeholder="Selecione o tipo"
                modal={false}
                required
                options={SEMEN_AJUSTE_MODOS.map(m => ({ value: m.codigo, label: m.label }))}
              />
            </div>

            {showSaldo ? (
              <div>
                <FormLabel required>Novo saldo de doses</FormLabel>
                <FormInput
                  value={saldoNovo}
                  onChange={setSaldoNovo}
                  placeholder="Ex.: 5"
                  inputMode="numeric"
                  required
                />
              </div>
            ) : null}

            {showValor ? (
              <div>
                <FormLabel required>Novo valor atual do estoque</FormLabel>
                <FormInput
                  value={valorNovo}
                  onChange={v => setValorNovo(formatCurrencyBrl(v))}
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                  required
                />
              </div>
            ) : null}

            {estado?.ok ? (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-700 space-y-0.5">
                <p>
                  Novo custo médio: <strong>{formatMoedaBrlExcel(Number(estado.value.custoMedioNovo) || 0)}</strong>
                </p>
                <p>
                  Novo valor: <strong>{formatMoedaBrlExcel(estado.value.valorNovo)}</strong>
                  {" · "}
                  Novo saldo: <strong>{dosesLabel(estado.value.saldoNovo)}</strong>
                </p>
              </div>
            ) : null}

            <div>
              <FormLabel required>Motivo do ajuste</FormLabel>
              <FormNativeSelect
                value={motivoCodigo}
                onChange={codigo => {
                  setMotivoCodigo(codigo);
                  if (codigo !== SEMEN_AJUSTE_MOTIVO_OUTRO) setMotivoDescricao("");
                }}
                placeholder="Selecione o motivo"
                modal={false}
                required
                options={SEMEN_AJUSTE_MOTIVOS.map(m => ({ value: m.codigo, label: m.label }))}
              />
            </div>
            {motivoCodigo === SEMEN_AJUSTE_MOTIVO_OUTRO ? (
              <div>
                <FormLabel required>Descreva o motivo</FormLabel>
                <FormTextarea
                  value={motivoDescricao}
                  onChange={setMotivoDescricao}
                  placeholder="Informe o motivo do ajuste..."
                  rows={2}
                  required
                  className="min-h-[64px]"
                />
              </div>
            ) : null}

            <div>
              <FormLabel>Observação</FormLabel>
              <FormTextarea
                value={observacao}
                onChange={setObservacao}
                placeholder="Opcional — ex.: entrada de teste com valor que não correspondia à nota."
                rows={2}
                className="min-h-[64px]"
              />
            </div>

            {erroLocal ? (
              <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                {erroLocal}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 space-y-3">
            {estado?.ok ? (
              <>
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 space-y-1">
                  <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Estado atual
                  </p>
                  <ResumoLinha label="Saldo" value={dosesLabel(estado.value.saldoAnterior)} />
                  <ResumoLinha
                    label="Custo médio"
                    value={formatMoedaBrlExcel(Number(estado.value.custoMedioAnterior) || 0)}
                  />
                  <ResumoLinha label="Valor atual" value={formatMoedaBrlExcel(estado.value.valorAnterior)} />
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 space-y-1">
                  <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide mb-1.5">
                    Novo estado
                  </p>
                  <ResumoLinha label="Saldo" value={dosesLabel(estado.value.saldoNovo)} />
                  <ResumoLinha
                    label="Custo médio"
                    value={formatMoedaBrlExcel(Number(estado.value.custoMedioNovo) || 0)}
                  />
                  <ResumoLinha label="Valor atual" value={formatMoedaBrlExcel(estado.value.valorNovo)} />
                </div>
              </>
            ) : null}
            <p className="text-[13px] text-gray-600 leading-relaxed">{MSG_SEMEN_AJUSTE_CONFIRMACAO}</p>
            {erroLocal ? (
              <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                {erroLocal}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="shrink-0 flex-col border-t border-gray-100 px-6 py-4 gap-2 sm:flex-col sm:items-stretch sm:justify-end">
          {step === "form" && estado && !estado.ok && estado.message === MSG_SEMEN_AJUSTE_SEM_ALTERACAO ? (
            <p className="text-[11px] text-gray-500 text-left">{MSG_SEMEN_AJUSTE_SEM_ALTERACAO}</p>
          ) : null}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            {step === "form" ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={irParaConfirmacao}
                  disabled={!formValido}
                  className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50"
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Continuar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  disabled={ajustar.isPending}
                  className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmar()}
                  disabled={ajustar.isPending || !formValido}
                  className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50"
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  {ajustar.isPending ? "Salvando…" : "Confirmar ajuste"}
                </button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumoLinha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[12px]">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}
