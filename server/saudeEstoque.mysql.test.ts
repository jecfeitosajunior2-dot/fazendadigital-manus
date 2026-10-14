import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { persistirCapital } from "../shared/estoqueCapital";
import { MSG_SAUDE_ESTORNO_DUPLO, MSG_SAUDE_ESTORNO_LEGADO, SAUDE_STATUS_ESTORNADO } from "../shared/saudeEstoque";
import {
  FIN_USER_A,
  fazendaIdDe,
  openFinanceiroMysqlHarness,
  resetFinanceiroMysqlHarness,
  seedFinanceiroMysqlUsers,
} from "./financeiroMysqlHarness";
import { persistirManejoSanitarioNoTx, estornarManejoSanitarioNoTx, SaudeEstoqueError } from "./saudeEstoque";
import { criarSaudeEstoqueTx, recusarEstornoGenericoSeSanitario } from "./saudeEstoqueMysql";
import { MSG_ESTORNO_GENERICO_SANITARIO } from "../shared/saudeEstoque";
import { ensureSaudeEstoqueSchema } from "./ensureSaudeEstoqueSchema";

const harness = await openFinanceiroMysqlHarness();

async function limparSaudeSintetica() {
  if (!harness) return;
  await harness.pool.query(`DELETE FROM \`saude_registros\` WHERE \`userId\` IN (?, ?)`, [910001, 910002]);
  await harness.pool.query(`DELETE FROM \`animais\` WHERE \`userId\` IN (?, ?)`, [910001, 910002]);
}

