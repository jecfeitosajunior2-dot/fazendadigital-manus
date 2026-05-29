import { AppShell } from "@/components/AppShell";
import { KpiCard, SectionHeader, DenseTable } from "@/components/Editorial";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { KPIS, HERD_EVOLUTION, FINANCIAL_FLOW, MANAGEMENTS, FINANCIAL_TX } from "@/lib/data";
import { toast } from "sonner";

const HERO_BG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/agrogestor_hero-GCsAMDbqxkYgwbM83xZheQ.webp";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function Dashboard() {
  return (
    <AppShell
      kicker="Edição · Maio · 2026"
      title="Painel da fazenda"
      subtitle="Indicadores consolidados de rebanho, reprodução, nutrição e financeiro com leitura editorial."
      actions={
        <>
          <Button
            variant="outline"
            className="bg-card"
            onClick={() => toast.success("Relatório gerado (demonstração)")}
          >
            <Download className="w-4 h-4 mr-2" /> Exportar
          </Button>
          <Button
            className="bg-[var(--moss-deep)] hover:bg-[var(--moss)] text-[var(--paper)]"
            onClick={() => toast("Novo manejo (placeholder)")}
          >
            <Plus className="w-4 h-4 mr-2" /> Novo manejo
          </Button>
        </>
      }
    >
      {/* HERO */}
      <div className="surface-card overflow-hidden mb-8 relative">
        <div className="grid md:grid-cols-[1.4fr_1fr]">
          <div className="p-8 md:p-10 relative z-10">
            <p className="kicker mb-3">Reportagem do mês</p>
            <h2 className="font-display text-3xl md:text-4xl leading-[1.05] mb-3 max-w-xl">
              4.218 cabeças sob manejo, 87% de prenhez e margem em alta.
            </h2>
            <p className="text-sm md:text-[15px] text-muted-foreground max-w-xl">
              A Fazenda Boa Esperança fechou o mês com ganho de produtividade no confinamento e queda no
              custo da arroba. Veja abaixo os números, manejos recentes e movimentações financeiras.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="bg-card"
                onClick={() => toast("Abrir relatório gerencial (placeholder)")}
              >
                Ler relatório completo
              </Button>
              <Button
                className="bg-[var(--bark)] text-[var(--paper)] hover:bg-[var(--bark-soft)]"
                onClick={() => toast("Cenário de simulação aberto (placeholder)")}
              >
                Simular cenário
              </Button>
            </div>
          </div>
          <div className="relative min-h-[220px]">
            <img src={HERO_BG} alt="Vista da fazenda" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--card)] via-transparent to-transparent" />
          </div>
        </div>
      </div>

      {/* KPIS */}
      <SectionHeader kicker="Indicadores" title="Pulso operacional" description="Métricas-chave dos últimos 30 dias com comparativo." />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-10 stagger">
        {KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* GRÁFICOS */}
      <div className="grid lg:grid-cols-2 gap-6 mb-10">
        <div className="surface-card p-5">
          <SectionHeader kicker="Rebanho" title="Evolução de cabeças & GMD" />
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={HERD_EVOLUTION} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="moss" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--moss)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--moss)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklch, var(--bark) 12%, transparent)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontFamily: "var(--font-sans)",
                }}
              />
              <Area
                type="monotone"
                dataKey="cabecas"
                name="Cabeças"
                stroke="var(--moss-deep)"
                strokeWidth={2}
                fill="url(#moss)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="surface-card p-5">
          <SectionHeader kicker="Financeiro" title="Receitas vs. despesas" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={FINANCIAL_FLOW} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklch, var(--bark) 12%, transparent)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v: number) => brl(v)}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Bar dataKey="receita" name="Receita" fill="var(--moss-deep)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesa" name="Despesa" fill="var(--clay)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABELAS */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <SectionHeader kicker="Operação" title="Manejos recentes" description="Últimos manejos sanitários e reprodutivos." />
          <DenseTable
            columns={[
              { key: "id", label: "ID" },
              { key: "type", label: "Tipo" },
              { key: "lot", label: "Lote" },
              { key: "animals", label: "Animais", align: "right" },
              { key: "date", label: "Data" },
            ]}
            rows={MANAGEMENTS}
          />
        </div>
        <div>
          <SectionHeader kicker="Financeiro" title="Lançamentos" description="Movimentações registradas no período." />
          <DenseTable
            columns={[
              { key: "date", label: "Data" },
              { key: "description", label: "Descrição" },
              { key: "category", label: "Categoria" },
              {
                key: "value",
                label: "Valor",
                align: "right",
                render: (r) => (
                  <span className={r.type === "C" ? "text-[var(--moss-deep)]" : "text-[var(--clay)]"}>
                    {brl(r.value)}
                  </span>
                ),
              },
            ]}
            rows={FINANCIAL_TX}
          />
        </div>
      </div>
    </AppShell>
  );
}
