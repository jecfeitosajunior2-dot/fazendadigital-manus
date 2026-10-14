import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { persistirCapital } from "../shared/estoqueCapital";
import { MSG_MANUT_EDICAO_PATRIMONIAL } from "../shared/manutencaoEstoque";
import {
  MANUT_PECA_ORIGEM_OFICINA,
  MSG_MANUT_EDICAO_ESTORNADA,
  MSG_MANUT_ORIGEM_IMUTAVEL,
} from "../shared/manutencaoPecasOrigem";
import {
  FIN_USER_A,
  fazendaIdDe,
  openFinanceiroMysqlHarness,
  resetFinanceiroMysqlHarness,
  seedFinanceiroMysqlUsers,
} from "./financeiroMysqlHarness";
import { estornarManutencaoCompletaNoTx, persistirManutencaoCompletaNoTx } from "./manutencaoCompleta";
import { criarPersistenciaCompletaCtx, schemaPecasOficinaCompativel } from "./manutencaoCompletaMysql";
import { criarManutencaoEstoqueTx } from "./manutencaoEstoqueMysql";
import { editarPecasOficinaNoTx } from "./manutencaoOficinaEdicao";
import { criarEdicaoOficinaCtx } from "./manutencaoOficinaEdicaoMysql";
import { ensureManutencaoEstoqueSchema } from "./ensureManutencaoEstoqueSchema";

const harness = await openFinanceiroMysqlHarness();

