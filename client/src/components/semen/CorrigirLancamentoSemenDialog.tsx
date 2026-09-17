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
  FormDatePicker,
  FormInput,
  FormLabel,
  FormNativeSelect,
  FormTextarea,
} from "@/components/FormFields";
import { formatDateBR } from "@/lib/date-utils";
import { semenEntradaModalLayout } from "@/lib/semenEntradaModalLayout";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import { toDateOnlyISO } from "@shared/carenciaAnimal";
import {
  calcSemenCustoUnitarioEntrada,
  formatSemenCustoTotalDisplay,
  parseSemenCustoTotal,
  parseSemenQuantidadeDoses,
} from "@shared/semenEstoque";
import {
  hasSemenCorrecaoAlteracaoReal,
  MSG_SEMEN_CORRECAO_CONSUMO,
  SEMEN_CORRECAO_MOTIVO_OUTRO,
  SEMEN_CORRECAO_MOTIVOS,
  validateSemenCorrecaoDados,
  validateSemenCorrecaoMotivo,
} from "@shared/semenEstoqueLedger";
import { SEMEN_OP_CORRIGIR_LANCAMENTO_TITULO } from "@shared/semenEstoqueOperacoes";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const correcaoCardCls =
  "rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden";
const correcaoCardHeadCls = "px-4 py-3 border-b border-gray-100";
const correcaoCardTitleCls = "text-[13px] font-semibold text-[#4ECDC4]";
const correcaoCardBodyCls = "p-4 space-y-3";

export type SemenLancamentoOriginal = {
  id: number;
  dataEntrada: string;
  quantidadeDoses: number;
  custoTotal: string | number;
  custoUnitario: string | number;
};

type Props = {
  open: boolean;
  original: SemenLancamentoOriginal | null;
  onClose: () => void;
  onSuccess: (result: { partidaId: number }) => void;
  onAjustarEstoque?: () => void;
};

