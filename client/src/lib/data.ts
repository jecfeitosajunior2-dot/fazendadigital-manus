import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Beef,
  Workflow,
  Wheat,
  Boxes,
  Tractor,
  Repeat,
  ShoppingBasket,
  Wallet,
  BarChart3,
  Sparkles,
  Settings,
} from "lucide-react";

export type ModuleKey =
  | "overview"
  | "rebanho"
  | "manejo"
  | "reproducao"
  | "nutricao"
  | "insumos"
  | "maquinario"
  | "compra-venda"
  | "financeiro"
  | "relatorios"
  | "simulacoes"
  | "configuracoes";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  group: "Operação" | "Comercial" | "Inteligência" | "Sistema";
  description: string;
}

export const MODULES: ModuleDef[] = [
  {
    key: "overview",
    label: "Painel",
    path: "/painel",
    icon: LayoutDashboard,
    group: "Operação",
    description: "Visão geral da fazenda: rebanho, GMD, financeiro e alertas.",
  },
  {
    key: "rebanho",
    label: "Rebanho",
    path: "/rebanho",
    icon: Beef,
    group: "Operação",
    description: "Cadastro de animais, lotes e mapa do rebanho.",
  },
  {
    key: "manejo",
    label: "Manejo",
    path: "/manejo",
    icon: Workflow,
    group: "Operação",
    description: "Manejos sanitários, reprodutivos e de pesagem.",
  },
  {
    key: "reproducao",
    label: "Reprodução",
    path: "/reproducao",
    icon: Repeat,
    group: "Operação",
    description: "Estoque biológico, exposições, IATF e safras.",
  },
  {
    key: "nutricao",
    label: "Nutrição",
    path: "/nutricao",
    icon: Wheat,
    group: "Operação",
    description: "Fórmulas, batidas e lançamentos nutricionais.",
  },
  {
    key: "insumos",
    label: "Insumos",
    path: "/insumos",
    icon: Boxes,
    group: "Operação",
    description: "Estoque de insumos, produtos e movimentações.",
  },
  {
    key: "maquinario",
    label: "Maquinário",
    path: "/maquinario",
    icon: Tractor,
    group: "Operação",
    description: "Frota, abastecimentos e manutenções.",
  },
  {
    key: "compra-venda",
    label: "Compra & Venda",
    path: "/comercial",
    icon: ShoppingBasket,
    group: "Comercial",
    description: "Borderôs de compra, entrada de animais e vendas.",
  },
  {
    key: "financeiro",
    label: "Financeiro",
    path: "/financeiro",
    icon: Wallet,
    group: "Comercial",
    description: "Contas, lançamentos, rateio e receitas vs. despesas.",
  },
  {
    key: "relatorios",
    label: "Relatórios",
    path: "/relatorios",
    icon: BarChart3,
    group: "Inteligência",
    description: "Gerenciais, evolutivos, reprodutivos e operacionais.",
  },
  {
    key: "simulacoes",
    label: "Simulações",
    path: "/simulacoes",
    icon: Sparkles,
    group: "Inteligência",
    description: "Cenários de engorda, custo e ROI por lote.",
  },
  {
    key: "configuracoes",
    label: "Configurações",
    path: "/configuracoes",
    icon: Settings,
    group: "Sistema",
    description: "Fazendas, usuários, permissões e preferências.",
  },
];

export const FARMS = [
  { id: "f-001", name: "Fazenda Boa Esperança", city: "Uberaba/MG", area: 1840, currency: "BRL" },
  { id: "f-002", name: "Fazenda São Mateus", city: "Rondonópolis/MT", area: 3270, currency: "BRL" },
  { id: "f-003", name: "Fazenda Recanto", city: "Araguaína/TO", area: 920, currency: "BRL" },
];

