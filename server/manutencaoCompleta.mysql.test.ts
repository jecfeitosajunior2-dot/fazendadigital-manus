import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { persistirCapital } from "../shared/estoqueCapital";
import { MANUT_PECA_ORIGEM_OFICINA } from "../shared/manutencaoPecasOrigem";
import {
  FIN_USER_A,
  fazendaIdDe,
  openFinanceiroMysqlHarness,
  resetFinanceiroMysqlHarness,
  seedFinanceiroMysqlUsers,
} from "./financeiroMysqlHarness";
import {
  estornarManutencaoCompletaNoTx,
  persistirManutencaoCompletaNoTx,
} from "./manutencaoCompleta";
import {
  criarPersistenciaCompletaCtx,
  schemaPecasOficinaCompativel,
} from "./manutencaoCompletaMysql";
import { criarManutencaoEstoqueTx } from "./manutencaoEstoqueMysql";
import { ensureManutencaoEstoqueSchema } from "./ensureManutencaoEstoqueSchema";

const harness = await openFinanceiroMysqlHarness();

async function seedProduto(
  fazendaId: number,
  nome: string,
  quantidade: string,
  capital: string | null,
) {
  await harness!.pool.query(
    `INSERT INTO \`estoque\`
      (\`nome\`, \`fazenda_id\`, \`quantidade\`, \`controlar_saldo\`, \`unidade\`, \`categoria\`,
       \`valor_unitario\`, \`valor_total_estoque\`, \`capital_inicializado_em\`)
     VALUES (?, ?, ?, 1, 'un', 'Peças', ?, ?, ?)`,
    [
      nome,
      fazendaId,
      quantidade,
      capital != null ? persistirCapital(Number(capital) / Number(quantidade)) : "10.000000",
      capital,
      capital != null ? new Date() : null,
    ],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM estoque WHERE fazenda_id = ? AND nome = ? ORDER BY id DESC LIMIT 1`,
    [fazendaId, nome],
  );
  return Number(rows[0]?.id);
}

async function seedMaquina(fazendaId: number) {
  await harness!.pool.query(
    `INSERT INTO \`maquinas\` (\`userId\`, \`fazendaId\`, \`nome\`, \`status\`)
     VALUES (?, ?, 'Trator sintético completa', 'ativo')`,
    [FIN_USER_A, fazendaId],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM maquinas WHERE userId = ? AND nome = 'Trator sintético completa' ORDER BY id DESC LIMIT 1`,
    [FIN_USER_A],
  );
  return Number(rows[0]?.id);
}

const pecaOficina = {
  origem: MANUT_PECA_ORIGEM_OFICINA,
  nome: "Retentor sintético",
  quantidade: 2,
  valorUnitario: 40,
  valorTotal: 80,
} as const;

describe.skipIf(!harness)("manutencaoCompleta — MySQL isolado", () => {
  const h = () => harness!;
  let fazendaA1: number;
  let maquinaId: number;
  let estoqueId: number;
  let schemaOk = false;

  beforeAll(async () => {
    await ensureManutencaoEstoqueSchema(h().pool);
    schemaOk = await schemaPecasOficinaCompativel((sqlText, params) => h().query(sqlText, params));
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
  });

  beforeEach(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
    fazendaA1 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A1");
    maquinaId = await seedMaquina(fazendaA1);
    estoqueId = await seedProduto(fazendaA1, "Filtro sintético completa", "10.00", "100.00");
  });

  afterAll(async () => {
    if (harness) {
      await resetFinanceiroMysqlHarness(harness);
      await harness.close();
    }
  });

  function dbx() {
    return drizzle(h().pool, { schema, mode: "default" });
  }

  const inputEstoque = (pecas = [{
    estoqueId,
    nome: "Filtro sintético completa",
    quantidade: 2,
    valorUnitario: 10,
  }]) => ({
    userId: FIN_USER_A,
    registradoPor: "Teste isolado",
    maquinaId,
    fazendaId: fazendaA1,
    tipo: "Preventiva",
    descricao: "OS sintética completa",
    data: "2026-10-14",
    valorMaoObra: 0,
    pecas,
    pecasOficina: [] as typeof pecaOficina[],
    tipoExecucao: "interna" as const,
  });

  it("schema 0058 compatível no banco de teste (sem migration no principal)", () => {
    expect(schemaOk).toBe(true);
  });

  it("OS só com peças da oficina: sem movimentação e totais da oficina", async () => {
    if (!schemaOk) return;
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), {
        ...inputEstoque([]),
        valorMaoObra: 250,
        pecasOficina: [pecaOficina],
        tipoExecucao: "externa",
      }),
    );

    const [os] = await h().query<{
      status: string;
      valorPecas: string;
      valorPecasOficina: string;
      valorCobradoOficina: string;
      valorTotal: string;
      valorMaoObra: string;
    }[]>(
      `SELECT status, valorPecas, valorPecasOficina, valorCobradoOficina, valorTotal, valorMaoObra
       FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(os?.status).toBe("concluida");
    expect(persistirCapital(os!.valorPecas)).toBe("80.00");
    expect(persistirCapital(os!.valorPecasOficina)).toBe("80.00");
    expect(persistirCapital(os!.valorCobradoOficina)).toBe("330.00");
    expect(persistirCapital(os!.valorTotal)).toBe("330.00");
    expect(created.movimentacaoIds).toEqual([]);

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

  it("OS só com mão de obra terceirizada: sem peças órfãs", async () => {
    if (!schemaOk) return;
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), {
        ...inputEstoque([]),
        valorMaoObra: 180,
        tipoExecucao: "externa",
      }),
    );
    const pecas = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM manutencao_pecas WHERE manutencaoId = ?`,
      [created.id],
    );
    expect(Number(pecas[0]?.n)).toBe(0);
    const [os] = await h().query<{ valorTotal: string; valorCobradoOficina: string }[]>(
      `SELECT valorTotal, valorCobradoOficina FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(persistirCapital(os!.valorTotal)).toBe("180.00");
    expect(persistirCapital(os!.valorCobradoOficina)).toBe("180.00");
  });

  it("OS com as duas origens: baixa só o estoque e soma os totais", async () => {
    if (!schemaOk) return;
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), {
        ...inputEstoque(),
        valorMaoObra: 250,
        pecasOficina: [pecaOficina],
        tipoExecucao: "externa",
      }),
    );

    expect(created.movimentacaoIds).toHaveLength(1);
    const pecas = await h().query<{ origem: string | null; estoqueMovimentacaoId: number | null }[]>(
      `SELECT origem, estoqueMovimentacaoId FROM manutencao_pecas WHERE manutencaoId = ? ORDER BY id`,
      [created.id],
    );
    expect(pecas).toHaveLength(2);
    expect(pecas[0]?.origem).toBe("estoque");
    expect(Number(pecas[0]?.estoqueMovimentacaoId)).toBeGreaterThan(0);
    expect(pecas[1]?.origem).toBe("oficina");
    expect(pecas[1]?.estoqueMovimentacaoId == null || Number(pecas[1]?.estoqueMovimentacaoId) === 0).toBe(true);

    const [os] = await h().query<{
      valorPecas: string;
      valorPecasOficina: string;
      valorCobradoOficina: string;
      valorTotal: string;
    }[]>(
      `SELECT valorPecas, valorPecasOficina, valorCobradoOficina, valorTotal FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(persistirCapital(os!.valorPecas)).toBe("100.00");
    expect(persistirCapital(os!.valorPecasOficina)).toBe("80.00");
    expect(persistirCapital(os!.valorCobradoOficina)).toBe("330.00");
    expect(persistirCapital(os!.valorTotal)).toBe("350.00");

    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(item?.quantidade)).toBe(8);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("80.00");
  });

  it("estorno sem peças de estoque não mexe no saldo e preserva a OS", async () => {
    if (!schemaOk) return;
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), {
        ...inputEstoque([]),
        valorMaoObra: 250,
        pecasOficina: [pecaOficina],
        tipoExecucao: "externa",
      }),
    );

    await dbx().transaction(async (tx) =>
      estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        motivo: "Cobrança da oficina indevida",
        hojeISO: "2026-10-14",
      }),
    );

    const [os] = await h().query<{
      status: string;
      motivoEstorno: string | null;
      estornadoEm: Date | string | null;
      valorPecasOficina: string;
    }[]>(
      `SELECT status, motivoEstorno, estornadoEm, valorPecasOficina FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(os?.status).toBe("estornado");
    expect(os?.motivoEstorno).toBe("Cobrança da oficina indevida");
    expect(os?.estornadoEm).toBeTruthy();
    expect(persistirCapital(os!.valorPecasOficina)).toBe("80.00");

    const pecas = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM manutencao_pecas WHERE manutencaoId = ?`,
      [created.id],
    );
    expect(Number(pecas[0]?.n)).toBe(1);

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

  it("estorno misto devolve só a peça da fazenda e preserva a da oficina", async () => {
    if (!schemaOk) return;
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), {
        ...inputEstoque(),
        valorMaoObra: 250,
        pecasOficina: [pecaOficina],
        tipoExecucao: "externa",
      }),
    );

    const estorno = await dbx().transaction(async (tx) =>
      estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-14",
      }),
    );
    expect(estorno.handled).toBe(true);
    if (estorno.handled) expect(estorno.movimentacaoEstornoIds).toHaveLength(1);

    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(item?.quantidade)).toBe(10);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("100.00");

    const pecas = await h().query<{ origem: string | null }[]>(
      `SELECT origem FROM manutencao_pecas WHERE manutencaoId = ? ORDER BY id`,
      [created.id],
    );
    expect(pecas.map((p) => p.origem)).toEqual(["estoque", "oficina"]);

    const inversas = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ? AND status = 'estorno'`,
      [FIN_USER_A],
    );
    expect(Number(inversas[0]?.n)).toBe(1);
  });

  it("segundo estorno não duplica movimentação", async () => {
    if (!schemaOk) return;
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), {
        ...inputEstoque([]),
        pecasOficina: [pecaOficina],
        tipoExecucao: "externa",
      }),
    );
    await dbx().transaction(async (tx) =>
      estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-14",
      }),
    );
    const segundo = await dbx().transaction(async (tx) =>
      estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-14",
      }),
    );
    expect(segundo.handled).toBe(true);
    if (segundo.handled) {
      expect(segundo.alreadyEstornado).toBe(true);
      expect(segundo.movimentacaoEstornoIds).toEqual([]);
    }
    const movs = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(movs[0]?.n)).toBe(0);
  });

  it("falha ao gravar peça da oficina faz rollback integral", async () => {
    if (!schemaOk) return;
    await expect(dbx().transaction(async (tx) => {
      const wrapped = criarPersistenciaCompletaCtx(tx);
      wrapped.gravarPecasOficina = async () => {
        throw new Error("falha sintética oficina");
      };
      return persistirManutencaoCompletaNoTx(wrapped, {
        ...inputEstoque(),
        pecasOficina: [pecaOficina],
        tipoExecucao: "externa",
      });
    })).rejects.toThrow(/falha sintética oficina/);

    const os = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM manutencoes WHERE userId = ?`,
      [FIN_USER_A],
    );
    expect(Number(os[0]?.n)).toBe(0);
    const pecas = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM manutencao_pecas pecas
       INNER JOIN manutencoes m ON m.id = pecas.manutencaoId
       WHERE m.userId = ?`,
      [FIN_USER_A],
    );
    expect(Number(pecas[0]?.n)).toBe(0);
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

  it("OS antiga sem origem não vira oficina e o estorno patrimonial continua válido", async () => {
    if (!schemaOk) return;
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), inputEstoque()),
    );
    await h().pool.query(
      `UPDATE \`manutencao_pecas\` SET \`origem\` = NULL WHERE \`manutencaoId\` = ?`,
      [created.id],
    );

    const [peca] = await h().query<{ origem: string | null; estoqueMovimentacaoId: number }[]>(
      `SELECT origem, estoqueMovimentacaoId FROM manutencao_pecas WHERE manutencaoId = ?`,
      [created.id],
    );
    expect(peca?.origem).toBeNull();
    expect(Number(peca?.estoqueMovimentacaoId)).toBeGreaterThan(0);

    await dbx().transaction(async (tx) =>
      estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-14",
      }),
    );
    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(item?.quantidade)).toBe(10);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("100.00");
  });
});

if (!harness) {
  describe("manutencaoCompleta — MySQL isolado", () => {
    it("harness indisponível — testes MySQL omitidos", () => {
      expect(harness).toBeNull();
    });
  });
}
