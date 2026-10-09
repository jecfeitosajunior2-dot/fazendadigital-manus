import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { estoque, estoqueMovimentacoes } from "../drizzle/schema";
import {
  FIN_USER_A,
  fazendaIdDe,
  openFinanceiroMysqlHarness,
  resetFinanceiroMysqlHarness,
  seedFinanceiroMysqlUsers,
} from "./financeiroMysqlHarness";
import { criarMovimentacaoEstoqueNoTx } from "./estoqueMovimentacaoTx";
import { persistirCapital } from "../shared/estoqueCapital";

const harness = await openFinanceiroMysqlHarness();

async function seedProduto(fazendaId: number, opts: {
  nome: string;
  qtd: string;
  capital?: string | null;
  inicializado?: boolean;
  controla?: boolean;
  unitario?: string;
}) {
  await harness!.pool.query(
    `INSERT INTO \`estoque\`
      (\`nome\`, \`fazenda_id\`, \`quantidade\`, \`controlar_saldo\`, \`unidade\`,
       \`valor_unitario\`, \`valor_total_estoque\`, \`capital_inicializado_em\`)
     VALUES (?, ?, ?, ?, 'sc', ?, ?, ?)`,
    [
      opts.nome,
      fazendaId,
      opts.qtd,
      opts.controla === false ? 0 : 1,
      opts.unitario ?? "129.370000",
      opts.capital ?? null,
      opts.inicializado ? new Date() : null,
    ],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM estoque WHERE fazenda_id = ? AND nome = ? ORDER BY id DESC LIMIT 1`,
    [fazendaId, opts.nome],
  );
  return Number(rows[0]?.id);
}

describe.skipIf(!harness)("estoqueCapital — MySQL isolado", () => {
  const h = () => harness!;
  let fazendaA1: number;

  beforeAll(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
  });

  beforeEach(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
    fazendaA1 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A1");
  });

  afterAll(async () => {
    if (harness) {
      await resetFinanceiroMysqlHarness(harness);
      await harness.close();
    }
  });

  function exec(db = drizzle(h().pool, { schema, mode: "default" })) {
    return {
      async findEstoque(id: number) {
        const [row] = await db.select().from(estoque).where(eq(estoque.id, id));
        return row
          ? {
              id: row.id,
              fazendaId: row.fazendaId ?? null,
              quantidade: row.quantidade,
              controlarSaldo: row.controlarSaldo ?? null,
              valorUnitario: row.valorUnitario,
              valorTotalEstoque: row.valorTotalEstoque,
              capitalInicializadoEm: row.capitalInicializadoEm,
              nome: row.nome,
            }
          : null;
      },
      async insertMovimentacao(values: Parameters<typeof criarMovimentacaoEstoqueNoTx>[1] extends never ? never : any) {
        const result = await db.insert(estoqueMovimentacoes).values(values);
        return Number((result as { insertId?: number }[])[0]?.insertId ?? 0);
      },
      async updateEstoque(id: number, patch: Record<string, unknown>) {
        await db.update(estoque).set(patch).where(eq(estoque.id, id));
      },
    };
  }

  it("campos novos nascem NULL e aceitam decimal(14,2)", async () => {
    const id = await seedProduto(fazendaA1, { nome: "Sal isolado", qtd: "10.00" });
    const rows = await h().query<{ valor_total_estoque: string | null; capital_inicializado_em: Date | null }[]>(
      `SELECT valor_total_estoque, capital_inicializado_em FROM estoque WHERE id = ?`,
      [id],
    );
    expect(rows[0]?.valor_total_estoque).toBeNull();
    expect(rows[0]?.capital_inicializado_em).toBeNull();
  });

  it("entrada inicializada fecha 6.605,28 e grava snapshot", async () => {
    const id = await seedProduto(fazendaA1, {
      nome: "Sal capital",
      qtd: "49.98",
      capital: "6465.91",
      inicializado: true,
    });
    await criarMovimentacaoEstoqueNoTx(exec(), {
      estoqueId: id,
      fazendaId: fazendaA1,
      tipo: "Compra",
      dataMovimentacao: "2026-10-09",
      quantidade: "1",
      valor: "139.37",
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
    });
    const [item] = await h().query<{
      quantidade: string;
      valor_total_estoque: string;
      valor_unitario: string;
    }[]>(`SELECT quantidade, valor_total_estoque, valor_unitario FROM estoque WHERE id = ?`, [id]);
    expect(Number(item?.quantidade)).toBe(50.98);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("6605.28");
    expect(Number(item?.valor_unitario)).not.toBe(129.57);

    const [mov] = await h().query<{ valor_estoque_movimentado: string }[]>(
      `SELECT valor_estoque_movimentado FROM estoque_movimentacoes WHERE estoque_id = ? ORDER BY id DESC LIMIT 1`,
      [id],
    );
    expect(persistirCapital(mov!.valor_estoque_movimentado)).toBe("139.37");
  });

  it("saída que zera o estoque zera o capital", async () => {
    const id = await seedProduto(fazendaA1, {
      nome: "Sal zera",
      qtd: "0.03",
      capital: "0.03",
      inicializado: true,
    });
    await criarMovimentacaoEstoqueNoTx(exec(), {
      estoqueId: id,
      fazendaId: fazendaA1,
      tipo: "Consumo interno",
      dataMovimentacao: "2026-10-09",
      quantidade: "-0.03",
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
    });
    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [id],
    );
    expect(Number(item?.quantidade)).toBe(0);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("0.00");
  });

  it("uso imediato não recebe capital", async () => {
    const id = await seedProduto(fazendaA1, {
      nome: "Oleo imediato",
      qtd: "0",
      controla: false,
      inicializado: false,
    });
    await criarMovimentacaoEstoqueNoTx(exec(), {
      estoqueId: id,
      fazendaId: fazendaA1,
      tipo: "Compra",
      dataMovimentacao: "2026-10-09",
      quantidade: "1",
      valor: "80",
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
    });
    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string | null }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [id],
    );
    expect(Number(item?.quantidade)).toBe(0);
    expect(item?.valor_total_estoque).toBeNull();
  });

  it("rollback não deixa capital gravado", async () => {
    const id = await seedProduto(fazendaA1, {
      nome: "Sal rollback",
      qtd: "49.98",
      capital: "6465.91",
      inicializado: true,
    });
    const conn = await h().pool.getConnection();
    try {
      await conn.beginTransaction();
      const dbTx = drizzle(conn, { schema, mode: "default" });
      await criarMovimentacaoEstoqueNoTx(exec(dbTx as never), {
        estoqueId: id,
        fazendaId: fazendaA1,
        tipo: "Compra",
        dataMovimentacao: "2026-10-09",
        quantidade: "1",
        valor: "139.37",
        userId: FIN_USER_A,
        registradoPor: "Teste isolado",
      });
      await conn.rollback();
    } finally {
      conn.release();
    }
    const [item] = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`,
      [id],
    );
    expect(Number(item?.quantidade)).toBe(49.98);
    expect(persistirCapital(item!.valor_total_estoque)).toBe("6465.91");
  });

  it("estoque não inicializado permanece no modo legado", async () => {
    const id = await seedProduto(fazendaA1, { nome: "Sal legado", qtd: "49.98", unitario: "129.37" });
    await criarMovimentacaoEstoqueNoTx(exec(), {
      estoqueId: id,
      fazendaId: fazendaA1,
      tipo: "Compra",
      dataMovimentacao: "2026-10-09",
      quantidade: "1",
      valor: "139.37",
      userId: FIN_USER_A,
      registradoPor: "Teste isolado",
    });
    const [item] = await h().query<{
      quantidade: string;
      valor_total_estoque: string | null;
      capital_inicializado_em: Date | null;
      valor_unitario: string;
    }[]>(
      `SELECT quantidade, valor_total_estoque, capital_inicializado_em, valor_unitario FROM estoque WHERE id = ?`,
      [id],
    );
    expect(Number(item?.quantidade)).toBe(50.98);
    expect(item?.valor_total_estoque).toBeNull();
    expect(item?.capital_inicializado_em).toBeNull();
    expect(Number(item?.valor_unitario)).toBe(129.57);
  });
});
