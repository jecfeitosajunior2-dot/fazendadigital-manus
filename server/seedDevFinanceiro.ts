import { db } from "./db";
import { contasFinanceiras, movimentacoes } from "../drizzle/schema";
import { shouldSeedDevUser } from "@shared/devAuth";

export async function seedDevFinanceiro() {
  if (!shouldSeedDevUser()) return;
  if (process.env.DEV_SEED_FINANCEIRO === "false") return;

  const existing = await db.select({ id: movimentacoes.id }).from(movimentacoes).limit(1);
  if (existing.length > 0) return;

  const contas = [
    { nome: "Conta Principal", tipo: "corrente", banco: "Banco do Brasil", saldoInicial: "45000.00", saldoAtual: "45000.00" },
    { nome: "Caixa Fazenda", tipo: "caixa", banco: null, saldoInicial: "3200.00", saldoAtual: "3200.00" },
    { nome: "Poupança", tipo: "poupanca", banco: "Caixa", saldoInicial: "120000.00", saldoAtual: "120000.00" },
  ];

  const contaIds: number[] = [];
  for (const conta of contas) {
    const result = await db.insert(contasFinanceiras).values(conta);
    contaIds.push(Number((result as { insertId?: number }[])[0]?.insertId));
  }

  const hoje = new Date();
  const diasAtras = (d: number) => {
    const dt = new Date(hoje);
    dt.setDate(dt.getDate() - d);
    return dt.toISOString().slice(0, 10);
  };

  const lancamentos = [
    { contaId: contaIds[0], tipo: "receita" as const, descricao: "Venda de novilhas", valor: "28500.00", data: diasAtras(3), status: "confirmado" as const },
    { contaId: contaIds[0], tipo: "receita" as const, descricao: "Venda de bezerros", valor: "12400.00", data: diasAtras(12), status: "confirmado" as const },
    { contaId: contaIds[1], tipo: "despesa" as const, descricao: "Compra de sal mineral", valor: "2800.00", data: diasAtras(5), status: "confirmado" as const },
    { contaId: contaIds[0], tipo: "despesa" as const, descricao: "Ração confinamento", valor: "15600.00", data: diasAtras(8), status: "confirmado" as const },
    { contaId: contaIds[0], tipo: "despesa" as const, descricao: "Manutenção de cercas", valor: "4200.00", data: diasAtras(15), status: "pendente" as const },
    { contaId: contaIds[2], tipo: "receita" as const, descricao: "Arrendamento de pasto", valor: "8000.00", data: diasAtras(20), status: "confirmado" as const },
    { contaId: contaIds[1], tipo: "despesa" as const, descricao: "Combustível diesel", valor: "1950.00", data: diasAtras(2), status: "confirmado" as const },
    { contaId: contaIds[0], tipo: "despesa" as const, descricao: "Vacinas do rebanho", valor: "6300.00", data: diasAtras(25), status: "confirmado" as const },
  ];

  for (const l of lancamentos) {
    await db.insert(movimentacoes).values({
      contaId: l.contaId,
      tipo: l.tipo,
      descricao: l.descricao,
      valor: l.valor,
      data: new Date(l.data),
      status: l.status,
    });
  }

  console.log(`[dev] ${lancamentos.length} lançamentos financeiros de exemplo criados`);
}