export default function CorrigirLancamentoSemenDialog({
  open,
  original,
  onClose,
  onSuccess,
  onAjustarEstoque,
}: Props) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [quantidadeDoses, setQuantidadeDoses] = useState("");
  const [custoTotal, setCustoTotal] = useState("");
  const [dataEntrada, setDataEntrada] = useState(toDateOnlyISO(new Date()));
  const [motivoCodigo, setMotivoCodigo] = useState("");
  const [motivoDescricao, setMotivoDescricao] = useState("");
  const [erroLocal, setErroLocal] = useState("");

  const corrigir = trpc.semen.corrigirEntrada.useMutation({
    onError: err => {
      setErroLocal(err.message);
      setStep("form");
    },
  });

  useEffect(() => {
    if (!open || !original) return;
    setStep("form");
    setQuantidadeDoses(String(original.quantidadeDoses));
    setCustoTotal(formatSemenCustoTotalDisplay(original.custoTotal));
    setDataEntrada(original.dataEntrada);
    setMotivoCodigo("");
    setMotivoDescricao("");
    setErroLocal("");
  }, [open, original?.id]);

  const qtdNum = parseSemenQuantidadeDoses(quantidadeDoses);
  const custoNum = parseSemenCustoTotal(custoTotal);
  const custoPorDose =
    qtdNum != null && custoNum != null
      ? formatSemenCustoTotalDisplay(parseFloat(calcSemenCustoUnitarioEntrada(qtdNum, custoNum)))
      : "—";

  const alteracaoReal = useMemo(() => {
    if (!original) return false;
    return hasSemenCorrecaoAlteracaoReal(
      {
        quantidadeDoses: original.quantidadeDoses,
        custoTotal: original.custoTotal,
        dataEntrada: original.dataEntrada,
      },
      { quantidadeDoses, custoTotal, dataEntrada },
    );
  }, [original, quantidadeDoses, custoTotal, dataEntrada]);

  const formValido = useMemo(() => {
    const dados = validateSemenCorrecaoDados({ quantidadeDoses, custoTotal, dataEntrada });
    const motivo = validateSemenCorrecaoMotivo(motivoCodigo, motivoDescricao);
    return dados.ok && motivo.ok && alteracaoReal;
  }, [quantidadeDoses, custoTotal, dataEntrada, motivoCodigo, motivoDescricao, alteracaoReal]);

  const irParaConfirmacao = () => {
    const dados = validateSemenCorrecaoDados({ quantidadeDoses, custoTotal, dataEntrada });
    const motivo = validateSemenCorrecaoMotivo(motivoCodigo, motivoDescricao);
    if (!dados.ok) {
      setErroLocal(dados.message);
      return;
    }
    if (!motivo.ok) {
      setErroLocal(motivo.message);
      return;
    }
    if (!alteracaoReal) return;
    setErroLocal("");
    setStep("confirm");
  };

  const confirmar = async () => {
    if (!original || !formValido || !alteracaoReal || corrigir.isPending) return;
    const custoParsed = parseSemenCustoTotal(custoTotal);
    const qtdParsed = parseSemenQuantidadeDoses(quantidadeDoses);
    if (custoParsed == null || qtdParsed == null) return;
    const result = await corrigir.mutateAsync({
      movimentacaoId: original.id,
      quantidadeDoses: qtdParsed,
      custoTotal: custoParsed,
      dataEntrada,
      motivoCodigo,
      motivoDescricao: motivoCodigo === SEMEN_CORRECAO_MOTIVO_OUTRO ? motivoDescricao.trim() : undefined,
    });
    toast.success("Correção registrada. O lançamento original foi mantido no histórico.");
    onSuccess({ partidaId: result.partidaId });
  };

  if (!original) return null;

  const dosesOriginal =
    original.quantidadeDoses === 1 ? "1 dose" : `${original.quantidadeDoses} doses`;
  const dosesNovo = qtdNum === 1 ? "1 dose" : qtdNum != null ? `${qtdNum} doses` : "—";

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v && !corrigir.isPending) onClose();
      }}
    >
      <DialogContent
        className={cn(semenEntradaModalLayout.content, "max-h-[min(36rem,calc(100dvh-2rem))]")}
      >
        <div className={semenEntradaModalLayout.shell}>
          <DialogHeader className={semenEntradaModalLayout.header}>
            <DialogTitle className="text-[15px] font-semibold text-gray-900 leading-tight">
              {step === "form" ? SEMEN_OP_CORRIGIR_LANCAMENTO_TITULO : "Confirmar correção"}
            </DialogTitle>
          </DialogHeader>

          {step === "form" ? (
            <div className={cn(semenEntradaModalLayout.body, "space-y-3")}>
              <section className={correcaoCardCls}>
                <div className={correcaoCardHeadCls}>
                  <h3 className={correcaoCardTitleCls}>Lançamento original</h3>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ResumoCampo label="Data" value={formatDateBR(original.dataEntrada)} />
                  <ResumoCampo label="Quantidade" value={dosesOriginal} />
                  <ResumoCampo label="Custo/dose" value={formatSemenCustoTotalDisplay(original.custoUnitario)} />
                  <ResumoCampo label="Custo total" value={formatSemenCustoTotalDisplay(original.custoTotal)} />
                </div>
              </section>

              <section className={correcaoCardCls}>
                <div className={correcaoCardHeadCls}>
                  <h3 className={correcaoCardTitleCls}>Dados corrigidos</h3>
                </div>
                <div className={correcaoCardBodyCls}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FormLabel required className="mb-1">
                        Quantidade de doses
                      </FormLabel>
                      <FormInput
                        value={quantidadeDoses}
                        onChange={setQuantidadeDoses}
                        placeholder="Ex.: 8"
                        inputMode="numeric"
                        variant="light"
                        compact
                        required
                      />
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-[#F7F9FA] px-3 py-2 min-h-[58px] flex flex-col justify-center">
                      <ResumoCampo label="Custo/dose" value={custoPorDose} />
                    </div>
                  </div>
                  <div>
                    <FormLabel required className="mb-1">
                      Custo total (R$)
                    </FormLabel>
                    <FormInput
                      value={custoTotal}
                      onChange={v => setCustoTotal(formatCurrencyBrl(v))}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                      variant="light"
                      compact
                      required
                    />
                  </div>
                  <div>
                    <FormLabel required className="mb-1">
                      Data de entrada
                    </FormLabel>
                    <FormDatePicker
                      value={dataEntrada}
                      onChange={setDataEntrada}
                      max={toDateOnlyISO(new Date())}
                      variant="light"
                      required
                    />
                  </div>
                </div>
              </section>

              <section className={correcaoCardCls}>
                <div className={correcaoCardHeadCls}>
                  <h3 className={correcaoCardTitleCls}>Motivo</h3>
                </div>
                <div className={correcaoCardBodyCls}>
                  <div>
                    <FormLabel required className="mb-1">
                      Motivo da correção
                    </FormLabel>
                    <FormNativeSelect
                      value={motivoCodigo}
                      onChange={codigo => {
                        setMotivoCodigo(codigo);
                        if (codigo !== SEMEN_CORRECAO_MOTIVO_OUTRO) setMotivoDescricao("");
                      }}
                      placeholder="Selecione o motivo"
                      modal={false}
                      variant="light"
                      compact
                      required
                      options={SEMEN_CORRECAO_MOTIVOS.map(m => ({ value: m.codigo, label: m.label }))}
                    />
                  </div>
                  {motivoCodigo === SEMEN_CORRECAO_MOTIVO_OUTRO ? (
                    <div>
                      <FormLabel required className="mb-1">
                        Descreva o motivo
                      </FormLabel>
                      <FormTextarea
                        value={motivoDescricao}
                        onChange={setMotivoDescricao}
                        placeholder="Informe o motivo da correção..."
                        rows={2}
                        variant="light"
                        required
                        className="min-h-[64px]"
                      />
                    </div>
                  ) : null}
                </div>
              </section>

              <ErroCorrecao
                erroLocal={erroLocal}
                onAjustarEstoque={onAjustarEstoque}
              />
            </div>
          ) : (
            <div className={cn(semenEntradaModalLayout.body, "space-y-3")}>
              <section className={correcaoCardCls}>
                <div className={correcaoCardHeadCls}>
                  <h3 className={correcaoCardTitleCls}>Lançamento original</h3>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ResumoCampo label="Quantidade" value={dosesOriginal} />
                  <ResumoCampo label="Custo total" value={formatSemenCustoTotalDisplay(original.custoTotal)} />
                </div>
              </section>
              <section className={correcaoCardCls}>
                <div className={correcaoCardHeadCls}>
                  <h3 className={correcaoCardTitleCls}>Dados corrigidos</h3>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ResumoCampo label="Quantidade" value={dosesNovo} />
                  <ResumoCampo label="Custo total" value={formatSemenCustoTotalDisplay(custoNum)} />
                </div>
              </section>
              <p className="text-[12px] text-gray-600 leading-relaxed px-0.5">
                O lançamento original será mantido no histórico e uma correção auditável será registrada.
              </p>
              <ErroCorrecao
                erroLocal={erroLocal}
                onAjustarEstoque={onAjustarEstoque}
              />
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
                    disabled={corrigir.isPending}
                    className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmar()}
                    disabled={corrigir.isPending || !formValido}
                    className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50"
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    {corrigir.isPending ? "Salvando…" : "Confirmar correção"}
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

function ErroCorrecao({
  erroLocal,
  onAjustarEstoque,
}: {
  erroLocal: string;
  onAjustarEstoque?: () => void;
}) {
  if (!erroLocal) return null;
  return (
    <div className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 space-y-2">
      <p>{erroLocal}</p>
      {erroLocal === MSG_SEMEN_CORRECAO_CONSUMO && onAjustarEstoque ? (
        <button
          type="button"
          onClick={onAjustarEstoque}
          className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 underline underline-offset-2"
        >
          Ajustar estoque
        </button>
      ) : null}
    </div>
  );
}
