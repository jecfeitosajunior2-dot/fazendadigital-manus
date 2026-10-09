import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import {
  FIN_USER_A,
  FIN_USER_B,
  fazendaIdDe,
  legadoIntacto,
  openFinanceiroMysqlHarness,
  pessoaIdDe,
  resetFinanceiroMysqlHarness,
  seedFinanceiroMysqlUsers,
} from "./financeiroMysqlHarness";
import { createCompraInsumosService } from "./compraInsumos";
import { createCompraInsumosMysqlStore } from "./compraInsumosMysql";
import { FINANCEIRO_ORIGEM_COMPRA_INSUMOS, MSG_COMPRA_ESTORNO_COM_PAGAMENTO } from "../shared/compraInsumos";
import { createFinanceiroNucleoService } from "./financeiroNucleo";

const harness = await openFinanceiroMysqlHarness();

async function seedEstoque(fazendaId: number, nome: string, qtd = "100.00", controla = true) {
  await harness!.pool.query(
    `INSERT INTO \`estoque\` (\`nome\`, \`fazenda_id\`, \`quantidade\`, \`controlar_saldo\`, \`unidade\`)
     VALUES (?, ?, ?, ?, 'kg')`,
    [nome, fazendaId, qtd, controla ? 1 : 0],
  );
  const rows = await harness!.query<{ id: number }[]>(
    `SELECT id FROM estoque WHERE fazenda_id = ? AND nome = ? ORDER BY id DESC LIMIT 1`,
    [fazendaId, nome],
  );
  return Number(rows[0]?.id);
}

