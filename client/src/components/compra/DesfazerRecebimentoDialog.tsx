import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AVISO_DESFAZER_RECEBIMENTO_CONSEQUENCIA,
  AVISO_DESFAZER_RECEBIMENTO_IRREVERSIVEL,
  MOTIVOS_ESTORNO_RECEBIMENTO_COMPRA,
  MOTIVO_ESTORNO_RECEBIMENTO_COMPRA_LABEL,
  isMotivoEstornoRecebimentoCompra,
  validarFormularioDesfazerRecebimento,
  type MotivoEstornoRecebimentoCompra,
} from "@shared/compraRecebimentoEstorno";
import {
  TEXTO_BOTAO_DESFAZENDO_RECEBIMENTO,
  TEXTO_BOTAO_DESFAZER_RECEBIMENTO,
  botaoDesfazerRecebimentoHabilitado,
  deveAceitarCliqueDesfazerRecebimento,
  montarPayloadDesfazerRecebimento,
  type PayloadDesfazerRecebimento,
} from "@/lib/compraRecebimentoDesfazer";

export type AlvoDesfazerRecebimento = {
  recebimentoId: number;
  brinco: string;
  grupoLabel: string;
};

type Props = {
  open: boolean;
  alvo: AlvoDesfazerRecebimento | null;
  submitting?: boolean;
  submitError?: string | null;
  onClose: () => void;
  onConfirm: (payload: PayloadDesfazerRecebimento) => void | Promise<void>;
};

export default function DesfazerRecebimentoDialog({
  open,
  alvo,
  submitting = false,
  submitError = null,
  onClose,
  onConfirm,
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [tocou, setTocou] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMotivo("");
    setObservacao("");
    setTocou(false);
  }, [open]);

  const validacao = validarFormularioDesfazerRecebimento({
    motivo: motivo || undefined,
    observacao,
  });
  const outro = motivo === "outro";
  const mostrarErro = tocou && !validacao.ok;
  const confirmarHabilitado = botaoDesfazerRecebimentoHabilitado({
    formularioValido: validacao.ok,
    pending: submitting,
  });
  const motivoLabel = isMotivoEstornoRecebimentoCompra(motivo)
    ? MOTIVO_ESTORNO_RECEBIMENTO_COMPRA_LABEL[motivo]
    : undefined;

  const confirmar = () => {
    if (!alvo || !validacao.ok) return;
    if (!deveAceitarCliqueDesfazerRecebimento({ formularioValido: true, pending: submitting })) {
      return;
    }
    void onConfirm(
      montarPayloadDesfazerRecebimento({
        recebimentoId: alvo.recebimentoId,
        motivo: validacao.motivo,
        observacao: validacao.observacao,
      }),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-xl border-gray-100"
        data-testid="desfazer-recebimento-dialog"
      >
        <DialogHeader className="px-4 pt-4 pb-2 pr-11 space-y-0 text-left bg-white border-b border-gray-100">
          <DialogTitle className="text-[15px] font-semibold text-gray-900 leading-tight">
            Desfazer recebimento
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 space-y-3">
          {alvo ? (
            <div>
              <p className="text-[13px] font-medium text-gray-800">Brinco {alvo.brinco}</p>
              <p className="text-[12px] text-gray-600">{alvo.grupoLabel}</p>
            </div>
          ) : null}

          <div className="space-y-1">
            <p className="text-[13px] text-gray-600 leading-relaxed">
              {AVISO_DESFAZER_RECEBIMENTO_CONSEQUENCIA}
            </p>
            <p className="text-[12px] text-gray-500">{AVISO_DESFAZER_RECEBIMENTO_IRREVERSIVEL}</p>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-gray-600">
              Motivo <span className="text-red-500">*</span>
            </label>
            <FormSelect
              variant="light"
              modal={false}
              value={motivo}
              displayValue={motivoLabel}
              onChange={v => {
                setMotivo(v);
                setTocou(true);
              }}
              placeholder="Selecionar"
              invalid={mostrarErro && !motivo}
              disabled={submitting}
              triggerClassName="rounded-md px-2.5 h-auto min-h-[34px]"
            >
              {MOTIVOS_ESTORNO_RECEBIMENTO_COMPRA.map(codigo => (
                <SelectItem key={codigo} value={codigo} className="text-[12px]">
                  {MOTIVO_ESTORNO_RECEBIMENTO_COMPRA_LABEL[codigo as MotivoEstornoRecebimentoCompra]}
                </SelectItem>
              ))}
            </FormSelect>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-gray-600">
              Observação{outro ? <span className="text-red-500"> *</span> : null}
            </label>
            <textarea
              value={observacao}
              onChange={e => {
                setObservacao(e.target.value);
                setTocou(true);
              }}
              placeholder={outro ? "Obrigatória para o motivo Outro" : "Opcional"}
              rows={3}
              disabled={submitting}
              className={cn(
                "border border-gray-200 rounded-md px-2.5 py-1.5 text-[12px] text-gray-700 bg-white w-full resize-y min-h-[72px] outline-none focus:border-[#4ECDC4] transition-colors placeholder:text-gray-400 disabled:bg-gray-50",
                mostrarErro && outro && !observacao.trim() ? "border-red-500" : null,
              )}
            />
          </div>

          {mostrarErro ? (
            <p className="text-[12px] text-red-600">{validacao.message}</p>
          ) : null}
          {submitError ? <p className="text-[12px] text-red-600">{submitError}</p> : null}
        </div>

        <DialogFooter className="border-t border-gray-100 px-4 py-2.5 bg-white sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!confirmarHabilitado}
            aria-disabled={!confirmarHabilitado}
            data-confirmar-habilitado={String(confirmarHabilitado)}
            className={
              confirmarHabilitado
                ? "inline-flex items-center justify-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                : "inline-flex items-center justify-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide border border-amber-100 bg-amber-50/50 text-amber-800/40 cursor-not-allowed"
            }
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                {TEXTO_BOTAO_DESFAZENDO_RECEBIMENTO}
              </>
            ) : (
              TEXTO_BOTAO_DESFAZER_RECEBIMENTO
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
