/**
 * Migração REAL `.local-data` / `.dev-data` (whitelist A/B) → MySQL.
 *
 * Execução:
 *   pnpm exec tsx scripts/import-local-data-to-mysql.ts
 *
 * Uma transação. ROLLBACK se qualquer validação falhar.
 * Não altera o dry-run. Não altera JSON. Não inicia o servidor.
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import {
  explodeManutencaoPecas,
  formatDryRunReport,
  LOCAL_DATA_FILES,
  runDryRun,
} from "./import-local-data-to-mysql.dry-run";
import {
  ALL_SCHEMA_TABLES,
  assertDestinationEmpty,
  assertNoDemoImported,
  buildManutencaoPecaRow,
  DEMO_SIGNATURES,
  ESTOQUE_REFERENCIADO_IDS,
  EXPECTED_DATABASE,
  EXPECTED_USER_ID,
  expectedLoteIds,
  INSERT_ORDER,
  LOTE1_REFS_ESPERADAS,
  OFFICIAL_ADMIN,
  pick,
  rejectLoteId1,
  remapDevUserId,
  resolveOfficialAdmin,
  sameNumber,
  sqlValue,
  TARGET_TABLES,
  toBool,
  toDate,
  toDecimal,
  toInt,
  toTimestamp,
} from "./import-local-data-to-mysql.lib";

type Rec = Record<string, unknown>;
type Conn = mysql.Connection;

function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function loadEnv(root: string) {
  config({ path: path.join(root, ".env.local") });
  config({ path: path.join(root, ".env") });
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function asRows(value: unknown): Rec[] {
  return Array.isArray(value) ? value.filter((row): row is Rec => !!row && typeof row === "object") : [];
}

function asRec(value: unknown): Rec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

async function insertRow(conn: Conn, table: string, data: Rec): Promise<void> {
  const cols = Object.keys(data);
  const sql = `INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
  await conn.execute(sql, cols.map(c => sqlValue(data[c] ?? null)));
}

async function countTable(conn: Conn, table: string): Promise<number> {
  const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
  return Number((rows as { c: number }[])[0]?.c ?? 0);
}

async function requireEmptyTargets(conn: Conn) {
  const [tableRows] = await conn.query("SHOW TABLES");
  const present = new Set(
    (tableRows as Record<string, string>[]).map(row => String(Object.values(row)[0] ?? "")),
  );
  const missing = ALL_SCHEMA_TABLES.filter(table => !present.has(table));
  if (missing.length) {
    throw new Error(`Schema incompleto no destino: faltam ${missing.join(", ")}. Abortado.`);
  }
  const counts: Record<string, number> = {};
  for (const table of ALL_SCHEMA_TABLES) {
    counts[table] = await countTable(conn, table);
  }
  assertDestinationEmpty(counts);
}

async function requireLotesUserId(conn: Conn) {
  const [rows] = await conn.query("SHOW COLUMNS FROM `lotes` LIKE 'userId'");
  const col = (rows as { Field?: string; Type?: string; Null?: string }[])[0];
  if (!col) throw new Error("lotes.userId ausente no destino. Abortado.");
  if (!String(col.Type).toLowerCase().includes("int")) throw new Error(`lotes.userId tipo inesperado: ${col.Type}`);
  if (String(col.Null).toUpperCase() === "YES") throw new Error("lotes.userId está nullable. Abortado.");
}

function requireUserId1(row: Rec, origem: string) {
  const userId = toInt(pick(row, "userId", "user_id"));
  if (userId != null && userId !== EXPECTED_USER_ID) {
    throw new Error(`${origem} id=${String(row.id)} tem userId=${userId}, esperado ${EXPECTED_USER_ID}.`);
  }
}

function baseUser(row: Rec, origem: string): number {
  requireUserId1(row, origem);
  return EXPECTED_USER_ID;
}

function fazendaRow(row: Rec): Rec {
  return {
    id: toInt(row.id),
    userId: baseUser(row, "fazendas"),
    nome: pick(row, "nome"),
    sigla: pick(row, "sigla"),
    cidade: pick(row, "cidade"),
    estado: pick(row, "estado"),
    pais: pick(row, "pais"),
    unidadeArea: pick(row, "unidadeArea"),
    area: toDecimal(pick(row, "area")),
    areaReserva: toDecimal(pick(row, "areaReserva")),
    areaLiquida: toDecimal(pick(row, "areaLiquida")),
    endereco: pick(row, "endereco"),
    cep: pick(row, "cep"),
    telefone: pick(row, "telefone"),
    responsavel: pick(row, "responsavel"),
    atividadePrincipal: pick(row, "atividadePrincipal"),
    atividadeCria: toBool(pick(row, "atividadeCria")),
    atividadeRecria: toBool(pick(row, "atividadeRecria")),
    atividadeEngorda: toBool(pick(row, "atividadeEngorda")),
    atividadeConfinamento: toBool(pick(row, "atividadeConfinamento")),
    atividadeLeite: toBool(pick(row, "atividadeLeite")),
    atividadeAgricultura: toBool(pick(row, "atividadeAgricultura")),
    atividadeOutros: toBool(pick(row, "atividadeOutros")),
    quantidadeAnimais: toInt(pick(row, "quantidadeAnimais")),
    cpfCnpj: pick(row, "cpfCnpj"),
    inscricaoEstadual: pick(row, "inscricaoEstadual"),
    registroIncra: pick(row, "registroIncra"),
    nirf: pick(row, "nirf"),
    numeroCar: pick(row, "numeroCar"),
    matriculaImovel: pick(row, "matriculaImovel"),
    matriculasImovel: pick(row, "matriculasImovel"),
    tipoPosse: pick(row, "tipoPosse"),
    possuiSisbov: toBool(pick(row, "possuiSisbov")),
    razaoSocial: pick(row, "razaoSocial"),
    latitude: pick(row, "latitude"),
    longitude: pick(row, "longitude"),
    distanciaMunicipio: toDecimal(pick(row, "distanciaMunicipio")),
    valorHectare: toDecimal(pick(row, "valorHectare")),
    fonteEnergia: pick(row, "fonteEnergia"),
    fonteAgua: pick(row, "fonteAgua"),
    responsavelOperacionalNome: pick(row, "responsavelOperacionalNome"),
    responsavelOperacionalTelefone: pick(row, "responsavelOperacionalTelefone"),
    responsavelOperacionalFuncao: pick(row, "responsavelOperacionalFuncao"),
    melhoramentoGenetico: pick(row, "melhoramentoGenetico"),
    configReproPipeline: pick(row, "configReproPipeline"),
    observacoes: pick(row, "observacoes"),
    createdAt: toTimestamp(pick(row, "createdAt")),
    updatedAt: toTimestamp(pick(row, "updatedAt")),
  };
}

function pastoRow(row: Rec): Rec {
  return {
    id: toInt(row.id),
    userId: baseUser(row, "pastos"),
    fazendaId: toInt(row.fazendaId),
    nome: pick(row, "nome"),
    sigla: pick(row, "sigla"),
    tipo: pick(row, "tipo"),
    tipoPastagem: pick(row, "tipoPastagem"),
    area: toDecimal(pick(row, "area")),
    incluirArea: toBool(pick(row, "incluirArea")),
    capacidade: toInt(pick(row, "capacidade")),
    status: pick(row, "status"),
    coordenadas: pick(row, "coordenadas"),
    observacoes: pick(row, "observacoes"),
    createdAt: toTimestamp(pick(row, "createdAt")),
    updatedAt: toTimestamp(pick(row, "updatedAt")),
  };
}

function loteRow(row: Rec): Rec {
  const id = toInt(row.id);
  rejectLoteId1(id);
  return {
    id,
    userId: baseUser(row, "lotes"),
    nome: pick(row, "nome"),
    sigla: pick(row, "sigla"),
    dataCriacao: toDate(pick(row, "dataCriacao")),
    descricao: pick(row, "descricao"),
    localizacao: pick(row, "localizacao"),
    capacidade: toInt(pick(row, "capacidade")),
    fazendaId: toInt(pick(row, "fazendaId")),
    pastoAtualId: toInt(pick(row, "pastoAtualId")),
    dataEntradaPasto: toDate(pick(row, "dataEntradaPasto")),
    ativo: toBool(pick(row, "ativo")),
    createdAt: toTimestamp(pick(row, "createdAt")),
    updatedAt: toTimestamp(pick(row, "updatedAt")),
  };
}

function animalRow(row: Rec): Rec {
  return {
    id: toInt(row.id),
    userId: baseUser(row, "animais"),
    brinco: pick(row, "brinco"),
    brincoEletronico: pick(row, "brincoEletronico"),
    nome: pick(row, "nome"),
    raca: pick(row, "raca"),
    sexo: pick(row, "sexo"),
    dataNascimento: toDate(pick(row, "dataNascimento")),
    pesoAtual: toDecimal(pick(row, "pesoAtual")),
    status: pick(row, "status"),
    loteId: toInt(pick(row, "loteId")),
    fazendaId: toInt(pick(row, "fazendaId")),
    pastoId: toInt(pick(row, "pastoId")),
    categoria: pick(row, "categoria"),
    pelagem: pick(row, "pelagem"),
    marca: pick(row, "marca"),
    dataDesmama: toDate(pick(row, "dataDesmama")),
    castrado: toBool(pick(row, "castrado")),
    dataEntrada: toDate(pick(row, "dataEntrada")),
    pesoEntrada: toDecimal(pick(row, "pesoEntrada")),
    produtorOrigem: pick(row, "produtorOrigem"),
    precoKg: toDecimal(pick(row, "precoKg")),
    frete: toDecimal(pick(row, "frete")),
    sisbov: pick(row, "sisbov"),
    dataRnd: toDate(pick(row, "dataRnd")),
    rgn: pick(row, "rgn"),
    rgd: pick(row, "rgd"),
    rastreadoNascimento: toBool(pick(row, "rastreadoNascimento")),
    maeId: toInt(pick(row, "maeId")),
    paiId: toInt(pick(row, "paiId")),
    pai: pick(row, "pai"),
    mae: pick(row, "mae"),
    observacoes: pick(row, "observacoes"),
    fotoUrl: pick(row, "fotoUrl"),
    createdAt: toTimestamp(pick(row, "createdAt")),
    updatedAt: toTimestamp(pick(row, "updatedAt")),
  };
}

async function insertMapped(conn: Conn, table: string, rows: Rec[], map: (row: Rec) => Rec): Promise<number> {
  for (const row of rows) {
    await insertRow(conn, table, map(row));
  }
  return rows.length;
}

type Validation = {
  counts: Record<string, number>;
  sentinelas: Array<{ nome: string; ok: boolean; detalhe: string }>;
  loteIds: number[];
  loteNomes: Array<{ id: number; nome: string }>;
  lote1Existe: boolean;
  lote1Refs: number;
  vendas: number;
  vendaItens: number;
  compras: number;
  batidas: number;
  fazendaNomes: string[];
  animaisCheck: Array<{ id: number; brinco: string | null }>;
  pecas: number;
  estoqueRefs: number[];
  semenPartidaSaldo: number | null;
};

async function readValidation(conn: Conn, expected: Record<string, number>): Promise<Validation> {
  const counts: Record<string, number> = {};
  for (const table of Object.keys(expected)) {
    counts[table] = await countTable(conn, table);
  }
  const [a25rows] = await conn.query(
    "SELECT id, userId, fazendaId, brincoEletronico, status, pesoAtual FROM animais WHERE id=25",
  );
  const [a26rows] = await conn.query(
    "SELECT id, userId, fazendaId, brincoEletronico, status, pesoAtual FROM animais WHERE id=26",
  );
  const [p35rows] = await conn.query("SELECT id, animalId, peso FROM pesagens WHERE id=35");
  const [p36rows] = await conn.query("SELECT id, animalId, peso FROM pesagens WHERE id=36");
  const a25 = (a25rows as Rec[])[0];
  const a26 = (a26rows as Rec[])[0];
  const p35 = (p35rows as Rec[])[0];
  const p36 = (p36rows as Rec[])[0];

  const sentinelas = [
    {
      nome: "801",
      ok: Boolean(
        a25 &&
          toInt(a25.id) === 25 &&
          toInt(a25.userId) === 1 &&
          toInt(a25.fazendaId) === 1 &&
          String(a25.brincoEletronico ?? "").trim() === "963000400650144" &&
          String(a25.status) === "ativo" &&
          sameNumber(a25.pesoAtual, 300) &&
          p35 &&
          toInt(p35.animalId) === 25 &&
          sameNumber(p35.peso, 300),
      ),
      detalhe: a25
        ? `id=${a25.id} userId=${a25.userId} fazendaId=${a25.fazendaId} rfid=${a25.brincoEletronico} status=${a25.status} peso=${a25.pesoAtual} pesagem35=${p35?.peso}`
        : "animal 25 ausente",
    },
    {
      nome: "802",
      ok: Boolean(
        a26 &&
          toInt(a26.id) === 26 &&
          toInt(a26.userId) === 1 &&
          toInt(a26.fazendaId) === 1 &&
          String(a26.brincoEletronico ?? "").trim() === "963000400650051" &&
          String(a26.status) === "ativo" &&
          sameNumber(a26.pesoAtual, 400) &&
          p36 &&
          toInt(p36.animalId) === 26 &&
          sameNumber(p36.peso, 400),
      ),
      detalhe: a26
        ? `id=${a26.id} userId=${a26.userId} fazendaId=${a26.fazendaId} rfid=${a26.brincoEletronico} status=${a26.status} peso=${a26.pesoAtual} pesagem36=${p36?.peso}`
        : "animal 26 ausente",
    },
  ];

  const [loteRows] = await conn.query("SELECT id, nome FROM lotes ORDER BY id");
  const loteNomes = (loteRows as Rec[]).map(r => ({ id: toInt(r.id) ?? -1, nome: String(r.nome ?? "") }));
  const loteIds = loteNomes.map(r => r.id).filter(id => id > 0);
  const [lote1] = await conn.query("SELECT id FROM lotes WHERE id=1");
  const [lote1RefRows] = await conn.query(
    "SELECT COUNT(*) AS c FROM animal_lote_movimentacoes WHERE loteOrigemId=1 OR loteDestinoId=1",
  );
  const [vendas] = await conn.query("SELECT COUNT(*) AS c FROM vendas");
  const [itens] = await conn.query("SELECT COUNT(*) AS c FROM venda_itens");
  const [compras] = await conn.query("SELECT COUNT(*) AS c FROM compras");
  const [batidas] = await conn.query("SELECT COUNT(*) AS c FROM batidas");
  const [fazendaRows] = await conn.query("SELECT id, nome FROM fazendas ORDER BY id");
  const [animalCheckRows] = await conn.query("SELECT id, brinco FROM animais WHERE id IN (1,2) ORDER BY id");
  const [pecaRows] = await conn.query("SELECT COUNT(*) AS c FROM manutencao_pecas");
  const [estoqueRefRows] = await conn.query(
    `SELECT id FROM estoque WHERE id IN (${ESTOQUE_REFERENCIADO_IDS.join(",")}) ORDER BY id`,
  );
  const [semenRows] = await conn.query("SELECT id, saldo_doses FROM semen_partidas WHERE id=1");

  return {
    counts,
    sentinelas,
    loteIds,
    loteNomes,
    lote1Existe: (lote1 as Rec[]).length > 0,
    lote1Refs: Number((lote1RefRows as { c: number }[])[0]?.c ?? 0),
    vendas: Number((vendas as { c: number }[])[0]?.c ?? 0),
    vendaItens: Number((itens as { c: number }[])[0]?.c ?? 0),
    compras: Number((compras as { c: number }[])[0]?.c ?? 0),
    batidas: Number((batidas as { c: number }[])[0]?.c ?? 0),
    fazendaNomes: (fazendaRows as Rec[]).map(r => String(r.nome ?? "")),
    animaisCheck: (animalCheckRows as Rec[]).map(r => ({ id: toInt(r.id) ?? -1, brinco: r.brinco == null ? null : String(r.brinco) })),
    pecas: Number((pecaRows as { c: number }[])[0]?.c ?? 0),
    estoqueRefs: (estoqueRefRows as Rec[]).map(r => toInt(r.id)).filter((id): id is number => id != null),
    semenPartidaSaldo: toInt((semenRows as Rec[])[0]?.saldo_doses ?? (semenRows as Rec[])[0]?.saldoDoses),
  };
}

function assertValidation(v: Validation, expected: Record<string, number>) {
  const mismatches: string[] = [];
  for (const [table, n] of Object.entries(expected)) {
    if (v.counts[table] !== n) mismatches.push(`${table}: esperado ${n}, obtido ${v.counts[table]}`);
  }
  for (const s of v.sentinelas) {
    if (!s.ok) mismatches.push(`sentinela ${s.nome}: ${s.detalhe}`);
  }
  if (v.lote1Existe) mismatches.push("lote id 1 foi criado");
  const expectedLotes = expectedLoteIds();
  if (v.loteIds.join(",") !== expectedLotes.join(",")) {
    mismatches.push(`lotes ids ${v.loteIds.join(",")} != ${expectedLotes.join(",")}`);
  }
  if (v.vendas !== 0 || v.vendaItens !== 0) mismatches.push(`vendas=${v.vendas} venda_itens=${v.vendaItens}`);
  if (v.compras !== 0 || v.batidas !== 0) mismatches.push(`compras=${v.compras} batidas=${v.batidas}`);
  if (v.lote1Refs !== LOTE1_REFS_ESPERADAS) {
    mismatches.push(`refs históricas lote 1: ${v.lote1Refs} != ${LOTE1_REFS_ESPERADAS}`);
  }
  if (v.pecas !== (expected.manutencao_pecas ?? 0)) {
    mismatches.push(`manutencao_pecas=${v.pecas} != ${expected.manutencao_pecas}`);
  }
  if (v.estoqueRefs.join(",") !== ESTOQUE_REFERENCIADO_IDS.join(",")) {
    mismatches.push(`estoque referenciado ${v.estoqueRefs.join(",")} != ${ESTOQUE_REFERENCIADO_IDS.join(",")}`);
  }
  if (v.semenPartidaSaldo !== 20) mismatches.push(`semen_partidas.id=1 saldo=${String(v.semenPartidaSaldo)}`);
  try {
    assertNoDemoImported({
      fazendaNomes: v.fazendaNomes,
      lotes: v.loteNomes,
      animais: v.animaisCheck,
    });
  } catch (error) {
    mismatches.push(error instanceof Error ? error.message : String(error));
  }
  for (const fazenda of DEMO_SIGNATURES.fazendasReais) {
    if (!v.fazendaNomes.includes(fazenda.nome)) mismatches.push(`fazenda real '${fazenda.nome}' ausente`);
  }
  if (mismatches.length) throw new Error(`Validação falhou:\n- ${mismatches.join("\n- ")}`);
}

export async function runRealImport(root: string): Promise<{
  committed: boolean;
  adminSource: string;
  inserted: Record<string, number>;
  preCommit: Validation;
  postCommit: Validation;
  autoIncrement: Array<{ table: string; autoIncrement: number | null; maxId: number; ok: boolean }>;
  alteredAutoIncrement: string[];
}> {
  loadEnv(root);
  const dry = runDryRun(root);
  console.log(formatDryRunReport(dry));
  if (!dry.apto) throw new Error("Dry-run não está APTO. Abortado sem escrita.");
  if (!dry.sentinelas.every(s => s.ok)) throw new Error("Sentinelas do dry-run falharam. Abortado.");

  const admin = resolveOfficialAdmin(process.env);
  if (admin.id !== 1) throw new Error("Admin resolvido sem id 1. Abortado.");
  if (!admin.openId || !admin.name) throw new Error("openId/name do usuário 1 ausentes. Abortado.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL ausente.");
  const creds = parseDatabaseUrl(databaseUrl);
  if (creds.database !== EXPECTED_DATABASE) {
    throw new Error(`Database inesperado: ${creds.database}`);
  }

  const localDir = path.join(root, ".local-data");
  const local: Record<string, Rec[]> = {};
  for (const file of LOCAL_DATA_FILES) {
    local[file] = asRows(readJson(path.join(localDir, file)));
  }
  const dev = asRec(readJson(path.join(root, ".dev-data", "local.json")));
  const produtos = asRows(dev.produtosCatalogo);
  const estoque = asRows(dev.estoque);
  const estoqueMovs = asRows(dev.movimentacoes);
  const pessoas = asRows(dev.pessoas);
  const contas = asRows(dev.contas);
  const financeiro = asRows(dev.financeiroMovimentacoes);

  if (local["lotes.json"].some(row => toInt(row.id) === 1)) {
    throw new Error("lotes.json contém id 1. Abortado.");
  }

  const pecas = local["manutencoes.json"].flatMap(row => explodeManutencaoPecas(row).pecas);

  const expected: Record<string, number> = {
    users: 1,
    fazendas: local["fazendas.json"].length,
    pastos: local["pastos.json"].length,
    lotes: local["lotes.json"].length,
    animais: local["animais.json"].length,
    produtos_catalogo: produtos.length,
    estoque: estoque.length,
    estoque_movimentacoes: estoqueMovs.length,
    pesagens: local["pesagens.json"].length,
    historico_brincos: local["historico-brincos.json"].length,
    animal_baixas: local["animal-baixas.json"].length,
    saude_registros: local["saude-registros.json"].length,
    reproducao_registros: local["reproducao-registros.json"].length,
    parto_crias: local["parto-crias.json"].length,
    animal_lote_movimentacoes: local["animal-lote-movimentacoes.json"].length,
    lote_pasto_movimentacoes: local["lote-pasto-movimentacoes.json"].length,
    maquinas: local["maquinas.json"].length,
    abastecimentos: local["abastecimentos.json"].length,
    manutencoes: local["manutencoes.json"].length,
    manutencao_pecas: pecas.length,
    benfeitorias: local["benfeitorias.json"].length,
    semen_reprodutores_externos: local["semen-reprodutores-externos.json"].length,
    semen_partidas: local["semen-partidas.json"].length,
    semen_movimentacoes: local["semen-movimentacoes.json"].length,
    pessoas: pessoas.length,
    contas_financeiras: contas.length,
    movimentacoes: financeiro.length,
    vendas: 0,
    venda_itens: 0,
    compras: 0,
    batidas: 0,
  };

  for (const row of pessoas) remapDevUserId(pick(row, "userId", "user_id"));
  for (const row of estoqueMovs) {
    const raw = pick(row, "userId", "user_id");
    if (raw != null && raw !== "") remapDevUserId(raw);
  }

  const conn = await mysql.createConnection({
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    database: creds.database,
    dateStrings: true,
    timezone: "Z",
  });

  const inserted: Record<string, number> = {};
  let preCommit!: Validation;

  try {
    await requireLotesUserId(conn);
    await requireEmptyTargets(conn);

    const passwordHash = await bcrypt.hash(admin.password, 12);
    await conn.beginTransaction();

    await insertRow(conn, "users", {
      id: 1,
      openId: admin.openId,
      name: admin.name,
      email: admin.email,
      loginMethod: admin.loginMethod,
      passwordHash,
      role: admin.role,
    });
    inserted.users = 1;

    inserted.fazendas = await insertMapped(conn, "fazendas", local["fazendas.json"], fazendaRow);
    inserted.pastos = await insertMapped(conn, "pastos", local["pastos.json"], pastoRow);
    inserted.lotes = await insertMapped(conn, "lotes", local["lotes.json"], loteRow);
    inserted.animais = await insertMapped(conn, "animais", local["animais.json"], animalRow);

    inserted.produtos_catalogo = await insertMapped(conn, "produtos_catalogo", produtos, row => ({
      id: toInt(row.id),
      nome: pick(row, "nome"),
      categoria: pick(row, "categoria"),
      subcategoria: pick(row, "subcategoria"),
      unidade: pick(row, "unidade"),
      fabricante: pick(row, "fabricante"),
      identificador_unico: pick(row, "identificadorUnico", "identificador_unico"),
      produzido_na_fazenda: toBool(pick(row, "produzidoNaFazenda", "produzido_na_fazenda")),
      controlar_saldo: toBool(pick(row, "controlarSaldo", "controlar_saldo")),
      monitorar_estoque: toBool(pick(row, "monitorarEstoque", "monitorar_estoque")),
      situacao: pick(row, "situacao"),
      embalagens: pick(row, "embalagens"),
      possui_carencia: toBool(pick(row, "possuiCarencia", "possui_carencia")),
      carencia_abate_dias: toInt(pick(row, "carenciaAbateDias", "carencia_abate_dias")),
      carencia_abate_unidade: pick(row, "carenciaAbateUnidade", "carencia_abate_unidade"),
      carencia_leite_dias: toInt(pick(row, "carenciaLeiteDias", "carencia_leite_dias")),
      observacoes_carencia: pick(row, "observacoesCarencia", "observacoes_carencia"),
      observacoes: pick(row, "observacoes"),
      created_at: toTimestamp(pick(row, "createdAt", "created_at")),
      updated_at: toTimestamp(pick(row, "updatedAt", "updated_at")),
    }));

    inserted.estoque = await insertMapped(conn, "estoque", estoque, row => ({
      id: toInt(row.id),
      produto_id: toInt(pick(row, "produtoId", "produto_id")),
      fazenda_id: toInt(pick(row, "fazendaId", "fazenda_id")),
      nome: pick(row, "nome"),
      categoria: pick(row, "categoria"),
      subcategoria: pick(row, "subcategoria"),
      unidade: pick(row, "unidade"),
      quantidade: toDecimal(pick(row, "quantidade")),
      quantidade_minima: toDecimal(pick(row, "quantidadeMinima", "quantidade_minima")),
      quantidade_maxima: toDecimal(pick(row, "quantidadeMaxima", "quantidade_maxima")),
      fabricante: pick(row, "fabricante"),
      identificador_unico: pick(row, "identificadorUnico", "identificador_unico"),
      produzido_na_fazenda: toBool(pick(row, "produzidoNaFazenda", "produzido_na_fazenda")),
      controlar_saldo: toBool(pick(row, "controlarSaldo", "controlar_saldo")),
      monitorar_estoque: toBool(pick(row, "monitorarEstoque", "monitorar_estoque")),
      situacao: pick(row, "situacao"),
      embalagens: pick(row, "embalagens"),
      possui_carencia: toBool(pick(row, "possuiCarencia", "possui_carencia")),
      carencia_abate_dias: toInt(pick(row, "carenciaAbateDias", "carencia_abate_dias")),
      carencia_abate_unidade: pick(row, "carenciaAbateUnidade", "carencia_abate_unidade"),
      carencia_leite_dias: toInt(pick(row, "carenciaLeiteDias", "carencia_leite_dias")),
      observacoes_carencia: pick(row, "observacoesCarencia", "observacoes_carencia"),
      valor_unitario: toDecimal(pick(row, "valorUnitario", "valor_unitario")),
      localizacao: pick(row, "localizacao"),
      observacoes: pick(row, "observacoes"),
      created_at: toTimestamp(pick(row, "createdAt", "created_at")),
      updated_at: toTimestamp(pick(row, "updatedAt", "updated_at")),
    }));

    inserted.estoque_movimentacoes = await insertMapped(conn, "estoque_movimentacoes", estoqueMovs, row => ({
      id: toInt(row.id),
      grupo_id: pick(row, "grupoId", "grupo_id"),
      estoque_id: toInt(pick(row, "estoqueId", "estoque_id")),
      abastecimento_id: toInt(pick(row, "abastecimentoId", "abastecimento_id")),
      fazenda_id: toInt(pick(row, "fazendaId", "fazenda_id")),
      user_id: pick(row, "userId", "user_id") == null ? null : remapDevUserId(pick(row, "userId", "user_id")),
      registrado_por: pick(row, "registradoPor", "registrado_por"),
      tipo: pick(row, "tipo"),
      data_movimentacao: toDate(pick(row, "dataMovimentacao", "data_movimentacao")),
      quantidade: toDecimal(pick(row, "quantidade")),
      data_validade: toDate(pick(row, "dataValidade", "data_validade")),
      destino: pick(row, "destino"),
      manejo: pick(row, "manejo"),
      nota_fiscal: pick(row, "notaFiscal", "nota_fiscal"),
      frete: toDecimal(pick(row, "frete")),
      fornecedor: pick(row, "fornecedor"),
      valor: toDecimal(pick(row, "valor")),
      observacoes: pick(row, "observacoes"),
      status: pick(row, "status"),
      original_grupo_id: pick(row, "originalGrupoId", "original_grupo_id"),
      motivo_estorno: pick(row, "motivoEstorno", "motivo_estorno"),
      created_at: toTimestamp(pick(row, "createdAt", "created_at")),
      updated_at: toTimestamp(pick(row, "updatedAt", "updated_at")),
      updated_by_user_id: toInt(pick(row, "updatedByUserId", "updated_by_user_id")),
      updated_by_nome: pick(row, "updatedByNome", "updated_by_nome"),
    }));

    inserted.pesagens = await insertMapped(conn, "pesagens", local["pesagens.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "pesagens"),
      animalId: toInt(row.animalId),
      peso: toDecimal(row.peso),
      data: toDate(row.data),
      observacoes: pick(row, "observacoes"),
      createdAt: toTimestamp(pick(row, "createdAt")),
    }));

    inserted.historico_brincos = await insertMapped(conn, "historico_brincos", local["historico-brincos.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "historico_brincos"),
      animalId: toInt(row.animalId),
      brincoAnterior: pick(row, "brincoAnterior"),
      brincoNovo: pick(row, "brincoNovo"),
      motivo: pick(row, "motivo"),
      observacoes: pick(row, "observacoes"),
      dataAlteracao: toDate(pick(row, "dataAlteracao")),
      usuarioNome: pick(row, "usuarioNome"),
      createdAt: toTimestamp(pick(row, "createdAt")),
    }));

    inserted.animal_baixas = await insertMapped(conn, "animal_baixas", local["animal-baixas.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "animal_baixas"),
      animalId: toInt(row.animalId),
      fazendaId: toInt(row.fazendaId),
      tipo: pick(row, "tipo"),
      dataBaixa: toDate(pick(row, "dataBaixa")),
      destino: pick(row, "destino"),
      motivo: pick(row, "motivo"),
      observacoes: pick(row, "observacoes"),
      usuarioNome: pick(row, "usuarioNome"),
      createdAt: toTimestamp(pick(row, "createdAt")),
    }));

    inserted.saude_registros = await insertMapped(conn, "saude_registros", local["saude-registros.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "saude_registros"),
      animalId: toInt(row.animalId),
      tipo: pick(row, "tipo"),
      descricao: pick(row, "descricao"),
      medicamento: pick(row, "medicamento"),
      dosagem: pick(row, "dosagem"),
      viaAplicacao: pick(row, "viaAplicacao"),
      estoqueId: toInt(pick(row, "estoqueId")),
      quantidadeConsumo: toDecimal(pick(row, "quantidadeConsumo")),
      valorUnitario: toDecimal(pick(row, "valorUnitario")),
      veterinario: pick(row, "veterinario"),
      custo: toDecimal(pick(row, "custo")),
      dataRegistro: toDate(pick(row, "dataRegistro")),
      proximaData: toDate(pick(row, "proximaData")),
      observacoes: pick(row, "observacoes"),
      createdAt: toTimestamp(pick(row, "createdAt")),
    }));

    inserted.reproducao_registros = await insertMapped(conn, "reproducao_registros", local["reproducao-registros.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "reproducao_registros"),
      femeaId: toInt(row.femeaId),
      machoId: toInt(row.machoId),
      tipo: pick(row, "tipo"),
      dataCobertura: toDate(pick(row, "dataCobertura")),
      dataPrevistoParto: toDate(pick(row, "dataPrevistoParto")),
      dataPartoReal: toDate(pick(row, "dataPartoReal")),
      resultado: pick(row, "resultado"),
      filhotes: toInt(pick(row, "filhotes")),
      observacoes: pick(row, "observacoes"),
      createdAt: toTimestamp(pick(row, "createdAt")),
    }));

    inserted.parto_crias = await insertMapped(conn, "parto_crias", local["parto-crias.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "parto_crias"),
      partoRegistroId: toInt(row.partoRegistroId),
      criaAnimalId: toInt(row.criaAnimalId),
      ordem: toInt(row.ordem) ?? 1,
      createdAt: toTimestamp(pick(row, "createdAt")),
    }));

    inserted.animal_lote_movimentacoes = await insertMapped(
      conn,
      "animal_lote_movimentacoes",
      local["animal-lote-movimentacoes.json"],
      row => ({
        id: toInt(row.id),
        userId: baseUser(row, "animal_lote_movimentacoes"),
        animalId: toInt(row.animalId),
        loteOrigemId: toInt(pick(row, "loteOrigemId")),
        loteDestinoId: toInt(row.loteDestinoId),
        pastoOrigemId: toInt(pick(row, "pastoOrigemId")),
        pastoDestinoId: toInt(pick(row, "pastoDestinoId")),
        fazendaId: toInt(pick(row, "fazendaId")),
        fazendaOrigemId: toInt(pick(row, "fazendaOrigemId")),
        dataMovimentacao: toDate(pick(row, "dataMovimentacao")),
        usuarioNome: pick(row, "usuarioNome"),
        observacoes: pick(row, "observacoes"),
        createdAt: toTimestamp(pick(row, "createdAt")),
      }),
    );

    inserted.lote_pasto_movimentacoes = await insertMapped(
      conn,
      "lote_pasto_movimentacoes",
      local["lote-pasto-movimentacoes.json"],
      row => ({
        id: toInt(row.id),
        userId: baseUser(row, "lote_pasto_movimentacoes"),
        loteId: toInt(row.loteId),
        pastoOrigemId: toInt(pick(row, "pastoOrigemId")),
        pastoDestinoId: toInt(pick(row, "pastoDestinoId")),
        dataEntrada: toDate(pick(row, "dataEntrada")),
        dataSaida: toDate(pick(row, "dataSaida")),
        diasNoPasto: toInt(pick(row, "diasNoPasto")),
        qtdAnimais: toInt(pick(row, "qtdAnimais")),
        observacoes: pick(row, "observacoes"),
        createdAt: toTimestamp(pick(row, "createdAt")),
      }),
    );

    inserted.maquinas = await insertMapped(conn, "maquinas", local["maquinas.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "maquinas"),
      fazendaId: toInt(pick(row, "fazendaId")),
      nome: pick(row, "nome"),
      tipo: pick(row, "tipo"),
      marca: pick(row, "marca"),
      modelo: pick(row, "modelo"),
      ano: toInt(pick(row, "ano")),
      anoAquisicao: toInt(pick(row, "anoAquisicao")),
      dataAquisicao: toDate(pick(row, "dataAquisicao")),
      placa: pick(row, "placa"),
      horimetro: pick(row, "horimetro"),
      tipoMedidor: pick(row, "tipoMedidor"),
      valor: toDecimal(pick(row, "valor")),
      vidaUtil: pick(row, "vidaUtil"),
      dataDesativacao: toDate(pick(row, "dataDesativacao")),
      estado: pick(row, "estado"),
      status: pick(row, "status"),
      imagem1: pick(row, "imagem1"),
      imagem2: pick(row, "imagem2"),
      imagem3: pick(row, "imagem3"),
      observacoes: pick(row, "observacoes"),
      createdAt: toTimestamp(pick(row, "createdAt")),
      updatedAt: toTimestamp(pick(row, "updatedAt")),
    }));

    inserted.abastecimentos = await insertMapped(conn, "abastecimentos", local["abastecimentos.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "abastecimentos"),
      maquinaId: toInt(row.maquinaId),
      data: toDate(row.data),
      combustivel: pick(row, "combustivel"),
      litros: toDecimal(pick(row, "litros")),
      valorLitro: toDecimal(pick(row, "valorLitro")),
      valorTotal: toDecimal(pick(row, "valorTotal")),
      horimetro: pick(row, "horimetro"),
      responsavel: pick(row, "responsavel"),
      abastecidoNaFazenda: toBool(pick(row, "abastecidoNaFazenda")),
      fazendaId: toInt(pick(row, "fazendaId")),
      movimentacaoEstoqueId: toInt(pick(row, "movimentacaoEstoqueId")),
      status: pick(row, "status"),
      fornecedor: pick(row, "fornecedor"),
      observacoes: pick(row, "observacoes"),
      createdAt: toTimestamp(pick(row, "createdAt")),
    }));

    inserted.manutencoes = await insertMapped(conn, "manutencoes", local["manutencoes.json"], row => {
      const principal = explodeManutencaoPecas(row).principal;
      return {
        id: toInt(principal.id),
        userId: baseUser(principal, "manutencoes"),
        maquinaId: toInt(principal.maquinaId),
        tipo: pick(principal, "tipo"),
        descricao: pick(principal, "descricao"),
        data: toDate(principal.data),
        custo: toDecimal(pick(principal, "custo")),
        oficina: pick(principal, "oficina"),
        horimetro: pick(principal, "horimetro"),
        proximaManutencao: toDate(pick(principal, "proximaManutencao")),
        status: pick(principal, "status"),
        prestadorNome: pick(principal, "prestadorNome"),
        prestadorContato: pick(principal, "prestadorContato"),
        valorMaoObra: toDecimal(pick(principal, "valorMaoObra")),
        valorPecas: toDecimal(pick(principal, "valorPecas")),
        valorTotal: toDecimal(pick(principal, "valorTotal")),
        observacoes: pick(principal, "observacoes"),
        createdAt: toTimestamp(pick(principal, "createdAt")),
        updatedAt: toTimestamp(pick(principal, "updatedAt")),
      };
    });

    inserted.manutencao_pecas = await insertMapped(conn, "manutencao_pecas", pecas, buildManutencaoPecaRow);

    inserted.benfeitorias = await insertMapped(conn, "benfeitorias", local["benfeitorias.json"], row => ({
      id: toInt(row.id),
      userId: baseUser(row, "benfeitorias"),
      fazendaId: toInt(pick(row, "fazendaId")),
      nome: pick(row, "nome"),
      tipo: pick(row, "tipo"),
      anoConstrucao: toInt(pick(row, "anoConstrucao")),
      vidaUtil: pick(row, "vidaUtil"),
      percentualAtividade: toDecimal(pick(row, "percentualAtividade")),
      localizacao: pick(row, "localizacao"),
      estado: pick(row, "estado"),
      status: pick(row, "status"),
      dataInstalacao: toDate(pick(row, "dataInstalacao")),
      valorEstimado: toDecimal(pick(row, "valorEstimado")),
      imagem1: pick(row, "imagem1"),
      imagem2: pick(row, "imagem2"),
      imagem3: pick(row, "imagem3"),
      observacoes: pick(row, "observacoes"),
      createdAt: toTimestamp(pick(row, "createdAt")),
      updatedAt: toTimestamp(pick(row, "updatedAt")),
    }));

    inserted.semen_reprodutores_externos = await insertMapped(
      conn,
      "semen_reprodutores_externos",
      local["semen-reprodutores-externos.json"],
      row => ({
        id: toInt(row.id),
        user_id: baseUser(row, "semen_reprodutores_externos"),
        fazenda_id: toInt(pick(row, "fazendaId", "fazenda_id")),
        reprodutor_key: pick(row, "reprodutorKey", "reprodutor_key"),
        reprodutor_texto: pick(row, "reprodutorTexto", "reprodutor_texto"),
        central_padrao: pick(row, "centralPadrao", "central_padrao"),
        observacoes: pick(row, "observacoes"),
        ativo: toBool(pick(row, "ativo")) ?? 1,
        created_at: toTimestamp(pick(row, "createdAt", "created_at")),
        updated_at: toTimestamp(pick(row, "updatedAt", "updated_at")),
      }),
    );

    inserted.semen_partidas = await insertMapped(conn, "semen_partidas", local["semen-partidas.json"], row => ({
      id: toInt(row.id),
      user_id: baseUser(row, "semen_partidas"),
      fazenda_id: toInt(pick(row, "fazendaId", "fazenda_id")),
      origem_reprodutor: pick(row, "origemReprodutor", "origem_reprodutor"),
      reprodutor_key: pick(row, "reprodutorKey", "reprodutor_key"),
      macho_id: toInt(pick(row, "machoId", "macho_id")),
      reprodutor_texto: pick(row, "reprodutorTexto", "reprodutor_texto"),
      partida: pick(row, "partida"),
      central_origem: pick(row, "centralOrigem", "central_origem"),
      saldo_doses: toInt(pick(row, "saldoDoses", "saldo_doses")) ?? 0,
      custo_unitario: toDecimal(pick(row, "custoUnitario", "custo_unitario")),
      status: pick(row, "status"),
      observacoes: pick(row, "observacoes"),
      created_at: toTimestamp(pick(row, "createdAt", "created_at")),
      updated_at: toTimestamp(pick(row, "updatedAt", "updated_at")),
    }));

    inserted.semen_movimentacoes = await insertMapped(conn, "semen_movimentacoes", local["semen-movimentacoes.json"], row => ({
      id: toInt(row.id),
      partida_id: toInt(pick(row, "partidaId", "partida_id")),
      user_id: baseUser(row, "semen_movimentacoes"),
      fazenda_id: toInt(pick(row, "fazendaId", "fazenda_id")),
      tipo: pick(row, "tipo"),
      data_entrada: toDate(pick(row, "dataEntrada", "data_entrada")),
      quantidade_doses: toInt(pick(row, "quantidadeDoses", "quantidade_doses")),
      custo_total: toDecimal(pick(row, "custoTotal", "custo_total")),
      custo_unitario: toDecimal(pick(row, "custoUnitario", "custo_unitario")),
      observacoes: pick(row, "observacoes"),
      movimentacao_origem_id: toInt(pick(row, "movimentacaoOrigemId", "movimentacao_origem_id")),
      grupo_correcao_id: pick(row, "grupoCorrecaoId", "grupo_correcao_id"),
      motivo_correcao: pick(row, "motivoCorrecao", "motivo_correcao"),
      created_at: toTimestamp(pick(row, "createdAt", "created_at")),
    }));

    inserted.pessoas = await insertMapped(conn, "pessoas", pessoas, row => ({
      id: toInt(row.id),
      user_id: remapDevUserId(pick(row, "userId", "user_id")),
      nome: pick(row, "nome"),
      tipo: pick(row, "tipo"),
      funcao: pick(row, "funcao"),
      documento: pick(row, "documento"),
      endereco: pick(row, "endereco"),
      telefone: pick(row, "telefone"),
      email: pick(row, "email"),
      observacoes: pick(row, "observacoes"),
      ativo: toBool(pick(row, "ativo")),
      created_at: toTimestamp(pick(row, "createdAt", "created_at")),
    }));

    inserted.contas_financeiras = await insertMapped(conn, "contas_financeiras", contas, row => ({
      id: toInt(row.id),
      nome: pick(row, "nome"),
      tipo: pick(row, "tipo"),
      banco: pick(row, "banco"),
      saldo_inicial: toDecimal(pick(row, "saldoInicial", "saldo_inicial")),
      saldo_atual: toDecimal(pick(row, "saldoAtual", "saldo_atual")),
      ativa: toBool(pick(row, "ativa")),
      created_at: toTimestamp(pick(row, "createdAt", "created_at")),
    }));

    inserted.movimentacoes = await insertMapped(conn, "movimentacoes", financeiro, row => ({
      id: toInt(row.id),
      conta_id: toInt(pick(row, "contaId", "conta_id")),
      categoria_id: toInt(pick(row, "categoriaId", "categoria_id")),
      tipo: pick(row, "tipo"),
      descricao: pick(row, "descricao"),
      valor: toDecimal(pick(row, "valor")),
      data: toDate(pick(row, "data")),
      status: pick(row, "status"),
      observacoes: pick(row, "observacoes"),
      created_at: toTimestamp(pick(row, "createdAt", "created_at")),
    }));

    preCommit = await readValidation(conn, expected);
    assertValidation(preCommit, expected);

    await conn.commit();
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* transação pode já ter caído */
    }
    await conn.end();
    throw error;
  }

  const postCommit = await readValidation(conn, expected);
  assertValidation(postCommit, expected);

  const autoIncrement: Array<{ table: string; autoIncrement: number | null; maxId: number; ok: boolean }> = [];
  for (const table of TARGET_TABLES) {
    // SHOW TABLE STATUS / information_schema.AUTO_INCREMENT pode vir NULL no MySQL 8.4
    // (estatística expirada). SHOW CREATE TABLE expõe o valor real sem ALTER e sem INSERT.
    const [createRows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    const createSql = String((createRows as { "Create Table"?: string }[])[0]?.["Create Table"] ?? "");
    const match = createSql.match(/AUTO_INCREMENT=(\d+)/i);
    const next = match ? Number(match[1]) : null;
    const [maxRows] = await conn.query(`SELECT COALESCE(MAX(id), 0) AS m FROM \`${table}\``);
    const maxId = Number((maxRows as { m: number }[])[0]?.m ?? 0);
    autoIncrement.push({
      table,
      autoIncrement: next,
      maxId,
      ok: maxId === 0 || (next != null && next > maxId),
    });
  }

  await conn.end();
  return {
    committed: true,
    adminSource: admin.source,
    inserted,
    preCommit,
    postCommit,
    autoIncrement,
    alteredAutoIncrement: [],
  };
}

