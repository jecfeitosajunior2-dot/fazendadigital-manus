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
import { cn, formatCurrencyBrl } from "@/lib/utils";
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
import { SEMEN_OP_AJUSTAR_ESTOQUE_TITULO } from "@shared/semenEstoqueOperacoes";
import { semenEntradaModalLayout } from "@/lib/semenEntradaModalLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ajusteCardCls =
  "rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden";
const ajusteCardHeadCls = "px-4 py-3 border-b border-gray-100";
const ajusteCardTitleCls = "text-[13px] font-semibold text-[#4ECDC4]";
const ajusteCardBodyCls = "p-4 space-y-3";

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
      <DialogContent
        className={cn(semenEntradaModalLayout.content, "max-h-[min(36rem,calc(100dvh-2rem))]")}
      >
        <div className={semenEntradaModalLayout.shell}>
          <DialogHeader className={semenEntradaModalLayout.header}>
            <DialogTitle className="text-[15px] font-semibold text-gray-900 leading-tight">
              {step === "form" ? SEMEN_OP_AJUSTAR_ESTOQUE_TITULO : "Confirmar ajuste"}
            </DialogTitle>
          </DialogHeader>

          {step === "form" ? (
            <div className={cn(semenEntradaModalLayout.body, "space-y-3")}>
              <section className={ajusteCardCls}>
                <div className={ajusteCardHeadCls}>
                  <h3 className={ajusteCardTitleCls}>Estado atual</h3>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ResumoCampo label="Saldo" value={dosesLabel(partida.saldoDoses)} />
                  <ResumoCampo
                    label="Custo médio"
                    value={formatMoedaBrlExcel(Number(partida.custoUnitario) || 0)}
                  />
                  <ResumoCampo
                    label="Valor atual"
                    value={formatMoedaBrlExcel(Number(partida.valorAtualEstoque) || 0)}
                  />
                </div>
              </section>

              <section className={ajusteCardCls}>
                <div className={ajusteCardHeadCls}>
                  <h3 className={ajusteCardTitleCls}>Ajuste</h3>
                </div>
                <div className={ajusteCardBodyCls}>
                  <div>
                    <FormLabel required className="mb-1">
                      Tipo de ajuste
                    </FormLabel>
                    <FormNativeSelect
                      value={modo}
                      onChange={setModo}
                      placeholder="Selecione o tipo"
                      modal={false}
                      variant="light"
                      compact
                      required
                      options={SEMEN_AJUSTE_MODOS.map(m => ({ value: m.codigo, label: m.label }))}
                    />
                  </div>

                  {showSaldo ? (
                    <div>
                      <FormLabel required className="mb-1">
                        Novo saldo de doses
                      </FormLabel>
                      <FormInput
                        value={saldoNovo}
                        onChange={setSaldoNovo}
                        placeholder="Ex.: 5"
                        inputMode="numeric"
                        variant="light"
                        compact
                        required
                      />
                    </div>
                  ) : null}

                  {showValor ? (
                    <div>
                      <FormLabel required className="mb-1">
                        Novo valor atual do estoque
                      </FormLabel>
                      <FormInput
                        value={valorNovo}
                        onChange={v => setValorNovo(formatCurrencyBrl(v))}
                        placeholder="R$ 0,00"
                        inputMode="decimal"
                        variant="light"
                        compact
                        required
                      />
                    </div>
                  ) : null}

                  {estado?.ok ? (
                    <div className="rounded-xl border border-gray-100 bg-[#F7F9FA] px-3 py-2.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <ResumoCampo label="Novo saldo" value={dosesLabel(estado.value.saldoNovo)} />
                      <ResumoCampo
                        label="Novo custo médio"
                        value={formatMoedaBrlExcel(Number(estado.value.custoMedioNovo) || 0)}
                      />
                      <ResumoCampo
                        label="Novo valor"
                        value={formatMoedaBrlExcel(estado.value.valorNovo)}
                      />
                    </div>
                  ) : null}
                </div>
              </section>

              <section className={ajusteCardCls}>
                <div className={ajusteCardHeadCls}>
                  <h3 className={ajusteCardTitleCls}>Motivo</h3>
                </div>
                <div className={ajusteCardBodyCls}>
                  <div>
                    <FormLabel required className="mb-1">
                      Motivo do ajuste
                    </FormLabel>
                    <FormNativeSelect
                      value={motivoCodigo}
                      onChange={codigo => {
                        setMotivoCodigo(codigo);
                        if (codigo !== SEMEN_AJUSTE_MOTIVO_OUTRO) setMotivoDescricao("");
                      }}
                      placeholder="Selecione o motivo"
                      modal={false}
                      variant="light"
                      compact
                      required
                      options={SEMEN_AJUSTE_MOTIVOS.map(m => ({ value: m.codigo, label: m.label }))}
                    />
                  </div>
                  {motivoCodigo === SEMEN_AJUSTE_MOTIVO_OUTRO ? (
                    <div>
                      <FormLabel required className="mb-1">
                        Descreva o motivo
                      </FormLabel>
                      <FormTextarea
                        value={motivoDescricao}
                        onChange={setMotivoDescricao}
                        placeholder="Informe o motivo do ajuste..."
                        rows={2}
                        variant="light"
                        required
                        className="min-h-[64px]"
                      />
                    </div>
                  ) : null}
                  <div>
                    <FormLabel className="mb-1">Observação</FormLabel>
                    <FormTextarea
                      value={observacao}
                      onChange={setObservacao}
                      placeholder="Opcional — ex.: entrada de teste com valor que não correspondia à nota."
                      rows={2}
                      variant="light"
                      className="min-h-[64px]"
                    />
                  </div>
                </div>
              </section>

              {erroLocal ? (
                <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {erroLocal}
                </p>
              ) : null}
            </div>
          ) : (
            <div className={cn(semenEntradaModalLayout.body, "space-y-3")}>
              {estado?.ok ? (
                <>
                  <section className={ajusteCardCls}>
                    <div className={ajusteCardHeadCls}>
                      <h3 className={ajusteCardTitleCls}>Estado atual</h3>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <ResumoCampo label="Saldo" value={dosesLabel(estado.value.saldoAnterior)} />
                      <ResumoCampo
                        label="Custo médio"
                        value={formatMoedaBrlExcel(Number(estado.value.custoMedioAnterior) || 0)}
                      />
                      <ResumoCampo
                        label="Valor atual"
                        value={formatMoedaBrlExcel(estado.value.valorAnterior)}
                      />
                    </div>
                  </section>
                  <section className={ajusteCardCls}>
                    <div className={ajusteCardHeadCls}>
                      <h3 className={ajusteCardTitleCls}>Novo estado</h3>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <ResumoCampo label="Saldo" value={dosesLabel(estado.value.saldoNovo)} />
                      <ResumoCampo
                        label="Custo médio"
                        value={formatMoedaBrlExcel(Number(estado.value.custoMedioNovo) || 0)}
                      />
                      <ResumoCampo
                        label="Valor atual"
                        value={formatMoedaBrlExcel(estado.value.valorNovo)}
                      />
                    </div>
                  </section>
                </>
              ) : null}
              <p className="text-[12px] text-gray-600 leading-relaxed px-0.5">
                {MSG_SEMEN_AJUSTE_CONFIRMACAO}
              </p>
              {erroLocal ? (
                <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {erroLocal}
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter className={cn(semenEntradaModalLayout.footer, "flex-col gap-2 sm:flex-col sm:items-stretch sm:justify-end")}>
            <div className={semenEntradaModalLayout.footerActions}>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResumoCampo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-gray-900 break-words">{value}</p>
    </div>
  );
}
