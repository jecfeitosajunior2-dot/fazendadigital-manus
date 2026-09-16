import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { defaultScaleTransportChoice, type ScaleTransport } from "@/lib/hardware/scaleTransport";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  bleSupported: boolean;
  onCancel: () => void;
  onConfirm: (transport: ScaleTransport) => void;
};

export function CurralBalancaTransportDialog({
  open,
  bleSupported,
  onCancel,
  onConfirm,
}: Props) {
  const [choice, setChoice] = useState<ScaleTransport>(() =>
    defaultScaleTransportChoice(bleSupported),
  );

  useEffect(() => {
    if (open) setChoice(defaultScaleTransportChoice(bleSupported));
  }, [bleSupported, open]);

  return (
    <Dialog open={open} onOpenChange={next => (!next ? onCancel() : undefined)}>
      <DialogContent className="max-w-sm gap-4 p-5" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-[16px]">Conectar Tru-Test S3</DialogTitle>
          <DialogDescription className="text-[12px]">
            Selecione a Tru-Test S3 (ex.: S3 120229). Bluetooth sem cabo é o recomendado no curral.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer",
              choice === "ble" ? "border-[#4ECDC4] bg-[#4ECDC4]/10" : "border-gray-200 bg-white",
              !bleSupported && "opacity-60 cursor-not-allowed",
            )}
          >
            <input
              type="radio"
              name="trutest-transport"
              className="mt-1"
              checked={choice === "ble"}
              disabled={!bleSupported}
              onChange={() => setChoice("ble")}
            />
            <span>
              <span className="block text-[13px] font-semibold text-gray-900">Bluetooth</span>
              <span className="block text-[11px] text-gray-500 mt-0.5">
                Sem cabo — recomendado para uso no curral.
              </span>
              {!bleSupported ? (
                <span className="block text-[11px] text-amber-700 mt-1">
                  Bluetooth não disponível neste navegador. Use USB.
                </span>
              ) : null}
            </span>
          </label>

          <label
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer",
              choice === "usb" ? "border-[#4ECDC4] bg-[#4ECDC4]/10" : "border-gray-200 bg-white",
            )}
          >
            <input
              type="radio"
              name="trutest-transport"
              className="mt-1"
              checked={choice === "usb"}
              onChange={() => setChoice("usb")}
            />
            <span>
              <span className="block text-[13px] font-semibold text-gray-900">USB</span>
              <span className="block text-[11px] text-gray-500 mt-0.5">
                Cabo USB — alternativa.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 min-h-[36px] hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={choice === "ble" && !bleSupported}
            onClick={() => onConfirm(choice)}
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-[12px] font-semibold text-gray-900 min-h-[36px] disabled:opacity-50"
            style={{ backgroundColor: "#4ECDC4" }}
          >
            Continuar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
