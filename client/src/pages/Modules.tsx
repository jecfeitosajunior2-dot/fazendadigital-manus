import { ListPage } from "@/components/ListPage";
import { AppShell } from "@/components/AppShell";
import { SectionHeader, KpiCard } from "@/components/Editorial";
import { Button } from "@/components/ui/button";
import {
  ANIMALS,
  LOTS,
  MANAGEMENTS,
  SUPPLIES,
  FUEL,
  FINANCIAL_TX,
  REPORTS,
  SIMULATIONS,
} from "@/lib/data";
import { toast } from "sonner";
import { Plus, Sparkles } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  Tooltip,
  Legend,
} from "recharts";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const HERD_CARD =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/agrogestor_card_herd-NyWKNhw8eQCofcg6dzvg8a.webp";

export function RebanhoPage() {
  return (
    <ListPage
      kicker="Operação · Rebanho"
      title="Animais & lotes"
      subtitle="Cadastro de animais com identificação, categoria, lote, peso e último evento sanitário."
      metrics={[
        { label: "Total de animais", value: "4.218", delta: "+1,8%", trend: "up", hint: "12 meses" },
        { label: "Matrizes ativas", value: "1.064", delta: "+0,4%", trend: "up" },
        { label: "Bezerros ano", value: "738", delta: "+5,2%", trend: "up" },
        { label: "Animais p/ embarque", value: "318", delta: "-2,1%", trend: "down" },
      ]}
      filters={[
        { label: "Categoria", value: "Todas" },
        { label: "Lote", value: "Todos" },
        { label: "Status", value: "Ativos" },
      ]}
      primaryActionLabel="Cadastrar animal"
      columns={[
        { key: "tag", label: "Brinco" },
        { key: "category", label: "Categoria" },
        { key: "lot", label: "Lote" },
        { key: "weight", label: "Peso (kg)", align: "right" },
        { key: "lastEvent", label: "Último evento" },
        { key: "date", label: "Data" },
      ]}
      rows={ANIMALS}
    />
  );
}

export function LotesPage() {
  return (
    <ListPage
      kicker="Operação · Rebanho"
      title="Lotes & piquetes"
      subtitle="Agrupamentos por categoria, fase e área de manejo."
      metrics={[
        { label: "Lotes ativos", value: "18", delta: "+1", trend: "up" },
        { label: "Animais alocados", value: "4.218", delta: "+1,8%", trend: "up" },
        { label: "GMD médio", value: "0,742", delta: "+0,03", trend: "up", hint: "kg/dia" },
        { label: "Área ocupada", value: "1.486 ha", delta: "+24 ha", trend: "up" },
      ]}
      primaryActionLabel="Novo lote"
      columns={[
        { key: "id", label: "ID" },
        { key: "name", label: "Nome" },
        { key: "category", label: "Categoria" },
        { key: "animals", label: "Animais", align: "right" },
        { key: "gmd", label: "GMD", align: "right" },
        { key: "area", label: "Área (ha)", align: "right" },
        { key: "status", label: "Status" },
      ]}
      rows={LOTS}
    />
  );
}

export function ManejoPage() {
  return (
    <ListPage
      kicker="Operação · Manejo"
      title="Manejos & eventos"
      subtitle="Histórico de pesagens, vacinações, IATF, vermifugações e diagnósticos."
      metrics={[
        { label: "Manejos no mês", value: "62", delta: "+8", trend: "up" },
        { label: "Animais manejados", value: "2.184", delta: "+12%", trend: "up" },
        { label: "Cobertura sanitária", value: "98,4%", delta: "+0,6 p.p.", trend: "up" },
        { label: "Pendências", value: "5", delta: "-2", trend: "down" },
      ]}
      primaryActionLabel="Lançar manejo"
      columns={[
        { key: "id", label: "ID" },
        { key: "type", label: "Tipo" },
        { key: "lot", label: "Lote" },
        { key: "animals", label: "Animais", align: "right" },
        { key: "date", label: "Data" },
        { key: "responsible", label: "Responsável" },
      ]}
      rows={MANAGEMENTS}
    />
  );
}

