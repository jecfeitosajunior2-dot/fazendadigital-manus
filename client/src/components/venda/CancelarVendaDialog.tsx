import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void | Promise<void>;
  submitting?: boolean;
  submitError?: string | null;
};

export default function CancelarVendaDialog({
  open,
  onClose,
  onConfirm,
  submitting = false,
  submitError = null,
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [erroLocal, setErroLocal] = useState("");

  useEffect(() => {
    if (!open) return;
    setMotivo("");
    setErroLocal("");
  }, [open]);

  const confirmar = async () => {
    const texto = motivo.trim();
    if (!texto) {
      setErroLocal("Informe o motivo do cancelamento.");
      return;
    }
    await onConfirm(texto);
  };

  const motivoValido = motivo.trim().length > 0;
  const podeConfirmar = motivoValido && !submitting;
  const erroExibido = erroLocal || submitError;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            Cancelar venda
          </DialogTitle>
        </DialogHeader>

        <p className="text-[13px] text-gray-600 leading-relaxed">
          O cancelamento devolverá os animais desta venda ao rebanho e manterá o histórico da
          operação.
        </p>

        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-gray-600">
            Motivo do cancelamento <span className="text-red-500">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={e => {
              setMotivo(e.target.value);
              setErroLocal("");
            }}
            placeholder="Informe o motivo"
            rows={3}
            maxLength={255}
            className="border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full resize-y min-h-[72px] disabled:bg-gray-50"
            disabled={submitting}
          />
        </div>

        {erroExibido ? <p className="text-[12px] text-red-600">{erroExibido}</p> : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex items-center px-3 min-h-[36px] rounded-lg border border-gray-200 bg-white text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => { void confirmar(); }}
            disabled={!podeConfirmar}
            className={
              podeConfirmar
                ? "inline-flex items-center px-3 min-h-[36px] rounded-lg border border-amber-200 bg-amber-50 text-[12px] font-semibold text-amber-800 hover:bg-amber-100"
                : "inline-flex items-center px-3 min-h-[36px] rounded-lg border border-amber-100 bg-amber-50/50 text-[12px] font-semibold text-amber-800/40 cursor-not-allowed"
            }
          >
            {submitting ? "Cancelando..." : "Confirmar cancelamento"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
