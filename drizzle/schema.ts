import { mysqlTable, int, varchar, text, decimal, date, timestamp, boolean, mysqlEnum } from "drizzle-orm/mysql-core";

// Users table
export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  openId: varchar("openId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 50 }).default("local"),
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["admin", "user"]).default("user"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
  lastSignedIn: timestamp("lastSignedIn"),
});

// Fazendas table
export const fazendas = mysqlTable("fazendas", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  nome: varchar("nome", { length: 200 }).notNull(),
  sigla: varchar("sigla", { length: 20 }),
  cidade: varchar("cidade", { length: 100 }),
  estado: varchar("estado", { length: 2 }),
  pais: varchar("pais", { length: 50 }).default("Brasil"),
  unidadeArea: varchar("unidadeArea", { length: 30 }).default("Hectare"),
  area: decimal("area", { precision: 10, scale: 2 }),
  areaReserva: decimal("areaReserva", { precision: 10, scale: 2 }),
  areaLiquida: decimal("areaLiquida", { precision: 10, scale: 2 }),
  endereco: varchar("endereco", { length: 300 }),
  cep: varchar("cep", { length: 10 }),
  telefone: varchar("telefone", { length: 20 }),
  responsavel: varchar("responsavel", { length: 200 }),
  atividadeCria: boolean("atividadeCria").default(false),
  atividadeRecria: boolean("atividadeRecria").default(false),
  atividadeEngorda: boolean("atividadeEngorda").default(false),
  atividadeConfinamento: boolean("atividadeConfinamento").default(false),
  cpfCnpj: varchar("cpfCnpj", { length: 20 }),
  inscricaoEstadual: varchar("inscricaoEstadual", { length: 50 }),
  registroIncra: varchar("registroIncra", { length: 50 }),
  nirf: varchar("nirf", { length: 50 }),
  possuiSisbov: boolean("possuiSisbov"),
  razaoSocial: varchar("razaoSocial", { length: 200 }),
  latitude: varchar("latitude", { length: 30 }),
  longitude: varchar("longitude", { length: 30 }),
  distanciaMunicipio: decimal("distanciaMunicipio", { precision: 10, scale: 2 }),
  valorHectare: decimal("valorHectare", { precision: 12, scale: 2 }),
  melhoramentoGenetico: text("melhoramentoGenetico"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Animais table
export const animais = mysqlTable("animais", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  brinco: varchar("brinco", { length: 50 }),
  nome: varchar("nome", { length: 100 }),
  raca: varchar("raca", { length: 100 }),
  sexo: mysqlEnum("sexo", ["macho", "femea"]).notNull(),
  dataNascimento: date("dataNascimento"),
  pesoAtual: decimal("pesoAtual", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["ativo", "vendido", "morto", "transferido"]).default("ativo"),
  loteId: int("loteId"),
  categoria: varchar("categoria", { length: 50 }),
  observacoes: text("observacoes"),
  fotoUrl: text("fotoUrl"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Pastos (subdivisões/piquetes por fazenda)
export const pastos = mysqlTable("pastos", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  fazendaId: int("fazendaId").notNull(),
  nome: varchar("nome", { length: 100 }).notNull(),
  sigla: varchar("sigla", { length: 20 }),
  tipo: varchar("tipo", { length: 80 }).default("Pasto"),
  tipoPastagem: varchar("tipoPastagem", { length: 80 }),
  area: decimal("area", { precision: 10, scale: 2 }),
  incluirArea: boolean("incluirArea").default(true),
  capacidade: int("capacidade"),
  status: mysqlEnum("status", ["ativo", "descanso", "vazio"]).default("vazio"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Lotes table
export const lotes = mysqlTable("lotes", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: text("descricao"),
  localizacao: varchar("localizacao", { length: 200 }),
  capacidade: int("capacidade"),
  fazendaId: int("fazendaId"),
  pastoAtualId: int("pastoAtualId"),
  dataEntradaPasto: date("dataEntradaPasto"),
  ativo: boolean("ativo").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Histórico de movimentação lote ↔ pasto
export const lotePastoMovimentacoes = mysqlTable("lote_pasto_movimentacoes", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  loteId: int("loteId").notNull(),
  pastoOrigemId: int("pastoOrigemId"),
  pastoDestinoId: int("pastoDestinoId"),
  dataEntrada: date("dataEntrada").notNull(),
  dataSaida: date("dataSaida"),
  diasNoPasto: int("diasNoPasto"),
  qtdAnimais: int("qtdAnimais"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Saude registros table
export const saudeRegistros = mysqlTable("saude_registros", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  animalId: int("animalId").notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  descricao: text("descricao"),
  medicamento: varchar("medicamento", { length: 200 }),
  dosagem: varchar("dosagem", { length: 100 }),
  veterinario: varchar("veterinario", { length: 200 }),
  custo: decimal("custo", { precision: 10, scale: 2 }),
  dataRegistro: date("dataRegistro").notNull(),
  proximaData: date("proximaData"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Reproducao registros table
export const reproducaoRegistros = mysqlTable("reproducao_registros", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  femeaId: int("femeaId").notNull(),
  machoId: int("machoId"),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  dataCobertura: date("dataCobertura").notNull(),
  dataPrevistoParto: date("dataPrevistoParto"),
  dataPartoReal: date("dataPartoReal"),
  resultado: varchar("resultado", { length: 50 }),
  filhotes: int("filhotes"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Maquinas table
export const maquinas = mysqlTable("maquinas", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  fazendaId: int("fazendaId"),
  nome: varchar("nome", { length: 100 }).notNull(),
  tipo: varchar("tipo", { length: 50 }),
  marca: varchar("marca", { length: 100 }),
  modelo: varchar("modelo", { length: 100 }),
  ano: int("ano"),
  anoAquisicao: int("anoAquisicao"),
  placa: varchar("placa", { length: 50 }),
  horimetro: varchar("horimetro", { length: 50 }),
  valor: decimal("valor", { precision: 12, scale: 2 }),
  vidaUtil: varchar("vidaUtil", { length: 50 }),
  dataDesativacao: date("dataDesativacao"),
  estado: varchar("estado", { length: 20 }),
  status: mysqlEnum("status", ["ativo", "manutencao", "inativo"]).default("ativo"),
  imagem1: text("imagem1"),
  imagem2: text("imagem2"),
  imagem3: text("imagem3"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Abastecimentos table
export const abastecimentos = mysqlTable("abastecimentos", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  maquinaId: int("maquinaId").notNull(),
  data: date("data").notNull(),
  combustivel: mysqlEnum("combustivel", ["diesel", "gasolina", "etanol", "arla"]).notNull(),
  litros: decimal("litros", { precision: 8, scale: 2 }).notNull(),
  valorLitro: decimal("valorLitro", { precision: 8, scale: 3 }),
  valorTotal: decimal("valorTotal", { precision: 10, scale: 2 }),
  horimetro: varchar("horimetro", { length: 50 }),
  responsavel: varchar("responsavel", { length: 200 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Manutencoes table
export const manutencoes = mysqlTable("manutencoes", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  maquinaId: int("maquinaId").notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  descricao: text("descricao"),
  data: date("data").notNull(),
  custo: decimal("custo", { precision: 10, scale: 2 }),
  oficina: varchar("oficina", { length: 200 }),
  horimetro: varchar("horimetro", { length: 50 }),
  proximaManutencao: date("proximaManutencao"),
  status: mysqlEnum("status", ["agendada", "em_andamento", "concluida"]).default("agendada"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Pesagens table
export const pesagens = mysqlTable("pesagens", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  animalId: int("animalId").notNull(),
  peso: decimal("peso", { precision: 8, scale: 2 }).notNull(),
  data: date("data").notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Batidas table (nutrition records)
export const batidas = mysqlTable("batidas", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  cochoId: int("cochoId"),
  dietaId: int("dietaId"),
  data: date("data").notNull(),
  quantidade: decimal("quantidade", { precision: 8, scale: 2 }),
  responsavel: varchar("responsavel", { length: 200 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Benfeitorias table
export const benfeitorias = mysqlTable("benfeitorias", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  fazendaId: int("fazendaId"),
  nome: varchar("nome", { length: 100 }).notNull(),
  tipo: varchar("tipo", { length: 50 }),
  anoConstrucao: int("anoConstrucao"),
  vidaUtil: varchar("vidaUtil", { length: 50 }),
  percentualAtividade: decimal("percentualAtividade", { precision: 5, scale: 2 }),
  localizacao: varchar("localizacao", { length: 200 }),
  status: mysqlEnum("status", ["ativo", "manutencao", "inativo"]).default("ativo"),
  dataInstalacao: date("dataInstalacao"),
  valorEstimado: decimal("valorEstimado", { precision: 12, scale: 2 }),
  imagem1: text("imagem1"),
  imagem2: text("imagem2"),
  imagem3: text("imagem3"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Estoque table (uses snake_case)
export const estoque = mysqlTable("estoque", {
  id: int("id").primaryKey().autoincrement(),
  fazendaId: int("fazenda_id"),
  nome: varchar("nome", { length: 100 }).notNull(),
  categoria: varchar("categoria", { length: 50 }),
  subcategoria: varchar("subcategoria", { length: 80 }),
  unidade: varchar("unidade", { length: 20 }),
  quantidade: decimal("quantidade", { precision: 10, scale: 2 }).default("0"),
  quantidadeMinima: decimal("quantidade_minima", { precision: 10, scale: 2 }).default("0"),
  quantidadeMaxima: decimal("quantidade_maxima", { precision: 10, scale: 2 }),
  fabricante: varchar("fabricante", { length: 100 }),
  identificadorUnico: varchar("identificador_unico", { length: 100 }),
  produzidoNaFazenda: boolean("produzido_na_fazenda").default(false),
  monitorarEstoque: boolean("monitorar_estoque").default(false),
  situacao: varchar("situacao", { length: 20 }).default("ativo"),
  embalagens: text("embalagens"),
  possuiCarencia: boolean("possui_carencia").default(false),
  carenciaAbateDias: int("carencia_abate_dias"),
  carenciaAbateUnidade: varchar("carencia_abate_unidade", { length: 8 }).default("d"),
  carenciaLeiteDias: int("carencia_leite_dias"),
  observacoesCarencia: text("observacoes_carencia"),
  valorUnitario: decimal("valor_unitario", { precision: 10, scale: 2 }),
  localizacao: varchar("localizacao", { length: 200 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const estoqueMovimentacoes = mysqlTable("estoque_movimentacoes", {
  id: int("id").primaryKey().autoincrement(),
  estoqueId: int("estoque_id").notNull(),
  dataMovimentacao: date("data_movimentacao").notNull(),
  quantidade: decimal("quantidade", { precision: 12, scale: 2 }).notNull(),
  dataValidade: date("data_validade"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Contas financeiras table (uses snake_case)
export const contasFinanceiras = mysqlTable("contas_financeiras", {
  id: int("id").primaryKey().autoincrement(),
  nome: varchar("nome", { length: 100 }).notNull(),
  tipo: varchar("tipo", { length: 50 }),
  banco: varchar("banco", { length: 100 }),
  saldoInicial: decimal("saldo_inicial", { precision: 12, scale: 2 }).default("0"),
  saldoAtual: decimal("saldo_atual", { precision: 12, scale: 2 }).default("0"),
  ativa: boolean("ativa").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Movimentacoes table (uses snake_case)
export const movimentacoes = mysqlTable("movimentacoes", {
  id: int("id").primaryKey().autoincrement(),
  contaId: int("conta_id"),
  categoriaId: int("categoria_id"),
  tipo: mysqlEnum("tipo", ["receita", "despesa"]).notNull(),
  descricao: varchar("descricao", { length: 200 }).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  data: date("data").notNull(),
  status: mysqlEnum("status", ["pendente", "confirmado", "cancelado"]).default("confirmado"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const compras = mysqlTable("compras", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  fornecedor: varchar("fornecedor", { length: 255 }),
  data: varchar("data", { length: 20 }).notNull(),
  quantidadeAnimais: int("quantidade_animais"),
  valorTotal: varchar("valor_total", { length: 50 }),
  observacoes: text("observacoes"),
  status: mysqlEnum("status", ["pendente", "concluido", "cancelado"]).default("pendente"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vendas = mysqlTable("vendas", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  comprador: varchar("comprador", { length: 255 }),
  data: varchar("data", { length: 20 }).notNull(),
  quantidadeAnimais: int("quantidade_animais"),
  valorTotal: varchar("valor_total", { length: 50 }),
  observacoes: text("observacoes"),
  status: mysqlEnum("status", ["pendente", "concluido", "cancelado"]).default("pendente"),
  createdAt: timestamp("created_at").defaultNow(),
});
