import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import InsumosMovimentacoesTable from "@/components/insumos/InsumosMovimentacoesTable";
import InsumosVisaoGeralDashboard from "@/components/insumos/InsumosVisaoGeralDashboard";
import InsumosMovimentacaoPanel from "@/components/insumos/InsumosMovimentacaoPanel";
import InsumosOverviewToolbar from "@/components/insumos/InsumosOverviewToolbar";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Props = { variant?: "overview" | "movimentacao" };

export default function InsumosVisaoGeralPage({ variant = "overview" }: Props) {
  const [, setLocation] = useLocation();
  const isOverview = variant === "overview";
  const { data: produtos = [], refetch: refetchEstoque } = trpc.estoque.list.useQuery(undefined, {
    enabled: isOverview,
  });
  const hasProdutos = produtos.some(p => p.situacao !== "inativo");
  const { refetch: refetchMovimentacoes } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    enabled: isOverview,
  });
  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([refetchEstoque(), refetchMovimentacoes()]);
      toast.success("Atualizado!");
    },
    enabled: isOverview,
  });

  if (variant === "movimentacao") {
    return (
      <AppLayout>
        <InsumosMovimentacaoPanel />
      </AppLayout>
    );
  }

  const toolbar = (
    <InsumosOverviewToolbar
      hasProdutos={hasProdutos}
      onListaProdutos={() => setLocation("/insumos/lista-produtos")}
      onMovimentacao={() => setLocation("/insumos/movimentacao")}
      onNovaMovimentacao={() => setLocation("/insumos/nova-movimentacao")}
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
        <InsumosVisaoGeralDashboard />

        {hasProdutos && (
          <InsumosMovimentacoesTable
            title="Últimas Movimentações"
            exportFilename="movimentacoes-insumos"
            toolbar={toolbar}
            variant="overview"
            hasProdutos={hasProdutos}
          />
        )}
      </div>
    </AppLayout>
  );
}
