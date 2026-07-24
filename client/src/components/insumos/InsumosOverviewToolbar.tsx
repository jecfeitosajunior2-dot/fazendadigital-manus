type Props = {
  onNovaMovimentacao: () => void;
  onVerTodas: () => void;
};

const btnBase =
  "px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide transition-colors";

const btnPrimary = `${btnBase} text-white hover:opacity-90`;
const btnSecondary = `${btnBase} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`;

const TEAL = "#4ECDC4";

export default function InsumosOverviewToolbar({ onNovaMovimentacao, onVerTodas }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onNovaMovimentacao}
        className={btnPrimary}
        style={{ backgroundColor: TEAL }}
      >
        Nova Movimentação
      </button>
      <button type="button" onClick={onVerTodas} className={btnSecondary}>
        Ver todas as movimentações
      </button>
    </div>
  );
}
