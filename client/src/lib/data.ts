// Menu structure - exact replica of iRancho sidebar (English labels as in original)
export interface MenuItem {
  label: string;
  icon: string;
  path?: string;
  children?: MenuItem[];
}

export const menuItems: MenuItem[] = [
  { label: "Quick Access", icon: "flash_on", path: "/primeiro-uso/help" },
  { label: "Control Panel", icon: "dashboard", path: "/admin/overview" },
  {
    label: "Farms", icon: "home_work", children: [
      { label: "Overview", icon: "", path: "/fazendas/visao-geral" },
      { label: "Farms", icon: "", path: "/fazendas/lista-fazendas" },
      { label: "Subdivisions", icon: "", path: "/fazendas/subdivisoes" },
    ]
  },
  {
    label: "Administrative", icon: "business", children: [
      { label: "Overview", icon: "", path: "/benfeitorias/visao-geral" },
      { label: "Improvements", icon: "", path: "/benfeitorias/lista-benfeitorias" },
    ]
  },
  {
    label: "Herd", icon: "pets", children: [
      { label: "Overview", icon: "", path: "/rebanho/visao-geral" },
      { label: "Animals", icon: "", path: "/rebanho/lista-animais" },
      { label: "Herd Map", icon: "", path: "/rebanho/mapa-rebanho" },
      { label: "Lots", icon: "", path: "/rebanho/lotes" },
    ]
  },
  {
    label: "Management", icon: "assignment", children: [
      { label: "My Managements", icon: "", path: "/manejos/meus" },
      { label: "Create Management", icon: "", path: "/manejos/criar" },
      { label: "List Managements", icon: "", path: "/manejos/listar" },
      { label: "Basic Managements", icon: "", path: "/manejos/basicos" },
    ]
  },
  {
    label: "Supplies", icon: "inventory_2", children: [
      { label: "Stock", icon: "", path: "/insumos/estoque" },
      { label: "Entries", icon: "", path: "/insumos/entradas" },
      { label: "Exits", icon: "", path: "/insumos/saidas" },
    ]
  },
  {
    label: "Machinery", icon: "agriculture", children: [
      { label: "Fueling", icon: "", path: "/maquinas/abastecimento" },
      { label: "Maintenance", icon: "", path: "/maquinas/manutencao" },
      { label: "Machines", icon: "", path: "/maquinas/lista-maquinas" },
    ]
  },
  {
    label: "Reproduction", icon: "favorite", children: [
      { label: "Protocols", icon: "", path: "/reproducao/protocolos" },
      { label: "Semen", icon: "", path: "/reproducao/semen" },
      { label: "Embryos", icon: "", path: "/reproducao/embrioes" },
    ]
  },
  {
    label: "Nutrition", icon: "restaurant", children: [
      { label: "Diets", icon: "", path: "/nutricao/dietas" },
      { label: "Troughs", icon: "", path: "/nutricao/cochos" },
    ]
  },
  {
    label: "Purchase and Sale", icon: "swap_horiz", children: [
      { label: "Purchases", icon: "", path: "/compra-venda/compras" },
      { label: "Sales", icon: "", path: "/compra-venda/vendas" },
    ]
  },
  {
    label: "Financial", icon: "account_balance_wallet", children: [
      { label: "Accounts", icon: "", path: "/financeiro/contas" },
      { label: "Transactions", icon: "", path: "/financeiro/movimentacao" },
      { label: "Categories", icon: "", path: "/financeiro/categorias" },
      { label: "People", icon: "", path: "/financeiro/pessoas" },
    ]
  },
  {
    label: "Reports", icon: "description", children: [
      { label: "Managerial", icon: "", path: "/relatorios/gerenciais" },
      { label: "Evolution", icon: "", path: "/relatorios/evolucao" },
      { label: "Reproductive", icon: "", path: "/relatorios/reprodutivos" },
      { label: "Operational", icon: "", path: "/relatorios/operacionais" },
    ]
  },
  {
    label: "Simulations", icon: "calculate", children: [
      { label: "Feedlot", icon: "", path: "/simulacoes/confinamento" },
      { label: "Semi-feedlot", icon: "", path: "/simulacoes/semi-confinamento" },
    ]
  },
];

