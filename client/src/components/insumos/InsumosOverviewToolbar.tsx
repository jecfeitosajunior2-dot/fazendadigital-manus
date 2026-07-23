import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TEAL = "#4ECDC4";

type Props = {
  hasProdutos: boolean;
  onListaProdutos: () => void;
  onMovimentacao: () => void;
  onNovaMovimentacao: () => void;
};

const btnBase =
  "px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide transition-colors";

const btnPrimary = `${btnBase} text-white hover:opacity-90`;
const btnSecondary = `${btnBase} border border-gray-300 bg-[#E8E8E8] text-gray-800 hover:bg-gray-200`;
const btnDisabled = `${btnBase} border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed`;

export default function InsumosOverviewToolbar({
  hasProdutos,
  onListaProdutos,
  onMovimentacao,
  onNovaMovimentacao,
}: Props) {
  if (!hasProdutos) {
    const movBtn = (
      <button type="button" disabled className={btnDisabled}>
        Ir para Movimentação
      </button>
    );

    return (
      <>
        <button
          type="button"
          onClick={onListaProdutos}
          className={btnPrimary}
          style={{ backgroundColor: TEAL }}
        >
          Ir para Lista de Produtos
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{movBtn}</span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="max-w-[260px] text-[11px] leading-relaxed">
            Cadastre um produto antes de registrar movimentações.
          </TooltipContent>
        </Tooltip>
      </>
    );
  }

  const novaBtn = (
    <button
      type="button"
      onClick={onNovaMovimentacao}
      className={btnSecondary}
      title="Atalho — gestão completa em Movimentação"
    >
      Nova Movimentação
    </button>
  );

  return (
    <>
      {novaBtn}
      <button type="button" onClick={onMovimentacao} className={btnSecondary}>
        Ver Movimentação
      </button>
      <button type="button" onClick={onListaProdutos} className={btnSecondary}>
        Lista de Produtos
      </button>
    </>
  );
}
