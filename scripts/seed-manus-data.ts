import { config } from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.");
}

const pool = mysql.createPool({ uri: databaseUrl, connectionLimit: 4 });

type Row = mysql.RowDataPacket;

async function one<T extends Row>(sql: string, params: unknown[] = []) {
  const [rows] = await pool.execute<T[]>(sql, params);
  return rows[0] ?? null;
}

async function many<T extends Row>(sql: string, params: unknown[] = []) {
  const [rows] = await pool.execute<T[]>(sql, params);
  return rows;
}

async function ensurePauloGomes() {
  const passwordHash = await bcrypt.hash("123456", 10);
  await pool.execute(
    `INSERT INTO users
      (openId, name, email, loginMethod, passwordHash, role, createdAt, updatedAt)
     VALUES ('local:pngomes1@gmail.com', 'Paulo Gomes', 'pngomes1@gmail.com', 'local', ?, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
      name = 'Paulo Gomes',
      email = 'pngomes1@gmail.com',
      loginMethod = 'local',
      passwordHash = VALUES(passwordHash),
      role = 'admin',
      updatedAt = CURRENT_TIMESTAMP`,
    [passwordHash],
  );

  const user = await one<Row>("SELECT id FROM users WHERE email = ? LIMIT 1", ["pngomes1@gmail.com"]);
  if (!user?.id) throw new Error("Não foi possível criar/localizar o usuário Paulo Gomes.");
  return Number(user.id);
}

async function cleanPreviousManusData(userId: number) {
  const fazendas = await many<Row>("SELECT id FROM fazendas WHERE userId = ?", [userId]);
  const fazendaIds = fazendas.map((f) => Number(f.id));
  const lotes = await many<Row>("SELECT id FROM lotes WHERE userId = ?", [userId]);
  const loteIds = lotes.map((l) => Number(l.id));
  const animais = await many<Row>("SELECT id FROM animais WHERE userId = ?", [userId]);
  const animalIds = animais.map((a) => Number(a.id));

  if (animalIds.length) {
    const marks = animalIds.map(() => "?").join(",");
    await pool.execute(`DELETE FROM historico_brincos WHERE userId = ? AND animalId IN (${marks})`, [userId, ...animalIds]);
    await pool.execute(`DELETE FROM pesagens WHERE userId = ? AND animalId IN (${marks})`, [userId, ...animalIds]);
    await pool.execute(`DELETE FROM saude_registros WHERE userId = ? AND animalId IN (${marks})`, [userId, ...animalIds]);
  }

  await pool.execute("DELETE FROM reproducao_registros WHERE userId = ?", [userId]);
  await pool.execute("DELETE FROM animal_lote_movimentacoes WHERE userId = ?", [userId]);

  if (loteIds.length) {
    const marks = loteIds.map(() => "?").join(",");
    await pool.execute(`DELETE FROM lote_pasto_movimentacoes WHERE userId = ? AND loteId IN (${marks})`, [userId, ...loteIds]);
  } else {
    await pool.execute("DELETE FROM lote_pasto_movimentacoes WHERE userId = ?", [userId]);
  }

  await pool.execute("DELETE FROM animais WHERE userId = ?", [userId]);
  await pool.execute("DELETE FROM lotes WHERE userId = ?", [userId]);
  await pool.execute("DELETE FROM pastos WHERE userId = ?", [userId]);
  await pool.execute("DELETE FROM fazendas WHERE userId = ?", [userId]);

  if (fazendaIds.length) {
    const marks = fazendaIds.map(() => "?").join(",");
    await pool.execute(`DELETE FROM estoque_movimentacoes WHERE fazenda_id IN (${marks})`, fazendaIds);
  }

  // Essas tabelas não têm userId no clone atual. Para reproduzir o painel Manus,
  // a base local precisa ficar sem contas/lançamentos e com apenas os 6 produtos do print.
  await pool.execute("DELETE FROM estoque_movimentacoes");
  await pool.execute("DELETE FROM estoque");
  await pool.execute("DELETE FROM movimentacoes");
  await pool.execute("DELETE FROM contas_financeiras");
}