// Dashboard KPIs (matching original "Office overview")
export const dashboardKPIs = [
  { value: "0", label: "Active animals", sublabel: "-", icon: "", iconColor: "" },
  { value: "0", label: "Births", sublabel: "Since 01/05/2026", icon: "arrow_upward", iconColor: "text-green-600" },
  { value: "0", label: "Deaths", sublabel: "Since 01/05/2026", icon: "arrow_downward", iconColor: "text-red-600" },
  { value: "0", label: "Sales", sublabel: "Since 01/05/2026", icon: "", iconColor: "" },
  { value: "0", label: "Stocking rate (AU)", sublabel: "-", icon: "", iconColor: "" },
];

// Herd by age table
export const herdByAge = [
  { age: "0-8", male: 25, female: 25 },
  { age: "9-12", male: 14, female: 15 },
  { age: "13-24", male: 0, female: 0 },
  { age: "25-36", male: 0, female: 0 },
  { age: "36+", male: 69, female: 95 },
];

// Monitored stock
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

// Animals list sample data (matching iRancho columns)
export const animalsList = [
  { animalId: "1", electronicId: "982000455038273", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "3", electronicId: "982000455038275", managementId: "", birthDate: "01/08/2025", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "4", electronicId: "982000455038276", managementId: "", birthDate: "07/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Engorda", activity: "Fattening" },
  { animalId: "5", electronicId: "982000455038277", managementId: "", birthDate: "02/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Recria", activity: "Rearing" },
  { animalId: "7", electronicId: "982000455038279", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "8", electronicId: "982000455038280", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Breeding" },
  { animalId: "9", electronicId: "982000455038281", managementId: "", birthDate: "02/08/2025", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "10", electronicId: "982000455038282", managementId: "", birthDate: "07/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Engorda", activity: "Fattening" },
  { animalId: "11", electronicId: "982000455038283", managementId: "", birthDate: "02/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Recria", activity: "Rearing" },
  { animalId: "12", electronicId: "982000455038284", managementId: "", birthDate: "03/08/2025", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "13", electronicId: "982000455038285", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "14", electronicId: "982000455038286", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Breeding" },
  { animalId: "15", electronicId: "982000455038287", managementId: "", birthDate: "04/08/2025", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "16", electronicId: "982000455038288", managementId: "", birthDate: "07/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Engorda", activity: "Fattening" },
  { animalId: "17", electronicId: "982000455038289", managementId: "", birthDate: "02/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Recria", activity: "Rearing" },
  { animalId: "18", electronicId: "982000455038290", managementId: "", birthDate: "05/08/2025", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "19", electronicId: "982000455038291", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "20", electronicId: "982000455038292", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Breeding" },
  { animalId: "21", electronicId: "982000455038293", managementId: "", birthDate: "06/08/2025", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "22", electronicId: "982000455038294", managementId: "", birthDate: "07/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Engorda", activity: "Fattening" },
  { animalId: "23", electronicId: "982000455038295", managementId: "", birthDate: "02/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Recria", activity: "Rearing" },
  { animalId: "24", electronicId: "982000455038296", managementId: "", birthDate: "07/08/2025", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "25", electronicId: "982000455038297", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "26", electronicId: "982000455038298", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Breeding" },
  { animalId: "27", electronicId: "982000455038299", managementId: "", birthDate: "08/08/2025", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "28", electronicId: "982000455038300", managementId: "", birthDate: "07/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Engorda", activity: "Fattening" },
  { animalId: "29", electronicId: "982000455038301", managementId: "", birthDate: "02/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Recria", activity: "Rearing" },
  { animalId: "30", electronicId: "982000455038302", managementId: "", birthDate: "09/08/2025", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "31", electronicId: "982000455038303", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "32", electronicId: "982000455038304", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Breeding" },
  { animalId: "33", electronicId: "982000455038305", managementId: "", birthDate: "10/08/2025", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "34", electronicId: "982000455038306", managementId: "", birthDate: "07/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Engorda", activity: "Fattening" },
  { animalId: "35", electronicId: "982000455038307", managementId: "", birthDate: "02/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Recria", activity: "Rearing" },
  { animalId: "36", electronicId: "982000455038308", managementId: "", birthDate: "11/08/2025", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "37", electronicId: "982000455038309", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "38", electronicId: "982000455038310", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Breeding" },
  { animalId: "39", electronicId: "982000455038311", managementId: "", birthDate: "12/08/2025", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "40", electronicId: "982000455038312", managementId: "", birthDate: "07/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Engorda", activity: "Fattening" },
  { animalId: "41", electronicId: "982000455038313", managementId: "", birthDate: "02/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Recria", activity: "Rearing" },
  { animalId: "42", electronicId: "982000455038314", managementId: "", birthDate: "13/08/2025", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "43", electronicId: "982000455038315", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "44", electronicId: "982000455038316", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Breeding" },
  { animalId: "45", electronicId: "982000455038317", managementId: "", birthDate: "14/08/2025", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "46", electronicId: "982000455038318", managementId: "", birthDate: "07/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Engorda", activity: "Fattening" },
  { animalId: "47", electronicId: "982000455038319", managementId: "", birthDate: "02/03/2020", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Recria", activity: "Rearing" },
  { animalId: "48", electronicId: "982000455038320", managementId: "", birthDate: "15/08/2025", castrated: "No", sex: "Male", breed: "Nelore", lot: "Lote Bezerros (as)", activity: "Breeding" },
  { animalId: "49", electronicId: "982000455038321", managementId: "", birthDate: "01/01/2020", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote Vacas", activity: "Breeding" },
  { animalId: "50", electronicId: "982000455038322", managementId: "", birthDate: "01/02/2022", castrated: "-", sex: "Female", breed: "Nelore", lot: "Lote novilhas da estação", activity: "Breeding" },
];

// Financial accounts
export const financialAccounts = [
  { id: 1, name: "Conta Principal", type: "Corrente", balance: "R$ 45.000,00" },
  { id: 2, name: "Caixa Fazenda", type: "Caixa", balance: "R$ 3.200,00" },
  { id: 3, name: "Poupança", type: "Poupança", balance: "R$ 120.000,00" },
];

// Stock items
export const stockItems = [
  { id: 1, product: "Etanol", unit: "Litro", qty: "3000.00", minStock: "500.00", status: "ok" },
  { id: 2, product: "Prostaglandina", unit: "Mililitro", qty: "6000.00", minStock: "1000.00", status: "ok" },
  { id: 3, product: "Vacina Aftosa", unit: "Mililitro", qty: "4462.00", minStock: "500.00", status: "ok" },
  { id: 4, product: "Cipionato de Estradiol", unit: "Mililitro", qty: "3000.00", minStock: "500.00", status: "ok" },
  { id: 5, product: "Vermifugo", unit: "Mililitro", qty: "5840.00", minStock: "1000.00", status: "ok" },
  { id: 6, product: "Gasolina", unit: "Litro", qty: "4000.00", minStock: "500.00", status: "ok" },
  { id: 7, product: "Diesel", unit: "Litro", qty: "2000.00", minStock: "500.00", status: "ok" },
  { id: 8, product: "Benzoato de Estradiol", unit: "Mililitro", qty: "4500.00", minStock: "500.00", status: "ok" },
  { id: 9, product: "Implante", unit: "Unidade", qty: "2985.00", minStock: "500.00", status: "ok" },
  { id: 10, product: "FSH", unit: "Mililitro", qty: "1500.00", minStock: "300.00", status: "ok" },
];

// Users for auth
export const users = [
  { email: "pngomes1@gmail.com", password: "123456", name: "Pedro Gomes" },
  { email: "pngomes1@teste.com", password: "12345678", name: "Pedro Gomes" },
  { email: "demo@irancho.com", password: "demo123", name: "Usuário Demo" },
];