describe.skipIf(!harness)("compraInsumos — MySQL isolado", () => {
  const h = () => harness!;
  let pessoaA: number;
  let pessoaB: number;
  let fazendaA1: number;
  let estoqueSal: number;

  function compraSvc() {
    const drizzleDb = drizzle(h().pool, { schema, mode: "default" });
    return createCompraInsumosService(createCompraInsumosMysqlStore(drizzleDb));
  }

  beforeAll(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
  });

  beforeEach(async () => {
    await resetFinanceiroMysqlHarness(h());
    await seedFinanceiroMysqlUsers(h());
    pessoaA = await pessoaIdDe(h(), FIN_USER_A, "Fornecedor A");
    pessoaB = await pessoaIdDe(h(), FIN_USER_B, "Fornecedor B");
    fazendaA1 = await fazendaIdDe(h(), FIN_USER_A, "Fazenda A1");
    estoqueSal = await seedEstoque(fazendaA1, "Sal 2A");
  });

  afterAll(async () => {
    if (harness) {
      await resetFinanceiroMysqlHarness(harness);
      const legado = await legadoIntacto(harness);
      expect(legado.contas).toBe(3);
      expect(legado.movs).toBe(8);
      await harness.close();
    }
  });

  it("commit atômico: operação + linhas + título", async () => {
    const r = await compraSvc().confirmarCompraInsumos(FIN_USER_A, "Teste", {
      idempotencyKey: "mysql-compra-a",
      fazendaId: fazendaA1,
      dataOperacao: "2026-10-09",
      fornecedorId: pessoaA,
      valorFrete: 0,
      itens: [{ estoqueId: estoqueSal, quantidade: "5", valorMercadoria: 10000 }],
    });
    const ops = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_operacoes WHERE user_id = ?`,
      [FIN_USER_A],
    );
    const movs = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_movimentacoes WHERE operacao_id = ?`,
      [r.operacaoId],
    );
    const titulos = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM financeiro_titulos WHERE user_id = ? AND origem_tipo = ? AND origem_id = ?`,
      [FIN_USER_A, FINANCEIRO_ORIGEM_COMPRA_INSUMOS, r.operacaoId],
    );
    expect(Number(ops[0]?.n)).toBe(1);
    expect(Number(movs[0]?.n)).toBe(1);
    expect(Number(titulos[0]?.n)).toBe(1);
    expect(r.tituloIds).toHaveLength(1);
  });

  it("idempotência UNIQUE não cria segunda operação", async () => {
    const svc = compraSvc();
    const input = {
      idempotencyKey: "mysql-compra-ad",
      fazendaId: fazendaA1,
      dataOperacao: "2026-10-09",
      fornecedorId: pessoaA,
      valorFrete: 0,
      itens: [{ estoqueId: estoqueSal, quantidade: "1", valorMercadoria: 50 }],
    };
    const a = await svc.confirmarCompraInsumos(FIN_USER_A, "Teste", input);
    const b = await svc.confirmarCompraInsumos(FIN_USER_A, "Teste", input);
    expect(b.idempotente).toBe(true);
    expect(b.operacaoId).toBe(a.operacaoId);
    const ops = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_operacoes WHERE user_id = ? AND idempotency_key = ?`,
      [FIN_USER_A, "mysql-compra-ad"],
    );
    expect(Number(ops[0]?.n)).toBe(1);
  });

  it("erro financeiro faz rollback do estoque", async () => {
    const drizzleDb = drizzle(h().pool, { schema, mode: "default" });
    const base = createCompraInsumosMysqlStore(drizzleDb);
    const svc = createCompraInsumosService({
      transaction(fn) {
        return base.transaction(async tx => {
          const sabotado = {
            ...tx,
            fin: {
              ...tx.fin,
              async insertTitulo() {
                throw new Error("falha financeira mysql");
              },
            },
          };
          return fn(sabotado);
        });
      },
    });
    await expect(svc.confirmarCompraInsumos(FIN_USER_A, "Teste", {
      idempotencyKey: "mysql-compra-k",
      fazendaId: fazendaA1,
      dataOperacao: "2026-10-09",
      fornecedorId: pessoaA,
      valorFrete: 0,
      itens: [{ estoqueId: estoqueSal, quantidade: "3", valorMercadoria: 30 }],
    })).rejects.toThrow(/falha financeira mysql/);
    const ops = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_operacoes WHERE user_id = ?`,
      [FIN_USER_A],
    );
    const titulos = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM financeiro_titulos WHERE user_id = ?`,
      [FIN_USER_A],
    );
    const saldo = await h().query<{ quantidade: string }[]>(
      `SELECT quantidade FROM estoque WHERE id = ?`,
      [estoqueSal],
    );
    expect(Number(ops[0]?.n)).toBe(0);
    expect(Number(titulos[0]?.n)).toBe(0);
    expect(Number(saldo[0]?.quantidade)).toBe(100);
  });

  it("erro no segundo item faz rollback", async () => {
    const segundo = await seedEstoque(fazendaA1, "Diesel 2A");
    const drizzleDb = drizzle(h().pool, { schema, mode: "default" });
    const base = createCompraInsumosMysqlStore(drizzleDb);
    let inserts = 0;
    const svc = createCompraInsumosService({
      transaction(fn) {
        return base.transaction(async tx => {
          const original = tx.insertMovimentacao.bind(tx);
          return fn({
            ...tx,
            async insertMovimentacao(values) {
              inserts += 1;
              if (inserts === 2) throw new Error("falha item 2");
              return original(values);
            },
          });
        });
      },
    });
    await expect(svc.confirmarCompraInsumos(FIN_USER_A, "Teste", {
      idempotencyKey: "mysql-compra-t",
      fazendaId: fazendaA1,
      dataOperacao: "2026-10-09",
      fornecedorId: pessoaA,
      valorFrete: 0,
      itens: [
        { estoqueId: estoqueSal, quantidade: "1", valorMercadoria: 40 },
        { estoqueId: segundo, quantidade: "1", valorMercadoria: 60 },
      ],
    })).rejects.toThrow(/falha item 2/);
    const ops = await h().query<{ n: number }[]>(
      `SELECT COUNT(*) n FROM estoque_operacoes WHERE user_id = ?`,
      [FIN_USER_A],
    );
    expect(Number(ops[0]?.n)).toBe(0);
  });

  it("userId isola fazenda/fornecedor", async () => {
    await expect(compraSvc().confirmarCompraInsumos(FIN_USER_A, "Teste", {
      idempotencyKey: "mysql-compra-i",
      fazendaId: fazendaA1,
      dataOperacao: "2026-10-09",
      fornecedorId: pessoaB,
      valorFrete: 0,
      itens: [{ estoqueId: estoqueSal, quantidade: "1", valorMercadoria: 10 }],
    })).rejects.toBeTruthy();
  });

  it("estorno sem pagamento cancela título e marca operação", async () => {
    const svc = compraSvc();
    const r = await svc.confirmarCompraInsumos(FIN_USER_A, "Teste", {
      idempotencyKey: "mysql-compra-m",
      fazendaId: fazendaA1,
      dataOperacao: "2026-10-09",
      fornecedorId: pessoaA,
      valorFrete: 0,
      itens: [{ estoqueId: estoqueSal, quantidade: "2", valorMercadoria: 20 }],
    });
    await svc.estornarOperacao(FIN_USER_A, r.operacaoId, "Correção", "Teste");
    const op = await h().query<{ status: string }[]>(
      `SELECT status FROM estoque_operacoes WHERE id = ?`,
      [r.operacaoId],
    );
    const tit = await h().query<{ estado: string }[]>(
      `SELECT estado FROM financeiro_titulos WHERE origem_id = ? AND origem_tipo = ?`,
      [r.operacaoId, FINANCEIRO_ORIGEM_COMPRA_INSUMOS],
    );
    expect(op[0]?.status).toBe("estornada");
    expect(tit[0]?.estado).toBe("cancelado");
  });

  it("estorno com pagamento efetivo e bloqueado", async () => {
    const svc = compraSvc();
    const r = await svc.confirmarCompraInsumos(FIN_USER_A, "Teste", {
      idempotencyKey: "mysql-compra-n",
      fazendaId: fazendaA1,
      dataOperacao: "2026-10-09",
      fornecedorId: pessoaA,
      valorFrete: 0,
      itens: [{ estoqueId: estoqueSal, quantidade: "2", valorMercadoria: 200 }],
    });
    const fin = createFinanceiroNucleoService(h().store);
    const tituloId = Number(r.tituloIds[0]);
    const conta = await fin.criarContaFinanceira(FIN_USER_A, {
      nome: "Caixa 2A",
      tipo: "caixa",
      saldoAbertura: 1000,
      dataSaldoAbertura: "2026-01-01",
    });
    await fin.definirParcelas(FIN_USER_A, tituloId, [
      { numero: 1, vencimento: "2026-11-01", valorOriginal: 200 },
    ]);
    const det = await fin.detalheTitulo(FIN_USER_A, tituloId);
    const parcelaId = Number(det.parcelas[0]?.id);
    await fin.criarPagamento(FIN_USER_A, {
      contaId: conta.id,
      dataLiquidacao: "2026-10-10",
      valorMovimentado: 200,
      idempotencyKey: "pag-2a-n",
      alocacoes: [{ parcelaId, principalLiquidado: 200 }],
    });
    await expect(svc.estornarOperacao(FIN_USER_A, r.operacaoId, "Nao", "Teste"))
      .rejects.toMatchObject({ message: MSG_COMPRA_ESTORNO_COM_PAGAMENTO });
    const op = await h().query<{ status: string }[]>(
      `SELECT status FROM estoque_operacoes WHERE id = ?`,
      [r.operacaoId],
    );
    expect(op[0]?.status).toBe("confirmada");
  });
});