export const KPIS = [
  { label: "Cabeças no rebanho", value: "4.218", delta: "+1,8%", trend: "up" as const, hint: "vs. mês anterior" },
  { label: "GMD médio (kg/dia)", value: "0,742", delta: "+0,03", trend: "up" as const, hint: "últimos 30 dias" },
  { label: "Taxa de prenhez", value: "87,4%", delta: "+2,1 p.p.", trend: "up" as const, hint: "estação 2025/26" },
  { label: "Mortalidade", value: "0,6%", delta: "-0,2 p.p.", trend: "down" as const, hint: "12 meses" },
  { label: "Custo arroba (R$)", value: "248,90", delta: "-3,1%", trend: "down" as const, hint: "fechamento parcial" },
  { label: "Margem operacional", value: "31,2%", delta: "+1,4 p.p.", trend: "up" as const, hint: "trimestre" },
];

export const HERD_EVOLUTION = [
  { month: "Jun", cabecas: 3820, gmd: 0.69 },
  { month: "Jul", cabecas: 3905, gmd: 0.7 },
  { month: "Ago", cabecas: 3980, gmd: 0.71 },
  { month: "Set", cabecas: 4060, gmd: 0.72 },
  { month: "Out", cabecas: 4128, gmd: 0.73 },
  { month: "Nov", cabecas: 4180, gmd: 0.74 },
  { month: "Dez", cabecas: 4218, gmd: 0.74 },
];

export const FINANCIAL_FLOW = [
  { month: "Jun", receita: 920000, despesa: 612000 },
  { month: "Jul", receita: 880000, despesa: 598000 },
  { month: "Ago", receita: 1010000, despesa: 645000 },
  { month: "Set", receita: 970000, despesa: 660000 },
  { month: "Out", receita: 1180000, despesa: 702000 },
  { month: "Nov", receita: 1240000, despesa: 715000 },
  { month: "Dez", receita: 1320000, despesa: 740000 },
];

export const LOTS = [
  { id: "L-014", name: "Recria Norte", category: "Recria", animals: 412, gmd: 0.78, area: 142, status: "Ativo" },
  { id: "L-021", name: "Engorda Confinamento", category: "Engorda", animals: 318, gmd: 1.21, area: 18, status: "Ativo" },
  { id: "L-033", name: "Matrizes Estação", category: "Cria", animals: 540, gmd: 0.42, area: 320, status: "Ativo" },
  { id: "L-045", name: "Bezerros 2025", category: "Cria", animals: 268, gmd: 0.66, area: 96, status: "Ativo" },
  { id: "L-052", name: "Reposição Sul", category: "Recria", animals: 196, gmd: 0.74, area: 88, status: "Ativo" },
  { id: "L-060", name: "Touros", category: "Reprodutor", animals: 24, gmd: 0.18, area: 12, status: "Ativo" },
];

export const ANIMALS = [
  { tag: "BR-00481", category: "Matriz", lot: "Matrizes Estação", weight: 482, lastEvent: "Diagnóstico de prenhez", date: "12/05" },
  { tag: "BR-00497", category: "Bezerro", lot: "Bezerros 2025", weight: 168, lastEvent: "Vacinação Aftosa", date: "10/05" },
  { tag: "BR-00512", category: "Novilha", lot: "Recria Norte", weight: 312, lastEvent: "Pesagem", date: "08/05" },
  { tag: "BR-00528", category: "Boi", lot: "Engorda Confinamento", weight: 498, lastEvent: "Embarque parcial", date: "06/05" },
  { tag: "BR-00541", category: "Touro", lot: "Touros", weight: 812, lastEvent: "Andrológico", date: "02/05" },
  { tag: "BR-00553", category: "Novilha", lot: "Reposição Sul", weight: 298, lastEvent: "IATF", date: "29/04" },
];

