/**
 * Card de seleção de fazenda — padrão iRancho (Novo Lote)
 */
import { trpc } from "@/lib/trpc";
import { FormLabel, FormNativeSelect } from "@/components/FormFields";

const IRANCHO_BTN_GREEN = "#C5D97E";

type Props = {
  title?: string;
  value: string;
  onChange: (fazendaId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  isBusy?: boolean;
  className?: string;
};

export default function SelecaoFazendaCard({
  title = "Selecionar fazenda",
  value,
  onChange,
  onConfirm,
  onCancel,
  confirmLabel = "Continuar",
  cancelLabel = "Cancelar",
  isBusy = false,
  className = "max-w-lg mx-auto",
}: Props) {
  const { data: fazendas = [], isLoading } = trpc.fazendas.list.useQuery();

  const handleConfirm = () => {
    if (!value) return;
    onConfirm();
  };

  return (
    <div className={className}>
      <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h1 className="text-[15px] font-semibold text-gray-900">{title}</h1>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <FormLabel required>Fazenda</FormLabel>
            {isLoading ? (
              <p className="text-[12px] text-gray-400 py-2">Carregando fazendas...</p>
            ) : fazendas.length === 0 ? (
              <p className="text-[12px] text-gray-500 py-2">
                Nenhuma fazenda cadastrada. Cadastre uma fazenda antes de continuar.
              </p>
            ) : (
              <FormNativeSelect
                value={value}
                onChange={onChange}
                placeholder="Selecione uma fazenda"
                required
                options={fazendas.map(f => ({ value: String(f.id), label: f.nome }))}
              />
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50 transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isBusy || !value || fazendas.length === 0}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: IRANCHO_BTN_GREEN }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