async function seedProduto(fazendaId: number) {
  await harness!.pool.query(
    `INSERT INTO \`estoque\`
      (\`nome\`, \`fazenda_id\`, \`quantidade\`, \`controlar_saldo\`, \`unidade\`, \`categoria\`,
       \`valor_unitario\`, \`valor_total_estoque\`, \`capital_inicializado_em\`)
     VALUES (?, ?, '10.00', 1, 'un', 'Peças', '10.000000', '100.00', ?)`,
    ["Filtro sintético edição", fazendaId, new Date()],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM estoque WHERE fazenda_id = ? AND nome = ? ORDER BY id DESC LIMIT 1`,
    [fazendaId, "Filtro sintético edição"],
  );
  return Number(rows[0]?.id);
}

async function seedMaquina(fazendaId: number) {
  await harness!.pool.query(
    `INSERT INTO \`maquinas\` (\`userId\`, \`fazendaId\`, \`nome\`, \`status\`)
     VALUES (?, ?, 'Trator sintético edição', 'ativo')`,
    [FIN_USER_A, fazendaId],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM maquinas WHERE userId = ? AND nome = 'Trator sintético edição' ORDER BY id DESC LIMIT 1`,
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

describe.skipIf(!harness)("manutencaoOficinaEdicao — MySQL isolado", () => {
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
    estoqueId = await seedProduto(fazendaA1);
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

  const inputCreate = (extras: Record<string, unknown> = {}) => ({
    userId: FIN_USER_A,
    registradoPor: "Teste isolado",
    maquinaId,
    fazendaId: fazendaA1,
    tipo: "Corretiva",
    descricao: "OS sintética edição",
    data: "2026-10-14",
    valorMaoObra: 250,
    pecas: [] as Array<{ estoqueId: number; nome: string; quantidade: number; valorUnitario: number }>,
    pecasOficina: [pecaOficina],
    tipoExecucao: "externa" as const,
    ...extras,
  });

  async function criarOs(extras: Record<string, unknown> = {}) {
    return dbx().transaction(async (tx) =>
      persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), inputCreate(extras)),
    );
  }

  async function editar(id: number, pecasOficina: typeof pecaOficina[], estoque = [] as Array<{ estoqueId: number; quantidade: number }>) {
    return dbx().transaction(async (tx) =>
      editarPecasOficinaNoTx(criarEdicaoOficinaCtx(tx, FIN_USER_A, id), {
        userId: FIN_USER_A,
        id,
        tipoExecucao: "externa",
        valorMaoObra: 250,
        pecasOficina,
        pecasEstoqueInput: estoque,
      }),
    );
  }

  it("schema de oficina presente no banco de teste", () => {
    expect(schemaOk).toBe(true);
  });

  it("edita descrição, quantidade e valor unitário e recalcula totais", async () => {
    if (!schemaOk) return;
    const created = await criarOs();
    await editar(created.id, [{
      origem: MANUT_PECA_ORIGEM_OFICINA,
      nome: "Retentor reforçado",
      quantidade: 3,
      valorUnitario: 50,
      valorTotal: 1,
    }]);

    const [os] = await h().query<{
      valorPecasOficina: string;
      valorCobradoOficina: string;
      valorTotal: string;
    }[]>(
      `SELECT valorPecasOficina, valorCobradoOficina, valorTotal FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(persistirCapital(os!.valorPecasOficina)).toBe("150.00");
    expect(persistirCapital(os!.valorCobradoOficina)).toBe("400.00");
    expect(persistirCapital(os!.valorTotal)).toBe("400.00");

    const [peca] = await h().query<{ nome: string; quantidade: string; valorTotal: string }[]>(
      `SELECT nome, quantidade, valorTotal FROM manutencao_pecas WHERE manutencaoId = ? AND origem = 'oficina'`,
      [created.id],
    );
    expect(peca?.nome).toBe("Retentor reforçado");
    expect(Number(peca?.quantidade)).toBe(3);
    expect(persistirCapital(peca!.valorTotal)).toBe("150.00");
  });

  it("OS com as duas origens não mexe no estoque nem no vínculo", async () => {
    if (!schemaOk) return;
    const created = await criarOs({
      pecas: [{ estoqueId, nome: "Filtro sintético edição", quantidade: 2, valorUnitario: 10 }],
    });
    const [antes] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    const [pecaEstoqueAntes] = await h().query<{
      estoqueMovimentacaoId: number;
      quantidade: string;
      valorTotal: string;
    }[]>(
      `SELECT estoqueMovimentacaoId, quantidade, valorTotal FROM manutencao_pecas
       WHERE manutencaoId = ? AND origem = 'estoque'`,
      [created.id],
    );

    await editar(created.id, [{ ...pecaOficina, quantidade: 1, valorUnitario: 40, valorTotal: 40 }], [
      { estoqueId, quantidade: 2 },
    ]);

    const [depois] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(depois?.quantidade)).toBe(Number(antes?.quantidade));
    expect(persistirCapital(depois!.valor_total_estoque)).toBe(persistirCapital(antes!.valor_total_estoque));

    const [pecaEstoque] = await h().query<{
      estoqueMovimentacaoId: number;
      quantidade: string;
      valorTotal: string;
    }[]>(
      `SELECT estoqueMovimentacaoId, quantidade, valorTotal FROM manutencao_pecas
       WHERE manutencaoId = ? AND origem = 'estoque'`,
      [created.id],
    );
    expect(pecaEstoque?.estoqueMovimentacaoId).toBe(pecaEstoqueAntes?.estoqueMovimentacaoId);
    expect(Number(pecaEstoque?.quantidade)).toBe(2);
    expect(persistirCapital(pecaEstoque!.valorTotal)).toBe(persistirCapital(pecaEstoqueAntes!.valorTotal));

    const [os] = await h().query<{ valorPecas: string; valorPecasOficina: string }[]>(
      `SELECT valorPecas, valorPecasOficina FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(persistirCapital(os!.valorPecasOficina)).toBe("40.00");
    expect(persistirCapital(os!.valorPecas)).toBe(
      persistirCapital(Number(pecaEstoqueAntes!.valorTotal) + 40),
    );
  });

  it("falha simulada faz rollback e preserva valores anteriores", async () => {
    if (!schemaOk) return;
    const created = await criarOs();
    await expect(dbx().transaction(async (tx) => {
      const wrapped = criarEdicaoOficinaCtx(tx, FIN_USER_A, created.id);
      wrapped.substituirPecasOficina = async () => {
        throw new Error("falha sintética edição");
      };
      return editarPecasOficinaNoTx(wrapped, {
        userId: FIN_USER_A,
        id: created.id,
        tipoExecucao: "externa",
        valorMaoObra: 250,
        pecasOficina: [{ ...pecaOficina, quantidade: 9, valorUnitario: 90, valorTotal: 810 }],
        pecasEstoqueInput: [],
      });
    })).rejects.toThrow(/falha sintética edição/);

    const [os] = await h().query<{ valorPecasOficina: string }[]>(
      `SELECT valorPecasOficina FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(persistirCapital(os!.valorPecasOficina)).toBe("80.00");
    const pecas = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM manutencao_pecas WHERE manutencaoId = ?`,
      [created.id],
    );
    expect(Number(pecas[0]?.n)).toBe(1);
  });

  it("bloqueia edição de OS estornada", async () => {
    if (!schemaOk) return;
    const created = await criarOs();
    await dbx().transaction(async (tx) =>
      estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-14",
      }),
    );
    await expect(editar(created.id, [pecaOficina])).rejects.toThrow(MSG_MANUT_EDICAO_ESTORNADA);
  });

  it("bloqueia alteração patrimonial e conversão de origem", async () => {
    if (!schemaOk) return;
    const created = await criarOs({
      pecas: [{ estoqueId, nome: "Filtro sintético edição", quantidade: 2, valorUnitario: 10 }],
    });
    await expect(editar(created.id, [pecaOficina], [{ estoqueId, quantidade: 9 }]))
      .rejects.toThrow(MSG_MANUT_EDICAO_PATRIMONIAL);

    const soOficina = await criarOs();
    await expect(editar(soOficina.id, [], [{ estoqueId, quantidade: 1 }]))
      .rejects.toThrow(MSG_MANUT_ORIGEM_IMUTAVEL);
  });

  it("edições concorrentes terminam com totais iguais às peças gravadas", async () => {
    if (!schemaOk) return;
    const created = await criarOs();
    await Promise.allSettled([
      editar(created.id, [{ ...pecaOficina, quantidade: 3, valorUnitario: 40, valorTotal: 120 }]),
      editar(created.id, [{ ...pecaOficina, quantidade: 5, valorUnitario: 10, valorTotal: 50 }]),
    ]);

    const [os] = await h().query<{
      valorPecasOficina: string;
      valorTotal: string;
      valorMaoObra: string;
    }[]>(
      `SELECT valorPecasOficina, valorTotal, valorMaoObra FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    const pecas = await h().query<{ valorTotal: string }[]>(
      `SELECT valorTotal FROM manutencao_pecas WHERE manutencaoId = ? AND origem = 'oficina'`,
      [created.id],
    );
    const soma = pecas.reduce((s, p) => s + Number(p.valorTotal), 0);
    expect(persistirCapital(os!.valorPecasOficina)).toBe(persistirCapital(soma));
    expect(persistirCapital(os!.valorTotal)).toBe(
      persistirCapital(soma + Number(os!.valorMaoObra)),
    );
  });

  it("OS antiga sem origem no estoque aceita só a edição da oficina", async () => {
    if (!schemaOk) return;
    const created = await criarOs({
      pecas: [{ estoqueId, nome: "Filtro sintético edição", quantidade: 2, valorUnitario: 10 }],
    });
    await h().pool.query(
      `UPDATE \`manutencao_pecas\` SET \`origem\` = NULL WHERE \`manutencaoId\` = ? AND \`estoqueId\` = ?`,
      [created.id, estoqueId],
    );
    await editar(created.id, [{ ...pecaOficina, quantidade: 1, valorUnitario: 20, valorTotal: 20 }], [
      { estoqueId, quantidade: 2 },
    ]);
    const [pecaEstoque] = await h().query<{ origem: string | null; estoqueMovimentacaoId: number }[]>(
      `SELECT origem, estoqueMovimentacaoId FROM manutencao_pecas
       WHERE manutencaoId = ? AND estoqueId = ?`,
      [created.id, estoqueId],
    );
    expect(pecaEstoque?.origem).toBeNull();
    expect(Number(pecaEstoque?.estoqueMovimentacaoId)).toBeGreaterThan(0);
    const oficina = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM manutencao_pecas WHERE manutencaoId = ? AND origem = 'oficina'`,
      [created.id],
    );
    expect(Number(oficina[0]?.n)).toBe(1);
  });
});

if (!harness) {
  describe("manutencaoOficinaEdicao — MySQL isolado", () => {
    it("harness indisponível — testes MySQL omitidos", () => {
      expect(harness).toBeNull();
    });
  });
}
