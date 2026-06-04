import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import InsumosMovimentacoesTable from "@/components/insumos/InsumosMovimentacoesTable";
import InsumosVisaoGeralDashboard from "@/components/insumos/InsumosVisaoGeralDashboard";
import InsumosMovimentacaoPanel from "@/components/insumos/InsumosMovimentacaoPanel";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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
  const { refetch: refetchEstoque } = trpc.estoque.list.useQuery();
  const { refetch: refetchMovimentacoes } = trpc.estoque.listMovimentacoes.useQuery();
  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([refetchEstoque(), refetchMovimentacoes()]);
      toast.success("Atualizado!");
    },
    enabled: true,
  });

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
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div
        ref={containerRef}
        className="overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
      {isOverview && <InsumosVisaoGeralDashboard />}

      <InsumosMovimentacoesTable
        title={isOverview ? "Últimas Movimentações" : "Movimentação"}
        exportFilename="movimentacoes-insumos"
        toolbar={toolbar}
      />
      </div>
    </AppLayout>
  );
}