async function seedProduto(fazendaId: number) {
  await harness!.pool.query(
    `INSERT INTO \`estoque\`
      (\`nome\`, \`fazenda_id\`, \`quantidade\`, \`controlar_saldo\`, \`unidade\`, \`categoria\`,
       \`valor_unitario\`, \`valor_total_estoque\`, \`capital_inicializado_em\`)
     VALUES (?, ?, '10.00', 1, 'un', 'Farmácia', '10.000000', '100.00', ?)`,
    ["Vacina sintética sanitário", fazendaId, new Date()],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM estoque WHERE fazenda_id = ? AND nome = ? ORDER BY id DESC LIMIT 1`,
    [fazendaId, "Vacina sintética sanitário"],
  );
  return Number(rows[0]?.id);
}

async function seedAnimal(fazendaId: number) {
  await harness!.pool.query(
    `INSERT INTO \`animais\` (\`userId\`, \`brinco\`, \`sexo\`, \`fazendaId\`, \`status\`)
     VALUES (?, 'SYN-SAU-1', 'macho', ?, 'ativo')`,
    [FIN_USER_A, fazendaId],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM animais WHERE userId = ? AND brinco = 'SYN-SAU-1' ORDER BY id DESC LIMIT 1`,
    [FIN_USER_A],
  );
  return Number(rows[0]?.id);
}

describe.skipIf(!harness)("saudeEstoque — MySQL isolado", () => {
  const h = () => harness!;
  let fazendaA1: number;
  let animalId: number;
  let estoqueId: number;

  beforeAll(async () => {
    await ensureSaudeEstoqueSchema(h().pool);
    await resetFinanceiroMysqlHarness(h());
    await limparSaudeSintetica();
    await seedFinanceiroMysqlUsers(h());
  });

  beforeEach(async () => {
    await resetFinanceiroMysqlHarness(h());
    await limparSaudeSintetica();
    await seedFinanceiroMysqlUsers(h());
    fazendaA1 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A1");
    animalId = await seedAnimal(fazendaA1);
    estoqueId = await seedProduto(fazendaA1);
  });

  afterAll(async () => {
    if (harness) {
      await limparSaudeSintetica();
      await resetFinanceiroMysqlHarness(harness);
      await harness.close();
    }
  });

  function dbx() {
    return drizzle(h().pool, { schema, mode: "default" });
  }

  it("10/100 consome 2 → 8/80 snapshot 20; estorno devolve 10/100 sem financeiro", async () => {
    const created = await dbx().transaction(async (tx) => persistirManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      animalId,
      fazendaId: fazendaA1,
      tipo: "Vacinação",
      medicamento: "Vacina sintética sanitário",
      dosagem: "2 un",
      estoqueId,
      quantidadeConsumo: "2",
      valorUnitario: "10.00",
      custoPrevisto: "20.00",
      dataRegistro: "2026-10-12",
    }));

    const [itemApos] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(itemApos?.quantidade)).toBe(8);
    expect(persistirCapital(itemApos!.valor_total_estoque)).toBe("80.00");

    const [mov] = await h().query<{
      id: number;
      tipo: string;
      manejo: string | null;
      quantidade: string;
      valor: string | null;
      valor_estoque_movimentado: string;
      status: string;
    }[]>(
      `SELECT id, tipo, manejo, quantidade, valor, valor_estoque_movimentado, status
       FROM estoque_movimentacoes WHERE id = ?`,
      [created.movimentacaoId],
    );
    expect(Number(mov?.quantidade)).toBe(-2);
    expect(mov?.tipo).toBe("Saída");
    expect(mov?.manejo).toBe("Sanitário");
    expect(mov?.valor).toBeNull();
    expect(persistirCapital(mov!.valor_estoque_movimentado)).toBe("20.00");
    expect(mov?.status).toBe("ativa");

    const [saude] = await h().query<{
      id: number;
      custo: string;
      status: string;
      estoqueMovimentacaoId: number;
    }[]>(
      `SELECT id, custo, status, estoqueMovimentacaoId FROM saude_registros WHERE id = ?`,
      [created.id],
    );
    expect(saude?.estoqueMovimentacaoId).toBe(created.movimentacaoId);
    expect(persistirCapital(saude!.custo)).toBe("20.00");
    expect(saude?.status).toBe("ativo");

    const titulos = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM financeiro_titulos WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(titulos[0]?.n)).toBe(0);

    await dbx().transaction(async (tx) => estornarManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      id: created.id,
      hojeISO: "2026-10-13",
    }));

    const [itemFinal] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(itemFinal?.quantidade)).toBe(10);
    expect(persistirCapital(itemFinal!.valor_total_estoque)).toBe("100.00");

    const [saudeFinal] = await h().query<{
      id: number;
      status: string;
      estoqueMovimentacaoId: number;
    }[]>(
      `SELECT id, status, estoqueMovimentacaoId FROM saude_registros WHERE id = ?`,
      [created.id],
    );
    expect(saudeFinal).toBeTruthy();
    expect(saudeFinal?.status).toBe(SAUDE_STATUS_ESTORNADO);
    expect(saudeFinal?.estoqueMovimentacaoId).toBe(created.movimentacaoId);

    const inversas = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ? AND status = 'estorno'`,
      [FIN_USER_A],
    );
    expect(Number(inversas[0]?.n)).toBe(1);

    const titulosDepois = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM financeiro_titulos WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(titulosDepois[0]?.n)).toBe(0);

    await expect(dbx().transaction(async (tx) => estornarManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      id: created.id,
      hojeISO: "2026-10-13",
    }))).rejects.toThrow(MSG_SAUDE_ESTORNO_DUPLO);
  });

  it("legado sem vínculo não inventa capital", async () => {
    await h().pool.query(
      `INSERT INTO \`saude_registros\`
        (\`userId\`, \`animalId\`, \`tipo\`, \`estoqueId\`, \`quantidadeConsumo\`, \`custo\`, \`dataRegistro\`, \`status\`)
       VALUES (?, ?, 'Vacinação', ?, '2.0000', '20.00', '2026-09-01', 'ativo')`,
      [FIN_USER_A, animalId, estoqueId],
    );
    const rows = await h().query<{ id: number }[]>(
      `SELECT id FROM saude_registros WHERE userId = ? ORDER BY id DESC LIMIT 1`,
      [FIN_USER_A],
    );
    const legadoId = Number(rows[0]?.id);

    await expect(dbx().transaction(async (tx) => estornarManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      id: legadoId,
      hojeISO: "2026-10-13",
    }))).rejects.toThrow(MSG_SAUDE_ESTORNO_LEGADO);

    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(item?.quantidade)).toBe(10);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("100.00");

    const movs = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(movs[0]?.n)).toBe(0);

    const status = await h().query<{ status: string }[]>(
      `SELECT status FROM saude_registros WHERE id = ?`,
      [legadoId],
    );
    expect(status[0]?.status).toBe("ativo");
  });

  it("rollback MySQL: falha após o registro não deixa manejo nem baixa", async () => {
    const drizzleDb = dbx();
    await expect(drizzleDb.transaction(async (tx) => {
      const wrapped = criarSaudeEstoqueTx(tx);
      const original = wrapped.insertMovimentacao.bind(wrapped);
      wrapped.insertMovimentacao = async (values) => {
        await original(values);
        throw new Error("falha sintética após movimentação");
      };
      return persistirManejoSanitarioNoTx(wrapped, {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        animalId,
        fazendaId: fazendaA1,
        tipo: "Vacinação",
        estoqueId,
        quantidadeConsumo: "2",
        custoPrevisto: "20.00",
        dataRegistro: "2026-10-12",
      });
    })).rejects.toThrow(/falha sintética/);

    const saudes = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM saude_registros WHERE userId = ?`,
      [FIN_USER_A],
    );
    expect(Number(saudes[0]?.n)).toBe(0);
    const movs = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(movs[0]?.n)).toBe(0);
    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(item?.quantidade)).toBe(10);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("100.00");
  });

  it("data civil 2026-10-13 permanece 2026-10-13 no DATE e na movimentação", async () => {
    const created = await dbx().transaction(async (tx) => persistirManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      animalId,
      fazendaId: fazendaA1,
      tipo: "Vacinação",
      estoqueId,
      quantidadeConsumo: "2",
      custoPrevisto: "20.00",
      dataRegistro: "2026-10-13",
    }));

    const saude = await h().query<{ dataRegistro_char: string }[]>(
      `SELECT CAST(dataRegistro AS CHAR) AS dataRegistro_char FROM saude_registros WHERE id = ?`,
      [created.id],
    );
    expect(saude[0]?.dataRegistro_char).toBe("2026-10-13");

    const mov = await h().query<{ data_mov_char: string }[]>(
      `SELECT CAST(data_movimentacao AS CHAR) AS data_mov_char FROM estoque_movimentacoes WHERE id = ?`,
      [created.movimentacaoId],
    );
    expect(mov[0]?.data_mov_char).toBe("2026-10-13");
  });

  it("estornadoEm e created_at da inversa usam o relógio da sessão MySQL", async () => {
    const created = await dbx().transaction(async (tx) => persistirManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      animalId,
      fazendaId: fazendaA1,
      tipo: "Vacinação",
      estoqueId,
      quantidadeConsumo: "2",
      custoPrevisto: "20.00",
      dataRegistro: "2026-10-13",
    }));

    const estorno = await dbx().transaction(async (tx) => estornarManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      id: created.id,
      hojeISO: "2026-10-13",
    }));

    const [relogio] = await h().query<{
      estornado_char: string;
      inversa_char: string;
      now_char: string;
      diff_estornado_inversa: number;
      diff_estornado_now: number;
    }[]>(
      `SELECT
         CAST(s.estornadoEm AS CHAR) AS estornado_char,
         CAST(m.created_at AS CHAR) AS inversa_char,
         CAST(NOW() AS CHAR) AS now_char,
         TIMESTAMPDIFF(SECOND, s.estornadoEm, m.created_at) AS diff_estornado_inversa,
         TIMESTAMPDIFF(SECOND, s.estornadoEm, NOW()) AS diff_estornado_now
       FROM saude_registros s
       JOIN estoque_movimentacoes m ON m.id = ?
       WHERE s.id = ?`,
      [estorno.movimentacaoEstornoId, created.id],
    );

    expect(relogio?.estornado_char).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(relogio?.inversa_char).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(Math.abs(Number(relogio?.diff_estornado_inversa ?? 99))).toBeLessThanOrEqual(2);
    expect(Number(relogio?.diff_estornado_now ?? 99)).toBeGreaterThanOrEqual(0);
    expect(Number(relogio?.diff_estornado_now ?? 99)).toBeLessThanOrEqual(60);
    expect(relogio?.estornado_char.slice(0, 10)).toBe(relogio?.now_char.slice(0, 10));
  });

  it("A+D. estorno genérico bloqueia Sanitário vinculado; saude.delete continua", async () => {
    const created = await dbx().transaction(async (tx) => persistirManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      animalId,
      fazendaId: fazendaA1,
      tipo: "Vacinação",
      estoqueId,
      quantidadeConsumo: "2",
      custoPrevisto: "20.00",
      dataRegistro: "2026-10-13",
    }));

    const [mov] = await h().query<{ id: number; manejo: string | null; grupo_id: string | null; status: string }[]>(
      `SELECT id, manejo, grupo_id, status FROM estoque_movimentacoes WHERE id = ?`,
      [created.movimentacaoId],
    );
    await expect(recusarEstornoGenericoSeSanitario([{
      id: Number(mov.id),
      manejo: mov.manejo,
      grupoId: mov.grupo_id,
    }])).rejects.toThrow(MSG_ESTORNO_GENERICO_SANITARIO);

    const [itemBloqueado] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(itemBloqueado?.quantidade)).toBe(8);
    expect(persistirCapital(itemBloqueado!.valor_total_estoque)).toBe("80.00");
    const [saudeAtivo] = await h().query<{ status: string }[]>(
      `SELECT status FROM saude_registros WHERE id = ?`,
      [created.id],
    );
    expect(saudeAtivo?.status).toBe("ativo");
    const inversasAntes = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ? AND status = 'estorno'`,
      [FIN_USER_A],
    );
    expect(Number(inversasAntes[0]?.n)).toBe(0);
    expect(mov.status).toBe("ativa");

    await dbx().transaction(async (tx) => estornarManejoSanitarioNoTx(criarSaudeEstoqueTx(tx), {
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
      id: created.id,
      hojeISO: "2026-10-13",
    }));
    const [itemFinal] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(itemFinal?.quantidade)).toBe(10);
    expect(persistirCapital(itemFinal!.valor_total_estoque)).toBe("100.00");
  });

  it("B. origem Sanitário sem vínculo oficial também bloqueia o genérico", async () => {
    await expect(recusarEstornoGenericoSeSanitario([{
      id: 990001,
      manejo: "Sanitário",
      grupoId: null,
    }])).rejects.toBeInstanceOf(SaudeEstoqueError);

    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(item?.quantidade)).toBe(10);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("100.00");
  });

  it("C. movimentação genérica não é bloqueada pelo guarda sanitário", async () => {
    await expect(recusarEstornoGenericoSeSanitario([{
      id: 50,
      manejo: "Consumo interno",
      grupoId: "consumo-1",
    }])).resolves.toBeUndefined();
  });
});