async function insertFazenda(userId: number, nome: string, sigla: string, area: string) {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO fazendas
      (userId, nome, sigla, cidade, estado, pais, unidadeArea, area, areaLiquida, responsavel, atividadeCria, atividadeRecria, atividadeEngorda, observacoes)
     VALUES (?, ?, ?, 'Campo Grande', 'MS', 'Brasil', 'Hectare', ?, NULL, 'Paulo Gomes', 1, 1, 1, 'Registro reproduzido dos prints do sistema Manus em 23/06/2026')`,
    [userId, nome, sigla, area],
  );
  return result.insertId;
}

async function insertPasto(
  userId: number,
  fazendaId: number,
  nome: string,
  sigla: string,
  area: string,
  tipoPastagem: string,
  capacidade: number | null,
) {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO pastos
      (userId, fazendaId, nome, sigla, tipo, tipoPastagem, area, incluirArea, capacidade, status, observacoes)
     VALUES (?, ?, ?, ?, 'Pasto', ?, ?, 1, ?, 'ativo', 'Subdivisão reproduzida dos prints Manus')`,
    [userId, fazendaId, nome, sigla, tipoPastagem, area, capacidade],
  );
  return result.insertId;
}

async function insertLote(
  userId: number,
  nome: string,
  sigla: string,
  fazendaId: number | null,
  pastoAtualId: number | null,
  dataEntradaPasto: string | null,
) {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO lotes
      (userId, nome, sigla, dataCriacao, descricao, localizacao, capacidade, fazendaId, pastoAtualId, dataEntradaPasto, ativo)
     VALUES (?, ?, ?, '2026-06-01', 'Lote reproduzido dos prints Manus', ?, NULL, ?, ?, ?, 1)`,
    [userId, nome, sigla, pastoAtualId ? "Pasto vinculado" : null, fazendaId, pastoAtualId, dataEntradaPasto],
  );
  return result.insertId;
}

async function insertAnimal(input: {
  userId: number;
  brinco: string;
  categoria: string;
  sexo: "macho" | "femea";
  loteId: number;
  fazendaId: number;
  pastoId: number;
  dataNascimento: string;
  pesoAtual: string | null;
  raca: string | null;
  observacoes: string;
}) {
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO animais
      (userId, brinco, brincoEletronico, nome, raca, sexo, dataNascimento, pesoAtual, status, loteId, fazendaId, pastoId, categoria, castrado, dataEntrada, pesoEntrada, observacoes)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'ativo', ?, ?, ?, ?, 0, ?, NULL, ?)`,
    [
      input.userId,
      input.brinco,
      input.brinco,
      input.raca,
      input.sexo,
      input.dataNascimento,
      input.pesoAtual,
      input.loteId,
      input.fazendaId,
      input.pastoId,
      input.categoria,
      input.dataNascimento,
      input.observacoes,
    ],
  );
  return result.insertId;
}

async function insertPesagem(userId: number, animalId: number, data: string, peso: string, observacoes: string) {
  await pool.execute(
    "INSERT INTO pesagens (userId, animalId, peso, data, observacoes) VALUES (?, ?, ?, ?, ?)",
    [userId, animalId, peso, data, observacoes],
  );
}

async function insertCurrentLotePastoMove(
  userId: number,
  loteId: number,
  pastoId: number,
  dataEntrada: string,
  qtdAnimais: number,
  observacoes: string,
) {
  await pool.execute(
    `INSERT INTO lote_pasto_movimentacoes
      (userId, loteId, pastoOrigemId, pastoDestinoId, dataEntrada, dataSaida, diasNoPasto, qtdAnimais, observacoes)
     VALUES (?, ?, NULL, ?, ?, NULL, NULL, ?, ?)`,
    [userId, loteId, pastoId, dataEntrada, qtdAnimais, observacoes],
  );
}

async function insertProduto(input: {
  fazendaId: number;
  nome: string;
  categoria: string;
  subcategoria: string;
  unidade: string;
  quantidade: string;
  minima: string;
  valorUnitario: string;
  monitorar: boolean;
  observacoes?: string;
}) {
  await pool.execute(
    `INSERT INTO estoque
      (fazenda_id, nome, categoria, subcategoria, unidade, quantidade, quantidade_minima, monitorar_estoque, situacao, valor_unitario, observacoes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativo', ?, ?)`,
    [
      input.fazendaId,
      input.nome,
      input.categoria,
      input.subcategoria,
      input.unidade,
      input.quantidade,
      input.minima,
      input.monitorar ? 1 : 0,
      input.valorUnitario,
      input.observacoes ?? "Produto reproduzido da massa Manus em 23/06/2026",
    ],
  );
}