export const MANAGEMENTS = [
  { id: "M-1043", type: "Vacinação Aftosa", lot: "Recria Norte", animals: 412, date: "12/05/2026", responsible: "Carla Mendes" },
  { id: "M-1044", type: "Pesagem", lot: "Engorda Confinamento", animals: 318, date: "11/05/2026", responsible: "João Pires" },
  { id: "M-1045", type: "IATF", lot: "Matrizes Estação", animals: 240, date: "08/05/2026", responsible: "Dr. Renato" },
  { id: "M-1046", type: "Vermifugação", lot: "Bezerros 2025", animals: 268, date: "06/05/2026", responsible: "Carla Mendes" },
  { id: "M-1047", type: "Diagnóstico de prenhez", lot: "Matrizes Estação", animals: 540, date: "02/05/2026", responsible: "Dr. Renato" },
];

export const SUPPLIES = [
  { sku: "SAL-005", name: "Sal Mineral 80", category: "Suplemento", stock: 14200, unit: "kg", min: 6000 },
  { sku: "VAC-012", name: "Vacina Aftosa", category: "Sanidade", stock: 380, unit: "doses", min: 200 },
  { sku: "MIL-003", name: "Milho moído", category: "Volumoso", stock: 86000, unit: "kg", min: 30000 },
  { sku: "URE-001", name: "Ureia pecuária", category: "Suplemento", stock: 5800, unit: "kg", min: 2500 },
  { sku: "ANT-007", name: "Antibiótico injetável", category: "Sanidade", stock: 92, unit: "frascos", min: 40 },
];

export const FUEL = [
  { date: "12/05", asset: "Trator Massey 4708", liters: 84, price: 6.12, total: 514.08, hours: 6.4 },
  { date: "10/05", asset: "Caminhão MB Atego", liters: 142, price: 6.18, total: 877.56, hours: 8.1 },
  { date: "08/05", asset: "Pulverizador Jacto", liters: 36, price: 6.12, total: 220.32, hours: 3.2 },
  { date: "05/05", asset: "Trator John Deere 5078", liters: 72, price: 6.05, total: 435.6, hours: 5.5 },
];

export const FINANCIAL_TX = [
  { date: "12/05", description: "Venda boi gordo - Frigorífico Sul", category: "Receita - Venda animal", value: 412800, type: "C" as const },
  { date: "11/05", description: "Compra suplemento mineral", category: "Despesa - Nutrição", value: -38400, type: "D" as const },
  { date: "10/05", description: "Folha de pagamento", category: "Despesa - Pessoal", value: -86200, type: "D" as const },
  { date: "08/05", description: "Aluguel de pastagem", category: "Despesa - Operacional", value: -22000, type: "D" as const },
  { date: "06/05", description: "Venda bezerros desmama", category: "Receita - Venda animal", value: 184500, type: "C" as const },
];

export const REPORTS = [
  { name: "Gerencial consolidado", category: "Gerenciais", lastRun: "12/05/2026", format: "PDF / XLSX" },
  { name: "Evolução de rebanho", category: "Evolutivos", lastRun: "11/05/2026", format: "PDF" },
  { name: "Eficiência reprodutiva", category: "Reprodutivos", lastRun: "10/05/2026", format: "PDF / XLSX" },
  { name: "Custo por arroba produzida", category: "Operacionais", lastRun: "08/05/2026", format: "XLSX" },
  { name: "Receitas vs. despesas", category: "Gerenciais", lastRun: "06/05/2026", format: "PDF" },
  { name: "Movimentação de insumos", category: "Operacionais", lastRun: "04/05/2026", format: "XLSX" },
];

export const SIMULATIONS = [
  { id: "S-08", name: "Engorda confinamento Q3", animals: 320, days: 110, projectedGmd: 1.25, projectedMargin: 0.34 },
  { id: "S-09", name: "Recria pasto suplementado", animals: 480, days: 180, projectedGmd: 0.82, projectedMargin: 0.27 },
  { id: "S-10", name: "Cenário de venda antecipada", animals: 210, days: 60, projectedGmd: 1.05, projectedMargin: 0.31 },
];
