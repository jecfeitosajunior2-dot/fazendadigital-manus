import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { persistirCapital } from "../shared/estoqueCapital";
import {
  MSG_ESTORNO_GENERICO_MANUTENCAO,
  MSG_MANUT_ESTORNO_LEGADO,
  grupoMovimentacaoManutencao,
} from "../shared/manutencaoEstoque";
import {
  FIN_USER_A,
  fazendaIdDe,
  openFinanceiroMysqlHarness,
  resetFinanceiroMysqlHarness,
  seedFinanceiroMysqlUsers,
} from "./financeiroMysqlHarness";
import { persistirManutencaoComPecasNoTx, estornarManutencaoNoTx, ManutencaoEstoqueError } from "./manutencaoEstoque";
import { criarManutencaoEstoqueTx, recusarEstornoGenericoSeManutencao } from "./manutencaoEstoqueMysql";
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
     VALUES (?, ?, 'Trator sintético manut', 'ativo')`,
    [FIN_USER_A, fazendaId],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM maquinas WHERE userId = ? AND nome = 'Trator sintético manut' ORDER BY id DESC LIMIT 1`,
    [FIN_USER_A],
  );
  return Number(rows[0]?.id);
}

describe.skipIf(!harness)("manutencaoEstoque — MySQL isolado", () => {
  const h = () => harness!;
  let fazendaA1: number;
  let maquinaId: number;
  let estoqueId: number;

  beforeAll(async () => {
    await ensureManutencaoEstoqueSchema(h().pool);
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
  });

  beforeEach(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
    fazendaA1 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A1");
    maquinaId = await seedMaquina(fazendaA1);
    estoqueId = await seedProduto(fazendaA1, "Filtro sintético manut", "10.00", "100.00");
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

  const pecaBase = (id = estoqueId) => ({
    estoqueId: id,
    nome: "Filtro sintético manut",
    quantidade: 2,
    valorUnitario: 10,
  });

  const criarInput = (pecas = [pecaBase()]) => ({
    userId: FIN_USER_A,
    registradoPor: "Teste isolado",
    maquinaId,
    fazendaId: fazendaA1,
    tipo: "Preventiva",
    descricao: "Troca de filtro sintética",
    data: "2026-10-13",
    valorMaoObra: 0,
    pecas,
  });

  it("criação capital: 10/100 consome 2 → 8/80 snapshot 20, sem financeiro", async () => {
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoComPecasNoTx(criarManutencaoEstoqueTx(tx), criarInput()),
    );

    const [itemApos] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(itemApos?.quantidade)).toBe(8);
    expect(persistirCapital(itemApos!.valor_total_estoque)).toBe("80.00");

    const [peca] = await h().query<{
      quantidade: string;
      valorTotal: string;
      valorUnitario: string;
      estoqueMovimentacaoId: number;
    }[]>(
      `SELECT quantidade, valorTotal, valorUnitario, estoqueMovimentacaoId
       FROM manutencao_pecas WHERE id = ?`,
      [created.pecaIds[0]],
    );
    expect(Number(peca?.quantidade)).toBe(2);
    expect(persistirCapital(peca!.valorTotal)).toBe("20.00");
    expect(persistirCapital(peca!.valorUnitario)).toBe("10.00");
    expect(peca?.estoqueMovimentacaoId).toBe(created.movimentacaoIds[0]);

    const [mov] = await h().query<{
      tipo: string;
      manejo: string | null;
      quantidade: string;
      valor_estoque_movimentado: string;
      status: string;
      grupo_id: string | null;
    }[]>(
      `SELECT tipo, manejo, quantidade, valor_estoque_movimentado, status, grupo_id
       FROM estoque_movimentacoes WHERE id = ?`,
      [created.movimentacaoIds[0]],
    );
    expect(mov?.tipo).toBe("Saída");
    expect(mov?.manejo).toBe("Manutenção");
    expect(Number(mov?.quantidade)).toBe(-2);
    expect(persistirCapital(mov!.valor_estoque_movimentado)).toBe("20.00");
    expect(mov?.status).toBe("ativa");
    expect(mov?.grupo_id).toBe(grupoMovimentacaoManutencao(created.id, created.pecaIds[0]!));

    const [os] = await h().query<{ status: string }[]>(
      `SELECT status FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(os?.status).toBe("concluida");

    const titulos = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM financeiro_titulos WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(titulos[0]?.n)).toBe(0);
  });

  it("rollback: falha após a saída não deixa OS, peça, movimento nem baixa", async () => {
    await expect(dbx().transaction(async (tx) => {
      const wrapped = criarManutencaoEstoqueTx(tx);
      const original = wrapped.insertMovimentacao.bind(wrapped);
      wrapped.insertMovimentacao = async (values) => {
        await original(values);
        throw new Error("falha sintética após movimentação");
      };
      return persistirManutencaoComPecasNoTx(wrapped, criarInput());
    })).rejects.toThrow(/falha sintética/);

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

  it("estorno devolve 10/100 com snapshot 20 e preserva motivo", async () => {
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoComPecasNoTx(criarManutencaoEstoqueTx(tx), criarInput()),
    );

    const estorno = await dbx().transaction(async (tx) =>
      estornarManutencaoNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        motivo: "Peça errada no filtro",
        hojeISO: "2026-10-13",
      }),
    );

    const [os] = await h().query<{
      status: string;
      motivoEstorno: string | null;
      estornadoEm: Date | string | null;
    }[]>(
      `SELECT status, motivoEstorno, estornadoEm FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(os?.status).toBe("estornado");
    expect(os?.motivoEstorno).toBe("Peça errada no filtro");
    expect(os?.estornadoEm).toBeTruthy();

    const [original] = await h().query<{ status: string }[]>(
      `SELECT status FROM estoque_movimentacoes WHERE id = ?`,
      [created.movimentacaoIds[0]],
    );
    expect(original?.status).toBe("estornada");

    const [inversa] = await h().query<{
      quantidade: string;
      valor_estoque_movimentado: string;
      status: string;
    }[]>(
      `SELECT quantidade, valor_estoque_movimentado, status
       FROM estoque_movimentacoes WHERE id = ?`,
      [estorno.movimentacaoEstornoIds[0]],
    );
    expect(Number(inversa?.quantidade)).toBe(2);
    expect(persistirCapital(inversa!.valor_estoque_movimentado)).toBe("20.00");
    expect(inversa?.status).toBe("estorno");

    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(item?.quantidade)).toBe(10);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("100.00");

    const titulos = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM financeiro_titulos WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(titulos[0]?.n)).toBe(0);
  });

  it("duplo estorno não devolve quantidade duas vezes", async () => {
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoComPecasNoTx(criarManutencaoEstoqueTx(tx), criarInput()),
    );
    await dbx().transaction(async (tx) =>
      estornarManutencaoNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-13",
      }),
    );

    const movsAntes = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ?`,
      [FIN_USER_A],
    );
    const segundo = await dbx().transaction(async (tx) =>
      estornarManutencaoNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-13",
      }),
    );
    expect(segundo.alreadyEstornado).toBe(true);
    expect(segundo.movimentacaoEstornoIds).toEqual([]);

    const movsDepois = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(movsDepois[0]?.n)).toBe(Number(movsAntes[0]?.n));

    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(item?.quantidade)).toBe(10);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("100.00");
  });

  it("Insumos genérico bloqueia; manutencoes.estornar devolve 10/100", async () => {
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoComPecasNoTx(criarManutencaoEstoqueTx(tx), criarInput()),
    );
    const [mov] = await h().query<{ id: number; manejo: string | null; grupo_id: string | null; status: string }[]>(
      `SELECT id, manejo, grupo_id, status FROM estoque_movimentacoes WHERE id = ?`,
      [created.movimentacaoIds[0]],
    );

    await expect(recusarEstornoGenericoSeManutencao([{
      id: Number(mov.id),
      manejo: mov.manejo,
      grupoId: mov.grupo_id,
    }])).rejects.toThrow(MSG_ESTORNO_GENERICO_MANUTENCAO);

    const [os] = await h().query<{ status: string }[]>(
      `SELECT status FROM manutencoes WHERE id = ?`,
      [created.id],
    );
    expect(os?.status).toBe("concluida");
    expect(mov.status).toBe("ativa");
    const [itemBloqueado] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(itemBloqueado?.quantidade)).toBe(8);
    expect(persistirCapital(itemBloqueado!.valor_total_estoque)).toBe("80.00");
    const inversasAntes = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE user_id = ? AND status = 'estorno'`,
      [FIN_USER_A],
    );
    expect(Number(inversasAntes[0]?.n)).toBe(0);

    await dbx().transaction(async (tx) =>
      estornarManutencaoNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-13",
      }),
    );
    const [itemFinal] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    expect(Number(itemFinal?.quantidade)).toBe(10);
    expect(persistirCapital(itemFinal!.valor_total_estoque)).toBe("100.00");
  });

  it("várias peças: cada linha tem vínculo e snapshot; estorno reverte todas", async () => {
    const estoqueB = await seedProduto(fazendaA1, "Correia sintética manut", "5.00", "50.00");
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoComPecasNoTx(criarManutencaoEstoqueTx(tx), criarInput([
        pecaBase(estoqueId),
        { estoqueId: estoqueB, nome: "Correia sintética manut", quantidade: 1, valorUnitario: 10 },
      ])),
    );
    expect(created.movimentacaoIds).toHaveLength(2);
    expect(new Set(created.movimentacaoIds).size).toBe(2);

    const pecas = await h().query<{
      estoqueId: number;
      estoqueMovimentacaoId: number;
      valorTotal: string;
    }[]>(
      `SELECT estoqueId, estoqueMovimentacaoId, valorTotal FROM manutencao_pecas WHERE manutencaoId = ? ORDER BY id`,
      [created.id],
    );
    expect(pecas).toHaveLength(2);
    expect(pecas[0]?.estoqueMovimentacaoId).toBe(created.movimentacaoIds[0]);
    expect(pecas[1]?.estoqueMovimentacaoId).toBe(created.movimentacaoIds[1]);
    expect(persistirCapital(pecas[0]!.valorTotal)).toBe("20.00");
    expect(persistirCapital(pecas[1]!.valorTotal)).toBe("10.00");

    await dbx().transaction(async (tx) =>
      estornarManutencaoNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: created.id,
        hojeISO: "2026-10-13",
      }),
    );

    const [a] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueId],
    );
    const [b] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [estoqueB],
    );
    expect(Number(a?.quantidade)).toBe(10);
    expect(persistirCapital(a!.valor_total_estoque)).toBe("100.00");
    expect(Number(b?.quantidade)).toBe(5);
    expect(persistirCapital(b!.valor_total_estoque)).toBe("50.00");
  });

  it("estoque legado sem capital cria movimentação oficial sem inventar valor_total_estoque", async () => {
    const legadoId = await seedProduto(fazendaA1, "Peça legado sintético", "10.00", null);
    const created = await dbx().transaction(async (tx) =>
      persistirManutencaoComPecasNoTx(criarManutencaoEstoqueTx(tx), {
        ...criarInput([{
          estoqueId: legadoId,
          nome: "Peça legado sintético",
          quantidade: 2,
          valorUnitario: 10,
        }]),
      }),
    );

    const [peca] = await h().query<{ estoqueMovimentacaoId: number }[]>(
      `SELECT estoqueMovimentacaoId FROM manutencao_pecas WHERE id = ?`,
      [created.pecaIds[0]],
    );
    expect(Number(peca?.estoqueMovimentacaoId)).toBeGreaterThan(0);

    const [mov] = await h().query<{
      quantidade: string;
      valor_estoque_movimentado: string | null;
      status: string;
    }[]>(
      `SELECT quantidade, valor_estoque_movimentado, status FROM estoque_movimentacoes WHERE id = ?`,
      [created.movimentacaoIds[0]],
    );
    expect(Number(mov?.quantidade)).toBe(-2);
    expect(mov?.status).toBe("ativa");
    expect(mov?.valor_estoque_movimentado == null || Number(mov.valor_estoque_movimentado) === 0).toBe(true);

    const [item] = await h().query<{
      quantidade: string;
      valor_total_estoque: string | null;
      capital_inicializado_em: Date | string | null;
    }[]>(
      `SELECT quantidade, valor_total_estoque, capital_inicializado_em FROM estoque WHERE id = ?`,
      [legadoId],
    );
    expect(Number(item?.quantidade)).toBe(8);
    expect(item?.valor_total_estoque == null || Number(item.valor_total_estoque) === 0).toBe(true);
    expect(item?.capital_inicializado_em).toBeNull();
  });

  it("legado sem vínculo e com capital não estorna por heurística", async () => {
    await h().pool.query(
      `INSERT INTO \`manutencoes\`
        (\`userId\`, \`maquinaId\`, \`tipo\`, \`descricao\`, \`data\`, \`status\`, \`valorPecas\`, \`valorTotal\`, \`custo\`)
       VALUES (?, ?, 'Preventiva', 'OS histórica', '2026-09-01', 'concluida', '20.00', '20.00', '20.00')`,
      [FIN_USER_A, maquinaId],
    );
    const osRows = await h().query<{ id: number }[]>(
      `SELECT id FROM manutencoes WHERE userId = ? ORDER BY id DESC LIMIT 1`,
      [FIN_USER_A],
    );
    const legadoOs = Number(osRows[0]?.id);
    await h().pool.query(
      `INSERT INTO \`manutencao_pecas\`
        (\`manutencaoId\`, \`estoqueId\`, \`nome\`, \`quantidade\`, \`valorUnitario\`, \`valorTotal\`)
       VALUES (?, ?, 'Filtro sintético manut', '2.00', '10.00', '20.00')`,
      [legadoOs, estoqueId],
    );

    await expect(dbx().transaction(async (tx) =>
      estornarManutencaoNoTx(criarManutencaoEstoqueTx(tx), {
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
        id: legadoOs,
        hojeISO: "2026-10-13",
        algumEstoqueComCapital: true,
      }),
    )).rejects.toThrow(MSG_MANUT_ESTORNO_LEGADO);

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
  });

  it("genérico sem evidência de Manutenção não é bloqueado", async () => {
    await expect(recusarEstornoGenericoSeManutencao([{
      id: 50,
      manejo: "Consumo interno",
      grupoId: "consumo-1",
    }])).resolves.toBeUndefined();
  });

  it("ManutencaoEstoqueError existe para o domínio", () => {
    expect(new ManutencaoEstoqueError("x")).toBeInstanceOf(Error);
  });
});
