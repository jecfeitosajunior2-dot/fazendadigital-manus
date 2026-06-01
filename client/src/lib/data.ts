// Menu — iRancho (estrutura/labels) + funcionalidades extras Fazenda Digital
export interface MenuItem {
  label: string;
  icon: string;
  path?: string;
  children?: MenuItem[];
}

export const menuItems: MenuItem[] = [
  { label: "Acesso Rápido", icon: "flash_on", path: "/primeiro-uso/help" },
  { label: "Painel de Controle", icon: "dashboard", path: "/admin/overview" },
  {
    label: "Fazendas",
    icon: "home_work",
    children: [
      { label: "Visão Geral", icon: "", path: "/fazendas/visao-geral" },
      { label: "Benfeitorias", icon: "", path: "/fazendas/benfeitorias" },
    ],
  },
  {
    label: "Administrativo",
    icon: "settings",
    children: [
      { label: "Visão Geral", icon: "", path: "/administrativo/visao-geral" },
      { label: "Benfeitorias", icon: "", path: "/fazendas/benfeitorias" },
    ],
  },
  {
    label: "Rebanho",
    icon: "pets",
    children: [
      { label: "Visão Geral", icon: "", path: "/rebanho/visao-geral" },
      { label: "Animais", icon: "", path: "/rebanho/lista-animais" },
      { label: "Mapa do Rebanho", icon: "", path: "/rebanho/mapa-rebanho" },
      { label: "Lotes", icon: "", path: "/rebanho/lotes" },
      { label: "Importação em Massa", icon: "", path: "/rebanho/importacao-em-massa" },
    ],
  },
  {
    label: "Manejo",
    icon: "playlist_add_check",
    children: [
      { label: "Visão Geral", icon: "", path: "/manejo/visao-geral" },
      { label: "Meus Manejos", icon: "", path: "/manejos/meus" },
      { label: "Criar Manejo", icon: "", path: "/manejos/criar" },
      { label: "Listar Manejos", icon: "", path: "/manejos/listar" },
      { label: "Manejos Básicos", icon: "", path: "/manejos/basicos" },
    ],
  },
  {
    label: "Insumos",
    icon: "inventory_2",
    children: [
      { label: "Visão Geral", icon: "", path: "/insumos/visao-geral" },
      { label: "Cadastro de Produtos", icon: "", path: "/insumos/cadastro" },
      { label: "Estoque", icon: "", path: "/insumos/estoque" },
      { label: "Entradas", icon: "", path: "/insumos/entradas" },
      { label: "Saídas", icon: "", path: "/insumos/saidas" },
    ],
  },
  {
    label: "Máquinas",
    icon: "agriculture",
    children: [
      { label: "Visão Geral", icon: "", path: "/maquinas/visao-geral" },
      { label: "Cadastro de Maquinário", icon: "", path: "/maquinas/cadastro" },
      { label: "Abastecimento", icon: "", path: "/maquinas/abastecimento" },
      { label: "Manutenção", icon: "", path: "/maquinas/manutencao" },
      { label: "Máquinas", icon: "", path: "/maquinas/lista-maquinas" },
    ],
  },
  {
    label: "Reprodução",
    icon: "favorite",
    children: [
      { label: "Visão Geral", icon: "", path: "/reproducao/visao-geral" },
      { label: "Protocolos", icon: "", path: "/reproducao/protocolos" },
      { label: "Sêmen", icon: "", path: "/reproducao/semen" },
      { label: "Embriões", icon: "", path: "/reproducao/embrioes" },
    ],
  },
  {
    label: "Nutrição",
    icon: "grass",
    children: [
      { label: "Visão Geral", icon: "", path: "/nutricao/visao-geral" },
      { label: "Dietas", icon: "", path: "/nutricao/dietas" },
      { label: "Cochos", icon: "", path: "/nutricao/cochos" },
    ],
  },
  {
    label: "Compra e Venda",
    icon: "attach_money",
    children: [
      { label: "Visão Geral", icon: "", path: "/compra-venda/visao-geral" },
      { label: "Compras", icon: "", path: "/compra-venda/compras" },
      { label: "Vendas", icon: "", path: "/compra-venda/vendas" },
    ],
  },
  {
    label: "Financeiro",
    icon: "account_balance_wallet",
    children: [
      { label: "Visão Geral", icon: "", path: "/financeiro/visao-geral" },
      { label: "Contas", icon: "", path: "/financeiro/contas" },
      { label: "Movimentação", icon: "", path: "/financeiro/movimentacao" },
      { label: "Categorias", icon: "", path: "/financeiro/categorias" },
      { label: "Pessoas", icon: "", path: "/financeiro/pessoas" },
    ],
  },
  {
    label: "Relatórios",
    icon: "description",
    children: [
      { label: "Visão Geral", icon: "", path: "/relatorios/visao-geral" },
      { label: "Gerenciais", icon: "", path: "/relatorios/gerenciais" },
      { label: "Evolução", icon: "", path: "/relatorios/evolucao" },
      { label: "Reprodutivos", icon: "", path: "/relatorios/reprodutivos" },
      { label: "Operacionais", icon: "", path: "/relatorios/operacionais" },
    ],
  },
  {
    label: "Simulações",
    icon: "calculate",
    children: [
      { label: "Visão Geral", icon: "", path: "/simulacoes/visao-geral" },
      { label: "Confinamento", icon: "", path: "/simulacoes/confinamento" },
      { label: "Semi-confinamento", icon: "", path: "/simulacoes/semi-confinamento" },
    ],
  },
];