export function ReproducaoPage() {
  const data = [
    { name: "Prenhas", value: 540, color: "var(--moss-deep)" },
    { name: "Vazias", value: 78, color: "var(--clay)" },
    { name: "Em IATF", value: 240, color: "var(--harvest)" },
  ];
  return (
    <AppShell
      kicker="Operação · Reprodução"
      title="Reprodução & estação"
      subtitle="Estoque biológico, exposições, IATF e safras."
      actions={
        <Button
          className="bg-[var(--moss-deep)] hover:bg-[var(--moss)] text-[var(--paper)]"
          onClick={() => toast("Nova estação de monta (placeholder)")}
        >
          <Plus className="w-4 h-4 mr-2" /> Nova estação
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 stagger">
        <KpiCard label="Matrizes expostas" value="858" delta="+24" trend="up" />
        <KpiCard label="Taxa de prenhez" value="87,4%" delta="+2,1 p.p." trend="up" />
        <KpiCard label="Intervalo entre partos" value="382 d" delta="-6 d" trend="down" />
        <KpiCard label="Bezerros desmamados" value="496" delta="+12%" trend="up" />
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <div className="surface-card p-5">
          <SectionHeader kicker="Distribuição" title="Status reprodutivo" />
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="surface-card p-5 flex flex-col">
          <SectionHeader kicker="Eficiência" title="Indicadores reprodutivos" />
          <ResponsiveContainer width="100%" height={260}>
            <RadialBarChart
              innerRadius="35%"
              outerRadius="100%"
              data={[
                { name: "Concepção", value: 72, fill: "var(--moss-deep)" },
                { name: "Parição", value: 88, fill: "var(--harvest)" },
                { name: "Desmama", value: 91, fill: "var(--bark-soft)" },
              ]}
              startAngle={180}
              endAngle={0}
            >
              <RadialBar background dataKey="value" cornerRadius={6} />
              <Tooltip />
              <Legend />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppShell>
  );
}

export function NutricaoPage() {
  return (
    <AppShell
      kicker="Operação · Nutrição"
      title="Fórmulas & batidas"
      subtitle="Lançamentos nutricionais, fórmulas e batidas por lote."
      actions={
        <Button
          className="bg-[var(--moss-deep)] hover:bg-[var(--moss)] text-[var(--paper)]"
          onClick={() => toast("Nova fórmula (placeholder)")}
        >
          <Plus className="w-4 h-4 mr-2" /> Nova fórmula
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 stagger">
        <KpiCard label="Fórmulas ativas" value="14" delta="+1" trend="up" />
        <KpiCard label="Batidas no mês" value="86" delta="+12" trend="up" />
        <KpiCard label="Custo R$/cab/dia" value="3,84" delta="-0,12" trend="down" />
        <KpiCard label="Conversão alimentar" value="6,8" delta="-0,3" trend="down" hint="kg MS/kg PV" />
      </div>

      <SectionHeader kicker="Cardápio" title="Fórmulas em uso" />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {[
          { name: "Engorda Confinamento 110d", lots: 2, cost: 4.92, ms: "12,4 kg" },
          { name: "Recria Pasto Suplementado", lots: 4, cost: 2.18, ms: "5,8 kg" },
          { name: "Mineralização Matrizes", lots: 3, cost: 0.62, ms: "120 g" },
          { name: "Bezerros Desmama", lots: 1, cost: 3.4, ms: "4,2 kg" },
          { name: "Touros Estação", lots: 1, cost: 2.85, ms: "6,1 kg" },
          { name: "Manutenção Seca", lots: 5, cost: 1.95, ms: "4,9 kg" },
        ].map((f) => (
          <div key={f.name} className="surface-card hoverable p-5">
            <p className="kicker mb-2">Fórmula</p>
            <p className="font-display text-lg leading-tight mb-4">{f.name}</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Lotes</p>
                <p className="font-mono text-base">{f.lots}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">R$/cab/dia</p>
                <p className="font-mono text-base">{f.cost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">MS</p>
                <p className="font-mono text-base">{f.ms}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

export function InsumosPage() {
  return (
    <ListPage
      kicker="Operação · Insumos"
      title="Estoque de insumos"
      subtitle="Produtos sanitários, nutricionais e operacionais com saldo e mínimo."
      metrics={[
        { label: "SKUs ativos", value: "184", delta: "+4", trend: "up" },
        { label: "Itens críticos", value: "6", delta: "-2", trend: "down" },
        { label: "Movimentações 30d", value: "412", delta: "+18%", trend: "up" },
        { label: "Valor em estoque", value: "R$ 318k", delta: "+R$ 22k", trend: "up" },
      ]}
      filters={[
        { label: "Categoria", value: "Todas" },
        { label: "Estoque", value: "Todos" },
      ]}
      primaryActionLabel="Cadastrar produto"
      columns={[
        { key: "sku", label: "SKU" },
        { key: "name", label: "Produto" },
        { key: "category", label: "Categoria" },
        { key: "stock", label: "Saldo", align: "right" },
        { key: "unit", label: "UM" },
        { key: "min", label: "Mínimo", align: "right" },
      ]}
      rows={SUPPLIES}
    />
  );
}

export function MaquinarioPage() {
  return (
    <ListPage
      kicker="Operação · Maquinário"
      title="Frota & abastecimentos"
      subtitle="Tratores, caminhões e implementos com horímetro e abastecimentos."
      metrics={[
        { label: "Equipamentos", value: "23", delta: "+1", trend: "up" },
        { label: "Litros no mês", value: "4.820", delta: "+6%", trend: "up" },
        { label: "Custo combustível", value: "R$ 29,5k", delta: "-2,8%", trend: "down" },
        { label: "Manutenções abertas", value: "4", delta: "-1", trend: "down" },
      ]}
      primaryActionLabel="Lançar abastecimento"
      columns={[
        { key: "date", label: "Data" },
        { key: "asset", label: "Equipamento" },
        { key: "liters", label: "Litros", align: "right" },
        { key: "price", label: "R$/L", align: "right", render: (r) => r.price.toFixed(2) },
        { key: "total", label: "Total", align: "right", render: (r) => brl(r.total) },
        { key: "hours", label: "Horas", align: "right" },
      ]}
      rows={FUEL}
    />
  );
}

export function ComercialPage() {
  const sales = [
    { id: "V-208", date: "12/05", buyer: "Frigorífico Sul", animals: 86, weight: 522, price: 312.4, total: 14012345 / 100 },
    { id: "V-209", date: "06/05", buyer: "Pecuarista Vizinho", animals: 42, weight: 198, price: 0, total: 184500 },
    { id: "V-210", date: "02/05", buyer: "Leilão Online", animals: 28, weight: 412, price: 305.0, total: 351780 },
  ];
  return (
    <ListPage
      kicker="Comercial"
      title="Compra & Venda"
      subtitle="Borderôs de compra, entrada de animais e vendas no período."
      metrics={[
        { label: "Vendas no mês", value: "12", delta: "+3", trend: "up" },
        { label: "Cabeças vendidas", value: "284", delta: "+18%", trend: "up" },
        { label: "Receita acumulada", value: "R$ 1,32 mi", delta: "+12%", trend: "up" },
        { label: "Preço médio @", value: "R$ 308,40", delta: "+1,4%", trend: "up" },
      ]}
      primaryActionLabel="Novo borderô"
      columns={[
        { key: "id", label: "ID" },
        { key: "date", label: "Data" },
        { key: "buyer", label: "Comprador" },
        { key: "animals", label: "Animais", align: "right" },
        { key: "weight", label: "Peso médio", align: "right" },
        { key: "price", label: "R$/@", align: "right", render: (r) => r.price.toFixed(2) },
        { key: "total", label: "Total", align: "right", render: (r) => brl(r.total) },
      ]}
      rows={sales}
    />
  );
}

export function FinanceiroPage() {
  return (
    <ListPage
      kicker="Comercial · Financeiro"
      title="Lançamentos financeiros"
      subtitle="Contas, lançamentos, rateio de custos e receitas vs. despesas."
      metrics={[
        { label: "Receitas (30d)", value: "R$ 1,32 mi", delta: "+12%", trend: "up" },
        { label: "Despesas (30d)", value: "R$ 740k", delta: "+3,1%", trend: "up" },
        { label: "Resultado", value: "R$ 580k", delta: "+22%", trend: "up" },
        { label: "Margem operacional", value: "31,2%", delta: "+1,4 p.p.", trend: "up" },
      ]}
      filters={[
        { label: "Conta", value: "Todas" },
        { label: "Categoria", value: "Todas" },
        { label: "Tipo", value: "Todos" },
      ]}
      primaryActionLabel="Novo lançamento"
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
  );
}

export function RelatoriosPage() {
  return (
    <AppShell
      kicker="Inteligência"
      title="Relatórios"
      subtitle="Gerenciais, evolutivos, reprodutivos e operacionais — exportáveis em PDF e XLSX."
      actions={
        <Button
          className="bg-[var(--moss-deep)] hover:bg-[var(--moss)] text-[var(--paper)]"
          onClick={() => toast("Novo relatório customizado (placeholder)")}
        >
          <Plus className="w-4 h-4 mr-2" /> Relatório customizado
        </Button>
      }
    >
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {REPORTS.map((r) => (
          <div key={r.name} className="surface-card hoverable p-5">
            <p className="kicker mb-2">{r.category}</p>
            <p className="font-display text-lg leading-tight mb-3">{r.name}</p>
            <p className="text-xs text-muted-foreground mb-4">
              Última execução: {r.lastRun} · Formatos: {r.format}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                onClick={() => toast.success("Relatório aberto (demonstração)")}
              >
                Visualizar
              </Button>
              <Button
                size="sm"
                className="bg-[var(--bark)] text-[var(--paper)] hover:bg-[var(--bark-soft)]"
                onClick={() => toast.success("Exportação iniciada")}
              >
                Exportar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

export function SimulacoesPage() {
  return (
    <AppShell
      kicker="Inteligência"
      title="Simulações"
      subtitle="Cenários de engorda, custo e ROI por lote para apoiar a tomada de decisão."
      actions={
        <Button
          className="bg-[var(--moss-deep)] hover:bg-[var(--moss)] text-[var(--paper)]"
          onClick={() => toast("Nova simulação (placeholder)")}
        >
          <Sparkles className="w-4 h-4 mr-2" /> Nova simulação
        </Button>
      }
    >
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {SIMULATIONS.map((s) => (
          <div key={s.id} className="surface-card hoverable p-6 flex flex-col gap-3 relative overflow-hidden">
            <img
              src={HERD_CARD}
              alt=""
              aria-hidden
              className="absolute -top-6 -right-10 w-40 opacity-20 pointer-events-none"
            />
            <p className="kicker">Cenário {s.id}</p>
            <p className="font-display text-lg leading-tight">{s.name}</p>
            <div className="grid grid-cols-2 gap-3 text-sm mt-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Animais</p>
                <p className="font-mono text-base">{s.animals}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Dias</p>
                <p className="font-mono text-base">{s.days}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">GMD proj.</p>
                <p className="font-mono text-base">{s.projectedGmd.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Margem</p>
                <p className="font-mono text-base text-[var(--moss-deep)]">
                  {(s.projectedMargin * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                onClick={() => toast.success("Cenário aberto")}
              >
                Abrir cenário
              </Button>
              <Button
                size="sm"
                className="bg-[var(--bark)] text-[var(--paper)] hover:bg-[var(--bark-soft)]"
                onClick={() => toast.success("Cenário duplicado")}
              >
                Duplicar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

export function ConfiguracoesPage() {
  return (
    <AppShell
      kicker="Sistema"
      title="Configurações"
      subtitle="Fazendas, usuários, permissões e preferências da conta."
    >
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="surface-card p-6">
          <SectionHeader kicker="Fazendas" title="Fazendas cadastradas" />
          <ul className="divide-y divide-border">
            {[
              { name: "Fazenda Boa Esperança", city: "Uberaba/MG", role: "Administrador" },
              { name: "Fazenda São Mateus", city: "Rondonópolis/MT", role: "Operador" },
              { name: "Fazenda Recanto", city: "Araguaína/TO", role: "Visualizador" },
            ].map((f) => (
              <li key={f.name} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{f.city}</p>
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{f.role}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card p-6">
          <SectionHeader kicker="Usuários" title="Equipe & permissões" />
          <ul className="divide-y divide-border">
            {[
              { name: "Paulo Nogueira", role: "Administrador", email: "paulo@boaesperanca.com" },
              { name: "Carla Mendes", role: "Operador de campo", email: "carla@boaesperanca.com" },
              { name: "Renato Almeida", role: "Veterinário", email: "renato@boaesperanca.com" },
              { name: "Lucas Ribeiro", role: "Financeiro", email: "lucas@boaesperanca.com" },
            ].map((u) => (
              <li key={u.email} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{u.role}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card p-6">
          <SectionHeader kicker="Preferências" title="Conta & exibição" />
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Moeda</span>
              <span>BRL — Real brasileiro</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fuso horário</span>
              <span>America/São Paulo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Idioma</span>
              <span>Português (BR)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plano</span>
              <span>Pro · Anual</span>
            </div>
          </div>
        </div>

        <div className="surface-card p-6">
          <SectionHeader kicker="Integrações" title="Conectores disponíveis" />
          <ul className="space-y-3 text-sm">
            {[
              { name: "Open Banking", status: "Conectado" },
              { name: "Importação OFX", status: "Disponível" },
              { name: "Balanças eletrônicas", status: "Disponível" },
              { name: "Coletor RFID de brincos", status: "Em breve" },
            ].map((i) => (
              <li key={i.name} className="flex items-center justify-between">
                <span>{i.name}</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{i.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