async function seed() {
  const userId = await ensurePauloGomes();
  await cleanPreviousManusData(userId);

  const fazendaJuniorId = await insertFazenda(userId, "Fazenda Junior", "FJ", "500.00");
  const fazendaVoltaGrandeId = await insertFazenda(userId, "Fazenda Volta Grande", "FVG", "999.00");

  const pasto01Id = await insertPasto(userId, fazendaVoltaGrandeId, "Pasto 01", "P-01", "15.00", "Braquiária", 1);
  const pasto02Id = await insertPasto(userId, fazendaVoltaGrandeId, "Pasto 02", "P-02", "10.00", "Braquiária", 1);
  const pasto03Id = await insertPasto(userId, fazendaJuniorId, "Pasto 03", "P-03", "15.00", "Tifton", null);
  const pasto04Id = await insertPasto(userId, fazendaJuniorId, "Pasto 04", "P-04", "20.00", "Mombaça", null);

  const loteBezerrosId = await insertLote(userId, "Bezerros", "BEZ", fazendaJuniorId, pasto03Id, null);
  await insertLote(userId, "Joao", "JOAO", null, null, null);
  const lotePrenhasId = await insertLote(userId, "Prenhas", "PRE", fazendaJuniorId, pasto04Id, null);
  const loteReprodutoresId = await insertLote(userId, "Reprodutores", "REP", fazendaVoltaGrandeId, pasto01Id, "2026-06-14");
  const loteVaziasId = await insertLote(userId, "Vazias", "VAZ", fazendaVoltaGrandeId, pasto01Id, "2026-06-15");

  const animal02 = await insertAnimal({
    userId,
    brinco: "02",
    categoria: "Novilho",
    sexo: "macho",
    loteId: loteReprodutoresId,
    fazendaId: fazendaVoltaGrandeId,
    pastoId: pasto01Id,
    dataNascimento: "2025-01-01",
    pesoAtual: "180.00",
    raca: "Nelore",
    observacoes: "Print Manus: 17 m, 538 dias na fazenda, último peso 180 kg, ganho +30, GMD 30.",
  });
  const animal03 = await insertAnimal({
    userId,
    brinco: "03",
    categoria: "Vaca",
    sexo: "femea",
    loteId: loteVaziasId,
    fazendaId: fazendaVoltaGrandeId,
    pastoId: pasto01Id,
    dataNascimento: "2023-01-01",
    pesoAtual: null,
    raca: null,
    observacoes: "Print Manus: 3a 5m, 1269 dias na fazenda, sem raça.",
  });
  const animal04 = await insertAnimal({
    userId,
    brinco: "04",
    categoria: "Bezerro",
    sexo: "macho",
    loteId: loteBezerrosId,
    fazendaId: fazendaJuniorId,
    pastoId: pasto03Id,
    dataNascimento: "2026-01-01",
    pesoAtual: null,
    raca: "Nelore",
    observacoes: "Print Manus: 5 m, 173 dias na fazenda.",
  });
  const animal05 = await insertAnimal({
    userId,
    brinco: "05",
    categoria: "Vaca",
    sexo: "femea",
    loteId: lotePrenhasId,
    fazendaId: fazendaJuniorId,
    pastoId: pasto04Id,
    dataNascimento: "2022-06-02",
    pesoAtual: null,
    raca: "Nelore",
    observacoes: "Print Manus: 4 anos, 1482 dias na fazenda.",
  });
  const animal25 = await insertAnimal({
    userId,
    brinco: "25",
    categoria: "Bezerro",
    sexo: "macho",
    loteId: loteReprodutoresId,
    fazendaId: fazendaVoltaGrandeId,
    pastoId: pasto01Id,
    dataNascimento: "2026-06-01",
    pesoAtual: null,
    raca: "Nelore",
    observacoes: "Print Manus: < 1 m, 22 dias na fazenda, nascimento no mês.",
  });
  const animal55 = await insertAnimal({
    userId,
    brinco: "55",
    categoria: "Boi",
    sexo: "macho",
    loteId: loteReprodutoresId,
    fazendaId: fazendaVoltaGrandeId,
    pastoId: pasto01Id,
    dataNascimento: "2023-01-01",
    pesoAtual: "220.00",
    raca: "Nelore",
    observacoes: "Print Manus: 3a 5m, 1269 dias na fazenda, último peso 220 kg, ganho +20, GMD 20.",
  });

  await insertPesagem(userId, animal02, "2026-06-22", "150.00", "Pesagem inicial para reproduzir ganho +30 kg no print Manus.");
  await insertPesagem(userId, animal02, "2026-06-23", "180.00", "Pesagem final do print Manus.");
  await insertPesagem(userId, animal55, "2026-06-22", "200.00", "Pesagem inicial para reproduzir ganho +20 kg no print Manus.");
  await insertPesagem(userId, animal55, "2026-06-23", "220.00", "Pesagem final do print Manus.");

  await insertCurrentLotePastoMove(userId, loteReprodutoresId, pasto01Id, "2026-06-14", 3, "Entrada no pasto conforme Mapa do Rebanho Manus.");
  await insertCurrentLotePastoMove(userId, loteVaziasId, pasto01Id, "2026-06-15", 1, "Entrada no pasto conforme Mapa do Rebanho Manus.");

  await insertProduto({
    fazendaId: fazendaVoltaGrandeId,
    nome: "Fosfosal",
    categoria: "Outros Insumos",
    subcategoria: "Suplemento mineral",
    unidade: "ml",
    quantidade: "0.00",
    minima: "500.00",
    valorUnitario: "0.00",
    monitorar: true,
    observacoes: "Alerta visível no painel Manus: Fosfosal 0/500 ml.",
  });

  // Os nomes dos outros 5 produtos não aparecem nos prints enviados. Eles ficam
  // cadastrados para fechar exatamente os totais visíveis: 6 produtos e R$ 8,7 mil.
  await insertProduto({ fazendaId: fazendaVoltaGrandeId, nome: "Produto Manus 01", categoria: "Outros Insumos", subcategoria: "Item não visível no print", unidade: "un", quantidade: "1.00", minima: "0.00", valorUnitario: "2000.00", monitorar: false });
  await insertProduto({ fazendaId: fazendaVoltaGrandeId, nome: "Produto Manus 02", categoria: "Outros Insumos", subcategoria: "Item não visível no print", unidade: "un", quantidade: "1.00", minima: "0.00", valorUnitario: "1500.00", monitorar: false });
  await insertProduto({ fazendaId: fazendaJuniorId, nome: "Produto Manus 03", categoria: "Outros Insumos", subcategoria: "Item não visível no print", unidade: "un", quantidade: "1.00", minima: "0.00", valorUnitario: "1800.00", monitorar: false });
  await insertProduto({ fazendaId: fazendaJuniorId, nome: "Produto Manus 04", categoria: "Outros Insumos", subcategoria: "Item não visível no print", unidade: "un", quantidade: "1.00", minima: "0.00", valorUnitario: "1700.00", monitorar: false });
  await insertProduto({ fazendaId: fazendaJuniorId, nome: "Produto Manus 05", categoria: "Outros Insumos", subcategoria: "Item não visível no print", unidade: "un", quantidade: "1.00", minima: "0.00", valorUnitario: "1700.00", monitorar: false });

  const [summary] = await pool.execute<Row[]>(
    `SELECT
      (SELECT COUNT(*) FROM animais WHERE userId = ?) AS animais,
      (SELECT COUNT(*) FROM fazendas WHERE userId = ?) AS fazendas,
      (SELECT COUNT(*) FROM pastos WHERE userId = ?) AS pastos,
      (SELECT COUNT(*) FROM lotes WHERE userId = ?) AS lotes,
      (SELECT COUNT(*) FROM estoque) AS produtos,
      (SELECT COALESCE(SUM(quantidade * valor_unitario), 0) FROM estoque) AS valorEstoque`,
    [userId, userId, userId, userId],
  );
  const s = summary[0];
  console.log(
    `Dados Manus prontos: ${s.animais} animais, ${s.fazendas} fazendas, ${s.pastos} pastos visíveis, ${s.lotes} lotes, ${s.produtos} produtos, R$ ${Number(s.valorEstoque).toLocaleString("pt-BR")}.`,
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