// Dashboard KPIs
export const dashboardKPIs = [
  { value: "0", label: "Animais ativos", sublabel: "-", icon: "", iconColor: "" },
  { value: "0", label: "Nascimentos", sublabel: "Desde 01/05/2026", icon: "arrow_upward", iconColor: "text-green-600" },
  { value: "0", label: "Mortes", sublabel: "Desde 01/05/2026", icon: "arrow_downward", iconColor: "text-red-600" },
  { value: "0", label: "Vendas", sublabel: "Desde 01/05/2026", icon: "", iconColor: "" },
  { value: "0", label: "Taxa de lotação (UA)", sublabel: "-", icon: "", iconColor: "" },
];
// Rebanho por idade
export const herdByAge = [
  { age: "0-8", male: 25, female: 25 },
  { age: "9-12", male: 14, female: 15 },
  { age: "13-24", male: 0, female: 0 },
  { age: "25-36", male: 0, female: 0 },
  { age: "36+", male: 69, female: 95 },
];

// Estoque monitorado
export const monitoredStock = [
  { product: "Etanol", unit: "Litro", qty: "3000.00", status: "ok" },
  { product: "Prostaglandina", unit: "Mililitro", qty: "6000.00", status: "ok" },
  { product: "Vacina Aftosa", unit: "Mililitro", qty: "4462.00", status: "ok" },
  { product: "Cipionato de Estradiol", unit: "Mililitro", qty: "3000.00", status: "ok" },
  { product: "Vermifugo", unit: "Mililitro", qty: "5840.00", status: "ok" },
  { product: "Gasolina", unit: "Litro", qty: "4000.00", status: "ok" },
  { product: "Diesel", unit: "Litro", qty: "2000.00", status: "ok" },
  { product: "Benzoato de Estradiol", unit: "Mililitro", qty: "4500.00", status: "ok" },
  { product: "Implante", unit: "Unidade", qty: "2985.00", status: "ok" },
  { product: "FSH", unit: "Mililitro", qty: "1500.00", status: "ok" },
];

