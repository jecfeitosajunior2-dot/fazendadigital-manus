import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  FIN_USER_A,
  fazendaIdDe,
  openFinanceiroMysqlHarness,
  resetFinanceiroMysqlHarness,
  seedFinanceiroMysqlUsers,
} from "./financeiroMysqlHarness";
import { transferenciaInsumosService } from "./transferenciaInsumosMysql";
import { persistirCapital } from "../shared/estoqueCapital";

const harness = await openFinanceiroMysqlHarness();

async function seedProduto(fazendaId: number, opts: {
  nome: string;
  qtd: string;
  capital?: string | null;
  inicializado?: boolean;
  produtoId?: number;
}) {
  const pid = opts.produtoId ?? Math.floor(Math.random() * 800000) + 10000;
  await harness!.pool.query(
    `INSERT INTO \`estoque\`
      (\`nome\`, \`fazenda_id\`, \`produto_id\`, \`quantidade\`, \`controlar_saldo\`, \`unidade\`,
       \`valor_unitario\`, \`valor_total_estoque\`, \`capital_inicializado_em\`)
     VALUES (?, ?, ?, ?, 1, 'un', '10.000000', ?, ?)`,
    [opts.nome, fazendaId, pid, opts.qtd, opts.capital ?? null, opts.inicializado ? new Date() : null],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM estoque WHERE fazenda_id = ? AND nome = ? ORDER BY id DESC LIMIT 1`,
    [fazendaId, opts.nome],
  );
  return { id: Number(rows[0]?.id), produtoId: pid };
}

describe.skipIf(!harness)("transferência bilateral — MySQL isolado", () => {
  const h = () => harness!;
  let fazendaA1: number;
  let fazendaA2: number;

  beforeAll(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
  });

  beforeEach(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
    fazendaA1 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A1");
    fazendaA2 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A2");
  });

  afterAll(async () => {
    if (harness) {
      await resetFinanceiroMysqlHarness(harness);
      await harness.close();
    }
  });

  it("A/C — transfere a mesma quantidade e o mesmo capital", async () => {
    const origem = await seedProduto(fazendaA1, {
      nome: "Sal transf A", qtd: "10.00", capital: "100.00", inicializado: true,
    });
    await seedProduto(fazendaA2, {
      nome: "Sal transf A", qtd: "0.00", capital: "0.00", inicializado: true, produtoId: origem.produtoId,
    });
    const r = await transferenciaInsumosService.confirmar(FIN_USER_A, "Tester", {
      idempotencyKey: `tr-a-${Date.now()}`,
      fazendaOrigemId: fazendaA1,
      fazendaDestinoId: fazendaA2,
      dataOperacao: "2026-10-09",
      itens: [{ estoqueOrigemId: origem.id, quantidade: "3" }],
    });
    expect(r.idempotent).toBe(false);
    const orig = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`, [origem.id],
    );
    expect(orig[0]?.quantidade).toBe("7.00");
    expect(persistirCapital(orig[0]!.valor_total_estoque)).toBe("70.00");
    const dest = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE fazenda_id = ? AND produto_id = ?`,
      [fazendaA2, origem.produtoId],
    );
    expect(dest[0]?.quantidade).toBe("3.00");
    expect(persistirCapital(dest[0]!.valor_total_estoque)).toBe("30.00");
  });

  it("B — destino já possuía saldo soma o capital recebido", async () => {
    const origem = await seedProduto(fazendaA1, {
      nome: "Sal transf B", qtd: "10.00", capital: "100.00", inicializado: true,
    });
    await seedProduto(fazendaA2, {
      nome: "Sal transf B", qtd: "5.00", capital: "80.00", inicializado: true, produtoId: origem.produtoId,
    });
    await transferenciaInsumosService.confirmar(FIN_USER_A, "Tester", {
      idempotencyKey: `tr-b-${Date.now()}`,
      fazendaOrigemId: fazendaA1,
      fazendaDestinoId: fazendaA2,
      dataOperacao: "2026-10-09",
      itens: [{ estoqueOrigemId: origem.id, quantidade: "3" }],
    });
    const dest = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE fazenda_id = ? AND produto_id = ?`,
      [fazendaA2, origem.produtoId],
    );
    expect(dest[0]?.quantidade).toBe("8.00");
    expect(persistirCapital(dest[0]!.valor_total_estoque)).toBe("110.00");
  });

  it("E — retry não duplica", async () => {
    const origem = await seedProduto(fazendaA1, {
      nome: "Sal transf E", qtd: "10.00", capital: "100.00", inicializado: true,
    });
    await seedProduto(fazendaA2, {
      nome: "Sal transf E", qtd: "0.00", capital: "0.00", inicializado: true, produtoId: origem.produtoId,
    });
    const cmd = {
      idempotencyKey: "tr-e-same-key-001",
      fazendaOrigemId: fazendaA1,
      fazendaDestinoId: fazendaA2,
      dataOperacao: "2026-10-09",
      itens: [{ estoqueOrigemId: origem.id, quantidade: "3" }],
    };
    const a = await transferenciaInsumosService.confirmar(FIN_USER_A, "Tester", cmd);
    const b = await transferenciaInsumosService.confirmar(FIN_USER_A, "Tester", cmd);
    expect(a.id).toBe(b.id);
    expect(b.idempotent).toBe(true);
    const orig = await h().query<{ quantidade: string }[]>(
      `SELECT quantidade FROM estoque WHERE id = ?`, [origem.id],
    );
    expect(orig[0]?.quantidade).toBe("7.00");
  });

  it("F — estorno devolve exatamente o capital", async () => {
    const origem = await seedProduto(fazendaA1, {
      nome: "Sal transf F", qtd: "10.00", capital: "100.00", inicializado: true,
    });
    await seedProduto(fazendaA2, {
      nome: "Sal transf F", qtd: "5.00", capital: "80.00", inicializado: true, produtoId: origem.produtoId,
    });
    const r = await transferenciaInsumosService.confirmar(FIN_USER_A, "Tester", {
      idempotencyKey: `tr-f-${Date.now()}`,
      fazendaOrigemId: fazendaA1,
      fazendaDestinoId: fazendaA2,
      dataOperacao: "2026-10-09",
      itens: [{ estoqueOrigemId: origem.id, quantidade: "3" }],
    });
    await transferenciaInsumosService.estornar(FIN_USER_A, "Tester", r.id, "teste");
    const orig = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`, [origem.id],
    );
    const dest = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE fazenda_id = ? AND produto_id = ?`,
      [fazendaA2, origem.produtoId],
    );
    expect(orig[0]?.quantidade).toBe("10.00");
    expect(persistirCapital(orig[0]!.valor_total_estoque)).toBe("100.00");
    expect(dest[0]?.quantidade).toBe("5.00");
    expect(persistirCapital(dest[0]!.valor_total_estoque)).toBe("80.00");
  });

  it("D — rollback se o destino falhar (fazenda inválida)", async () => {
    const origem = await seedProduto(fazendaA1, {
      nome: "Sal transf D", qtd: "10.00", capital: "100.00", inicializado: true,
    });
    await expect(transferenciaInsumosService.confirmar(FIN_USER_A, "Tester", {
      idempotencyKey: `tr-d-${Date.now()}`,
      fazendaOrigemId: fazendaA1,
      fazendaDestinoId: 999999,
      dataOperacao: "2026-10-09",
      itens: [{ estoqueOrigemId: origem.id, quantidade: "3" }],
    })).rejects.toThrow();
    const orig = await h().query<{ quantidade: string; valor_total_estoque: string }[]>(
      `SELECT quantidade, valor_total_estoque FROM estoque WHERE id = ?`, [origem.id],
    );
    expect(orig[0]?.quantidade).toBe("10.00");
    expect(persistirCapital(orig[0]!.valor_total_estoque)).toBe("100.00");
  });

  it("estoque não inicializado permanece legado e capital real segue NULL", async () => {
    const origem = await seedProduto(fazendaA1, { nome: "Sal legado", qtd: "10.00" });
    await transferenciaInsumosService.confirmar(FIN_USER_A, "Tester", {
      idempotencyKey: `tr-leg-${Date.now()}`,
      fazendaOrigemId: fazendaA1,
      fazendaDestinoId: fazendaA2,
      dataOperacao: "2026-10-09",
      itens: [{ estoqueOrigemId: origem.id, quantidade: "3" }],
    });
    const orig = await h().query<{ quantidade: string; valor_total_estoque: string | null; capital_inicializado_em: Date | null }[]>(
      `SELECT quantidade, valor_total_estoque, capital_inicializado_em FROM estoque WHERE id = ?`, [origem.id],
    );
    expect(orig[0]?.quantidade).toBe("7.00");
    expect(orig[0]?.valor_total_estoque).toBeNull();
    expect(orig[0]?.capital_inicializado_em).toBeNull();
  });
});
