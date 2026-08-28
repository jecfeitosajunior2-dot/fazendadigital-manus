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
  atividadePrincipal: varchar("atividadePrincipal", { length: 50 }),
  atividadeCria: boolean("atividadeCria").default(false),
  atividadeRecria: boolean("atividadeRecria").default(false),
  atividadeEngorda: boolean("atividadeEngorda").default(false),
  atividadeConfinamento: boolean("atividadeConfinamento").default(false),
  atividadeLeite: boolean("atividadeLeite").default(false),
  atividadeAgricultura: boolean("atividadeAgricultura").default(false),
  atividadeOutros: boolean("atividadeOutros").default(false),
  quantidadeAnimais: int("quantidadeAnimais"),
  cpfCnpj: varchar("cpfCnpj", { length: 20 }),
  inscricaoEstadual: varchar("inscricaoEstadual", { length: 50 }),
  registroIncra: varchar("registroIncra", { length: 50 }),
  nirf: varchar("nirf", { length: 50 }),
  numeroCar: varchar("numeroCar", { length: 80 }),
  matriculaImovel: varchar("matriculaImovel", { length: 80 }),
  matriculasImovel: text("matriculasImovel"),
  tipoPosse: varchar("tipoPosse", { length: 50 }),
  possuiSisbov: boolean("possuiSisbov"),
  razaoSocial: varchar("razaoSocial", { length: 200 }),
  latitude: varchar("latitude", { length: 30 }),
  longitude: varchar("longitude", { length: 30 }),
  distanciaMunicipio: decimal("distanciaMunicipio", { precision: 10, scale: 2 }),
  valorHectare: decimal("valorHectare", { precision: 12, scale: 2 }),
  fonteEnergia: varchar("fonteEnergia", { length: 80 }),
  fonteAgua: varchar("fonteAgua", { length: 80 }),
  responsavelOperacionalNome: varchar("responsavelOperacionalNome", { length: 200 }),
  responsavelOperacionalTelefone: varchar("responsavelOperacionalTelefone", { length: 40 }),
  responsavelOperacionalFuncao: varchar("responsavelOperacionalFuncao", { length: 80 }),
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
  brincoEletronico: varchar("brincoEletronico", { length: 80 }),
  nome: varchar("nome", { length: 100 }),
  raca: varchar("raca", { length: 100 }),
  sexo: mysqlEnum("sexo", ["macho", "femea"]).notNull(),
  dataNascimento: date("dataNascimento", { mode: "string" }),
  pesoAtual: decimal("pesoAtual", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["ativo", "vendido", "morto", "transferido"]).default("ativo"),
  loteId: int("loteId"),
  fazendaId: int("fazendaId"),
  pastoId: int("pastoId"),
  categoria: varchar("categoria", { length: 50 }),
  // Dados zootécnicos
  pelagem: varchar("pelagem", { length: 80 }),
  marca: varchar("marca", { length: 80 }),
  dataDesmama: date("dataDesmama", { mode: "string" }),
  castrado: boolean("castrado").default(false),
  // Entrada / aquisição
  dataEntrada: date("dataEntrada", { mode: "string" }),
  pesoEntrada: decimal("pesoEntrada", { precision: 8, scale: 2 }),
  produtorOrigem: varchar("produtorOrigem", { length: 200 }),
  precoKg: decimal("precoKg", { precision: 10, scale: 2 }),
  frete: decimal("frete", { precision: 10, scale: 2 }),
  // Rastreabilidade e registros oficiais
  sisbov: varchar("sisbov", { length: 50 }),
  dataRnd: date("dataRnd", { mode: "string" }),
  rgn: varchar("rgn", { length: 50 }),
  rgd: varchar("rgd", { length: 50 }),
  rastreadoNascimento: boolean("rastreadoNascimento").default(false),
  // Genealogia
  /** Referência estruturada à mãe (fonte principal para novos nascimentos). */
  maeId: int("maeId"),
  /** Referência estruturada ao pai interno, quando conhecido. */
  paiId: int("paiId"),
  /** Legado — texto livre; não usar como fonte principal em novos cadastros. */
  pai: varchar("pai", { length: 200 }),
  /** Legado — texto livre; não usar como fonte principal em novos cadastros. */
  mae: varchar("mae", { length: 200 }),
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
  status: mysqlEnum("status", ["ativo", "descanso", "vazio", "reforma", "interditado", "reserva", "sem_uso"]).default("ativo"),
  coordenadas: text("coordenadas"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Lotes table
export const lotes = mysqlTable("lotes", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  nome: varchar("nome", { length: 100 }).notNull(),
  sigla: varchar("sigla", { length: 20 }),
  dataCriacao: date("dataCriacao", { mode: "string" }),
  descricao: text("descricao"),
  localizacao: varchar("localizacao", { length: 200 }),
  capacidade: int("capacidade"),
  fazendaId: int("fazendaId"),
  pastoAtualId: int("pastoAtualId"),
  dataEntradaPasto: date("dataEntradaPasto", { mode: "string" }),
  ativo: boolean("ativo").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Histórico de movimentação animal entre lotes
export const animalLoteMovimentacoes = mysqlTable("animal_lote_movimentacoes", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  animalId: int("animalId").notNull(),
  /** Null quando o animal não tinha lote (origem = Sem lote). */
  loteOrigemId: int("loteOrigemId"),
  loteDestinoId: int("loteDestinoId").notNull(),
  pastoOrigemId: int("pastoOrigemId"),
  pastoDestinoId: int("pastoDestinoId"),
  fazendaId: int("fazendaId"),
  dataMovimentacao: date("dataMovimentacao", { mode: "string" }).notNull(),
  usuarioNome: varchar("usuarioNome", { length: 200 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Histórico de movimentação lote ↔ pasto
export const lotePastoMovimentacoes = mysqlTable("lote_pasto_movimentacoes", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  loteId: int("loteId").notNull(),
  pastoOrigemId: int("pastoOrigemId"),
  pastoDestinoId: int("pastoDestinoId"),
  dataEntrada: date("dataEntrada", { mode: "string" }).notNull(),
  dataSaida: date("dataSaida", { mode: "string" }),
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
  viaAplicacao: varchar("viaAplicacao", { length: 80 }),
  /** Vínculo com estoque (Insumos) — padrão Manutenção. */
  estoqueId: int("estoqueId"),
  /** Quantidade baixada na unidade base do estoque. */
  quantidadeConsumo: decimal("quantidadeConsumo", { precision: 12, scale: 4 }),
  /** Custo médio unitário congelado no momento do manejo. */
  valorUnitario: decimal("valorUnitario", { precision: 10, scale: 2 }),
  veterinario: varchar("veterinario", { length: 200 }),
  /** Custo total congelado (quantidadeConsumo × valorUnitario). */
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

/** Vínculo relacional entre evento Parto e cada cria gerada (tabela de relação). */
export const partoCrias = mysqlTable("parto_crias", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  partoRegistroId: int("partoRegistroId").notNull(),
  criaAnimalId: int("criaAnimalId").notNull(),
  ordem: int("ordem").notNull().default(1),
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
  /** Data completa de aquisição (preferencial em relação a anoAquisicao). */
  dataAquisicao: date("dataAquisicao", { mode: "string" }),
  placa: varchar("placa", { length: 50 }),
  /** Leitura inicial (horímetro ou km), conforme tipoMedidor. */
  horimetro: varchar("horimetro", { length: 50 }),
  /** horimetro | quilometragem | sem_medidor */
  tipoMedidor: varchar("tipoMedidor", { length: 30 }),
  valor: decimal("valor", { precision: 12, scale: 2 }),
  vidaUtil: varchar("vidaUtil", { length: 50 }),
  dataDesativacao: date("dataDesativacao"),
  /** Condição de aquisição: novo | usado */
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
  data: date("data", { mode: "string" }).notNull(),
  combustivel: mysqlEnum("combustivel", ["diesel", "gasolina", "etanol", "arla"]).notNull(),
  litros: decimal("litros", { precision: 8, scale: 2 }).notNull(),
  valorLitro: decimal("valorLitro", { precision: 8, scale: 3 }),
  valorTotal: decimal("valorTotal", { precision: 10, scale: 2 }),
  horimetro: varchar("horimetro", { length: 50 }),
  responsavel: varchar("responsavel", { length: 200 }),
  abastecidoNaFazenda: boolean("abastecidoNaFazenda").default(false),
  fazendaId: int("fazendaId"),
  /** Movimentação de saída gerada automaticamente (quando origem = estoque). */
  movimentacaoEstoqueId: int("movimentacaoEstoqueId"),
  /** registrado | estornado — estorno preserva o histórico e recompoe o estoque. */
  status: varchar("status", { length: 20 }).default("registrado"),
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
  data: date("data", { mode: "string" }).notNull(),
  custo: decimal("custo", { precision: 10, scale: 2 }),
  oficina: varchar("oficina", { length: 200 }),
  horimetro: varchar("horimetro", { length: 50 }),
  proximaManutencao: date("proximaManutencao", { mode: "string" }),
  status: varchar("status", { length: 50 }).default("agendada"),
  // Prestador de serviço (mão de obra externa)
  prestadorNome: varchar("prestadorNome", { length: 200 }),
  prestadorContato: varchar("prestadorContato", { length: 100 }),
  valorMaoObra: decimal("valorMaoObra", { precision: 10, scale: 2 }).default("0"),
  // Totais consolidados
  valorPecas: decimal("valorPecas", { precision: 10, scale: 2 }).default("0"),
  valorTotal: decimal("valorTotal", { precision: 10, scale: 2 }).default("0"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// Manutencao pecas table (itens de peças de uma manutenção)
export const manutencaoPecas = mysqlTable("manutencao_pecas", {
  id: int("id").primaryKey().autoincrement(),
  manutencaoId: int("manutencaoId").notNull(),
  estoqueId: int("estoqueId"),
  nome: varchar("nome", { length: 200 }).notNull(),
  quantidade: decimal("quantidade", { precision: 10, scale: 2 }).notNull().default("1"),
  valorUnitario: decimal("valorUnitario", { precision: 10, scale: 2 }).notNull().default("0"),
  valorTotal: decimal("valorTotal", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Histórico de brincos
export const historicoBrincos = mysqlTable("historico_brincos", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  animalId: int("animalId").notNull(),
  brincoAnterior: varchar("brincoAnterior", { length: 50 }),
  brincoNovo: varchar("brincoNovo", { length: 50 }).notNull(),
  motivo: mysqlEnum("motivo", ["perda", "danificado", "reidentificacao", "erro_cadastro", "outro"]).notNull().default("perda"),
  observacoes: text("observacoes"),
  dataAlteracao: date("dataAlteracao", { mode: "string" }).notNull(),
  usuarioNome: varchar("usuarioNome", { length: 200 }),
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
  estado: varchar("estado", { length: 50 }),
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

// Catálogo de produtos (ficha mestra, sem saldo por fazenda)
export const produtosCatalogo = mysqlTable("produtos_catalogo", {
  id: int("id").primaryKey().autoincrement(),
  nome: varchar("nome", { length: 100 }).notNull(),
  categoria: varchar("categoria", { length: 50 }),
  subcategoria: varchar("subcategoria", { length: 80 }),
  unidade: varchar("unidade", { length: 20 }),
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
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Estoque table (uses snake_case) — saldo por fazenda vinculado ao catálogo
export const estoque = mysqlTable("estoque", {
  id: int("id").primaryKey().autoincrement(),
  produtoId: int("produto_id"),
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
  /** Agrupa vários itens (produtos) da mesma movimentação administrativa. */
  grupoId: varchar("grupo_id", { length: 40 }),
  estoqueId: int("estoque_id").notNull(),
  /** Abastecimento que gerou esta saída (quando aplicável). */
  abastecimentoId: int("abastecimento_id"),
  fazendaId: int("fazenda_id"),
  /** Usuário que criou (createdByUserId). */
  userId: int("user_id"),
  registradoPor: varchar("registrado_por", { length: 150 }),
  tipo: varchar("tipo", { length: 40 }),
  dataMovimentacao: date("data_movimentacao", { mode: "string" }).notNull(),
  quantidade: decimal("quantidade", { precision: 12, scale: 2 }).notNull(),
  dataValidade: date("data_validade", { mode: "string" }),
  destino: varchar("destino", { length: 150 }),
  manejo: varchar("manejo", { length: 150 }),
  notaFiscal: varchar("nota_fiscal", { length: 60 }),
  frete: decimal("frete", { precision: 12, scale: 2 }),
  fornecedor: varchar("fornecedor", { length: 150 }),
  valor: decimal("valor", { precision: 12, scale: 2 }),
  observacoes: text("observacoes"),
  /** ativa | estornada | estorno */
  status: varchar("status", { length: 20 }).default("ativa"),
  /** grupoId da movimentação original (quando status = estorno). */
  originalGrupoId: varchar("original_grupo_id", { length: 40 }),
  motivoEstorno: varchar("motivo_estorno", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
  updatedByUserId: int("updated_by_user_id"),
  updatedByNome: varchar("updated_by_nome", { length: 150 }),
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

/** Estoque de sêmen — partidas por reprodutor + lote. */
export const semenPartidas = mysqlTable("semen_partidas", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  fazendaId: int("fazenda_id").notNull(),
  origemReprodutor: varchar("origem_reprodutor", { length: 20 }).notNull(),
  reprodutorKey: varchar("reprodutor_key", { length: 120 }).notNull(),
  machoId: int("macho_id"),
  reprodutorTexto: varchar("reprodutor_texto", { length: 500 }),
  partida: varchar("partida", { length: 120 }).notNull(),
  centralOrigem: varchar("central_origem", { length: 150 }),
  saldoDoses: int("saldo_doses").notNull().default(0),
  custoUnitario: decimal("custo_unitario", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 20 }).notNull().default("disponivel"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

/** Cadastro reutilizável de reprodutor/sêmen externo — identidade sem partida/estoque. */
export const semenReprodutoresExternos = mysqlTable("semen_reprodutores_externos", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  fazendaId: int("fazenda_id").notNull(),
  reprodutorKey: varchar("reprodutor_key", { length: 120 }).notNull(),
  reprodutorTexto: varchar("reprodutor_texto", { length: 500 }).notNull(),
  centralPadrao: varchar("central_padrao", { length: 150 }),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

/** Movimentações de sêmen (ENTRADA, SAIDA_IA, ESTORNO_ENTRADA, AJUSTE_ESTOQUE). */
export const semenMovimentacoes = mysqlTable("semen_movimentacoes", {
  id: int("id").primaryKey().autoincrement(),
  partidaId: int("partida_id").notNull(),
  userId: int("user_id").notNull(),
  fazendaId: int("fazenda_id").notNull(),
  tipo: varchar("tipo", { length: 20 }).notNull().default("ENTRADA"),
  dataEntrada: date("data_entrada", { mode: "string" }).notNull(),
  quantidadeDoses: int("quantidade_doses").notNull(),
  custoTotal: decimal("custo_total", { precision: 12, scale: 2 }).notNull(),
  custoUnitario: decimal("custo_unitario", { precision: 12, scale: 2 }).notNull(),
  observacoes: text("observacoes"),
  /** Vínculo auditável: estorno e nova entrada apontam para a ENTRADA original. */
  movimentacaoOrigemId: int("movimentacao_origem_id"),
  /** Agrupa original (via origem) + estorno + nova entrada da mesma correção. */
  grupoCorrecaoId: varchar("grupo_correcao_id", { length: 40 }),
  /** Motivo humano da correção (persistido no estorno). */
  motivoCorrecao: varchar("motivo_correcao", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Cadastro central de parceiros — fornecedores, clientes e funcionários. */
export const pessoas = mysqlTable("pessoas", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipo", ["fornecedor", "cliente", "funcionario"]).notNull(),
  funcao: varchar("funcao", { length: 150 }),
  documento: varchar("documento", { length: 20 }),
  endereco: varchar("endereco", { length: 255 }),
  telefone: varchar("telefone", { length: 30 }),
  email: varchar("email", { length: 150 }),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