// Lista de animais
export const animalsList = [
  { animalId: "1", electronicId: "982000455038273", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "3", electronicId: "982000455038275", managementId: "", birthDate: "01/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "4", electronicId: "982000455038276", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
  { animalId: "5", electronicId: "982000455038277", managementId: "", birthDate: "02/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Recria", activity: "Recria" },
  { animalId: "7", electronicId: "982000455038279", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "8", electronicId: "982000455038280", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Cria" },
  { animalId: "9", electronicId: "982000455038281", managementId: "", birthDate: "02/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "10", electronicId: "982000455038282", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
  { animalId: "11", electronicId: "982000455038283", managementId: "", birthDate: "02/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Recria", activity: "Recria" },
  { animalId: "12", electronicId: "982000455038284", managementId: "", birthDate: "03/08/2025", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "13", electronicId: "982000455038285", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "14", electronicId: "982000455038286", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Cria" },
  { animalId: "15", electronicId: "982000455038287", managementId: "", birthDate: "04/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "16", electronicId: "982000455038288", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
  { animalId: "17", electronicId: "982000455038289", managementId: "", birthDate: "02/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Recria", activity: "Recria" },
  { animalId: "18", electronicId: "982000455038290", managementId: "", birthDate: "05/08/2025", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "19", electronicId: "982000455038291", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "20", electronicId: "982000455038292", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Cria" },
  { animalId: "21", electronicId: "982000455038293", managementId: "", birthDate: "06/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "22", electronicId: "982000455038294", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
  { animalId: "23", electronicId: "982000455038295", managementId: "", birthDate: "02/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Recria", activity: "Recria" },
  { animalId: "24", electronicId: "982000455038296", managementId: "", birthDate: "07/08/2025", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "25", electronicId: "982000455038297", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "26", electronicId: "982000455038298", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Cria" },
  { animalId: "27", electronicId: "982000455038299", managementId: "", birthDate: "08/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "28", electronicId: "982000455038300", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
  { animalId: "29", electronicId: "982000455038301", managementId: "", birthDate: "02/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Recria", activity: "Recria" },
  { animalId: "30", electronicId: "982000455038302", managementId: "", birthDate: "09/08/2025", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "31", electronicId: "982000455038303", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "32", electronicId: "982000455038304", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Cria" },
  { animalId: "33", electronicId: "982000455038305", managementId: "", birthDate: "10/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "34", electronicId: "982000455038306", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
  { animalId: "35", electronicId: "982000455038307", managementId: "", birthDate: "02/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Recria", activity: "Recria" },
  { animalId: "36", electronicId: "982000455038308", managementId: "", birthDate: "11/08/2025", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "37", electronicId: "982000455038309", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "38", electronicId: "982000455038310", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Cria" },
  { animalId: "39", electronicId: "982000455038311", managementId: "", birthDate: "12/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "40", electronicId: "982000455038312", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
  { animalId: "41", electronicId: "982000455038313", managementId: "", birthDate: "02/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Recria", activity: "Recria" },
  { animalId: "42", electronicId: "982000455038314", managementId: "", birthDate: "13/08/2025", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "43", electronicId: "982000455038315", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "44", electronicId: "982000455038316", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Cria" },
  { animalId: "45", electronicId: "982000455038317", managementId: "", birthDate: "14/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "46", electronicId: "982000455038318", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
  { animalId: "47", electronicId: "982000455038319", managementId: "", birthDate: "02/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Recria", activity: "Recria" },
  { animalId: "48", electronicId: "982000455038320", managementId: "", birthDate: "15/08/2025", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "49", electronicId: "982000455038321", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Vacas", activity: "Cria" },
  { animalId: "50", electronicId: "982000455038322", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Cria" },
  { animalId: "51", electronicId: "982000455038323", managementId: "", birthDate: "16/08/2025", castrated: "-", sex: "Fêmea", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Cria" },
  { animalId: "52", electronicId: "982000455038324", managementId: "", birthDate: "07/03/2020", castrated: "Não", sex: "Macho", breed: "Nelore", lot: "Lote Engorda", activity: "Engorda" },
];

// Contas financeiras
export const financialAccounts = [
  { id: 1, name: "Conta Principal", type: "Corrente", balance: "R$ 45.000,00" },
  { id: 2, name: "Caixa Fazenda", type: "Caixa", balance: "R$ 3.200,00" },
  { id: 3, name: "Poupança", type: "Poupança", balance: "R$ 120.000,00" },
];

// Itens de estoque
export const stockItems = [
  { id: 1, product: "Etanol", unit: "Litro", qty: "3000.00", minStock: "500.00", status: "ok" },
  { id: 2, product: "Prostaglandina", unit: "Mililitro", qty: "6000.00", minStock: "1000.00", status: "ok" },
  { id: 3, product: "Vacina Aftosa", unit: "Mililitro", qty: "4462.00", minStock: "500.00", status: "ok" },
  { id: 4, product: "Cipionato de Estradiol", unit: "Mililitro", qty: "3000.00", minStock: "500.00", status: "ok" },
  { id: 5, product: "Vermifugo", unit: "Mililitro", qty: "5840.00", minStock: "500.00", status: "ok" },
  { id: 6, product: "Gasolina", unit: "Litro", qty: "4000.00", minStock: "500.00", status: "ok" },
  { id: 7, product: "Diesel", unit: "Litro", qty: "2000.00", minStock: "500.00", status: "ok" },
  { id: 8, product: "Benzoato de Estradiol", unit: "Mililitro", qty: "4500.00", minStock: "500.00", status: "ok" },
  { id: 9, product: "Implante", unit: "Unidade", qty: "2985.00", minStock: "500.00", status: "ok" },
  { id: 10, product: "FSH", unit: "Mililitro", qty: "1500.00", minStock: "300.00", status: "ok" },
];

// Usuários para autenticação
export const users = [
  { email: "pngomes1@gmail.com", password: "123456", name: "Pedro Gomes" },
  { email: "pngomes1@teste.com", password: "12345678", name: "Pedro Gomes" },
  { email: "demo@fazenda-digital.com", password: "demo123", name: "Usuário Demo" },
];
