import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import InsumosVisaoGeralDashboard from "@/components/insumos/InsumosVisaoGeralDashboard";
import InsumosMovimentacaoPanel from "@/components/insumos/InsumosMovimentacaoPanel";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";

type Props = { variant?: "overview" | "movimentacao" };

export default function InsumosVisaoGeralPage({ variant = "overview" }: Props) {
  const isOverview = variant === "overview";

  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery(undefined, {
    enabled: isOverview,
  });
  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);

  useEffect(() => {
    if (!isOverview || loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas, isOverview]);

  const onChangeFazenda = (value: string) => {
    setFazendaId(value);
    if (value) persistRebanhoFazendaId(value);
  };

  const { refetch: refetchEstoque } = trpc.estoque.list.useQuery(undefined, {
    enabled: isOverview,
  });
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

  return (
    <AppLayout>
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div ref={containerRef} className="w-full min-w-0">
        <InsumosVisaoGeralDashboard
          fazendaId={fazendaId}
          onChangeFazenda={onChangeFazenda}
          fazendas={fazendas}
        />
      </div>
    </AppLayout>
  );
}