function isDirectRun(): boolean {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return path.normalize(self) === path.normalize(invoked);
}

if (isDirectRun()) {
  const root = projectRoot();
  try {
    const result = await runRealImport(root);
    console.log("\n===== MIGRAÇÃO REAL =====");
    console.log(`Admin: ${result.adminSource} (${OFFICIAL_ADMIN.email})`);
    console.log("Inseridos:");
    for (const [table, n] of Object.entries(result.inserted)) {
      console.log(`- ${table}: ${n}`);
    }
    console.log("Sentinelas pré-COMMIT:", result.preCommit.sentinelas.map(s => `${s.nome} ${s.ok ? "OK" : "FALHOU"}`).join("; "));
    console.log("Sentinelas pós-COMMIT:", result.postCommit.sentinelas.map(s => `${s.nome} ${s.ok ? "OK" : "FALHOU"}`).join("; "));
    console.log(`vendas=${result.postCommit.vendas} venda_itens=${result.postCommit.vendaItens}`);
    console.log(`lote1=${result.postCommit.lote1Existe} lotes=${result.postCommit.loteIds.join(",")}`);
    console.log(`lote1Refs=${result.postCommit.lote1Refs} pecas=${result.postCommit.pecas}`);
    console.log(`Ordem: ${INSERT_ORDER.join(" → ")}`);
    console.log("AUTO_INCREMENT:");
    for (const row of result.autoIncrement) {
      console.log(`- ${row.table}: max=${row.maxId} next=${row.autoIncrement ?? "?"} ${row.ok ? "OK" : "REVISAR"}`);
    }
    console.log(result.committed ? "COMMIT realizado." : "ROLLBACK.");
    process.exit(0);
  } catch (error) {
    console.error("MIGRAÇÃO ABORTADA / ROLLBACK");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
