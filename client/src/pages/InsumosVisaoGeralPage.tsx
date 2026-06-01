import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import InsumosMovimentacoesTable from "@/components/insumos/InsumosMovimentacoesTable";
import InsumosMonitoradoPanels from "@/components/insumos/InsumosMonitoradoPanels";
import InsumosMovimentacaoPanel from "@/components/insumos/InsumosMovimentacaoPanel";

const FD_PRIMARY = "#4ECDC4";

type Props = { variant?: "overview" | "movimentacao" };

function MovimentacaoToolbar({ onNova, onCadastrar }: { onNova: () => void; onCadastrar: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onNova}
        className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide border border-gray-300 bg-[#E8E8E8] text-gray-800 hover:bg-gray-200 transition-colors"
      >
        Nova Movimentação
      </button>
      <button
        type="button"
        onClick={onCadastrar}
        className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:opacity-90 transition-opacity"
        style={{ backgroundColor: FD_PRIMARY }}
      >
        Cadastrar Produto
      </button>
    </>
  );
}

export default function InsumosVisaoGeralPage({ variant = "overview" }: Props) {
  const [, setLocation] = useLocation();
  const isOverview = variant === "overview";

  if (variant === "movimentacao") {
    return (
      <AppLayout>
        <InsumosMovimentacaoPanel />
      </AppLayout>
    );
  }

  const toolbar = (
    <MovimentacaoToolbar
      onNova={() => setLocation("/insumos/nova-movimentacao")}
      onCadastrar={() => setLocation("/insumos/cadastro")}
    />
  );

  return (
    <AppLayout>
      {isOverview && (
        <div
          className="mb-4 px-4 py-2.5 text-[12px] text-white text-center leading-snug rounded"
          style={{ backgroundColor: "#F5A623" }}
        >
          Cadastre produtos e registre movimentações para controlar entradas e saídas do estoque da fazenda.
        </div>
      )}

      {isOverview && <InsumosMonitoradoPanels />}

      <InsumosMovimentacoesTable
        title={isOverview ? "Últimas Movimentações" : "Movimentação"}
        exportFilename="movimentacoes-insumos"
        toolbar={toolbar}
      />
    </AppLayout>
  );
}
