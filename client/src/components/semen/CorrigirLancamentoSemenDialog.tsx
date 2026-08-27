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
import { formatCurrencyBrl } from "@/lib/utils";
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
  MSG_SEMEN_CORRECAO_SEM_ALTERACAO,
  SEMEN_CORRECAO_MOTIVO_OUTRO,
  SEMEN_CORRECAO_MOTIVOS,
  validateSemenCorrecaoDados,
  validateSemenCorrecaoMotivo,
} from "@shared/semenEstoqueLedger";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v && !corrigir.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden flex flex-col max-h-[min(36rem,calc(100dvh-2rem))]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 pr-12">
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            {step === "form" ? "Corrigir lançamento" : "Confirmar correção"}
          </DialogTitle>
        </DialogHeader>

        {step === "form" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 space-y-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Lançamento original
              </p>
              <ResumoLinha label="Data" value={formatDateBR(original.dataEntrada)} />
              <ResumoLinha
                label="Quantidade"
                value={
                  original.quantidadeDoses === 1
                    ? "1 dose"
                    : `${original.quantidadeDoses} doses`
                }
              />
              <ResumoLinha label="Custo total" value={formatSemenCustoTotalDisplay(original.custoTotal)} />
              <ResumoLinha label="Custo/dose" value={formatSemenCustoTotalDisplay(original.custoUnitario)} />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Dados corrigidos
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FormLabel required>Quantidade de doses</FormLabel>
                  <FormInput
                    value={quantidadeDoses}
                    onChange={setQuantidadeDoses}
                    placeholder="Ex.: 8"
                    inputMode="numeric"
                    required
                  />
                </div>
                <div>
                  <FormLabel required>Custo total (R$)</FormLabel>
                  <FormInput
                    value={custoTotal}
                    onChange={v => setCustoTotal(formatCurrencyBrl(v))}
                    placeholder="R$ 0,00"
                    inputMode="decimal"
                    required
                  />
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-700 mt-3">
                Custo por dose calculado: <strong>{custoPorDose}</strong>
              </div>
              <div className="mt-3">
                <FormLabel required>Data de entrada</FormLabel>
                <FormDatePicker
                  value={dataEntrada}
                  onChange={setDataEntrada}
                  max={toDateOnlyISO(new Date())}
                  required
                />
              </div>
            </div>

            <div>
              <FormLabel required>Motivo da correção</FormLabel>
              <FormNativeSelect
                value={motivoCodigo}
                onChange={codigo => {
                  setMotivoCodigo(codigo);
                  if (codigo !== SEMEN_CORRECAO_MOTIVO_OUTRO) setMotivoDescricao("");
                }}
                placeholder="Selecione o motivo"
                modal={false}
                required
                options={SEMEN_CORRECAO_MOTIVOS.map(m => ({ value: m.codigo, label: m.label }))}
              />
            </div>
            {motivoCodigo === SEMEN_CORRECAO_MOTIVO_OUTRO ? (
              <div>
                <FormLabel required>Descreva o motivo</FormLabel>
                <FormTextarea
                  value={motivoDescricao}
                  onChange={setMotivoDescricao}
                  placeholder="Informe o motivo da correção..."
                  rows={2}
                  required
                  className="min-h-[64px]"
                />
              </div>
            ) : null}

            {erroLocal ? (
              <div className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2 space-y-2">
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
            ) : null}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 space-y-3">
            <p className="text-[13px] text-gray-700">
              Original: {original.quantidadeDoses} doses — {formatSemenCustoTotalDisplay(original.custoTotal)}
            </p>
            <p className="text-[13px] text-gray-700">
              Novo: {qtdNum} doses — {formatSemenCustoTotalDisplay(custoNum)}
            </p>
            <p className="text-[13px] text-gray-600 leading-relaxed">
              O lançamento original será mantido no histórico e uma correção auditável será registrada.
            </p>
            {erroLocal ? (
              <div className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2 space-y-2">
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
            ) : null}
          </div>
        )}

        <DialogFooter className="shrink-0 flex-col border-t border-gray-100 px-6 py-4 gap-2 sm:flex-col sm:items-stretch sm:justify-end">
          {step === "form" && !alteracaoReal ? (
            <p className="text-[11px] text-gray-500 text-left">{MSG_SEMEN_CORRECAO_SEM_ALTERACAO}</p>
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
