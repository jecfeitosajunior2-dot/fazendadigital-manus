import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_CONTA_NAO_ENCONTRADA,
  MSG_FIN_SALDO_INSUFICIENTE,
  MSG_FIN_TRANSFERENCIA_MESMA_CONTA,
  MSG_FIN_VALOR_POSITIVO,
} from "@shared/financeiroNucleo";
import {
  MSG_EXTRATO_V2_SEM_SALDO_ACUMULADO,
  PREFIXO_CHAVE_TRANSFERENCIA,
  contasParaListagemCaixa,
  deveOmitirSaldoAcumulado,
  novaChaveIdempotenciaTransferencia,
  ordenarMovimentosExtrato,
  origemMovimentoExtrato,
  periodoExtratoValido,
  resumoTransferenciaCaixa,
  rotuloDirecaoExtrato,
  validarEdicaoContaV2,
  validarTransferenciaCaixaV2,
  type MovimentoExtratoV2,
} from "./caixaBancosV2";
import { type ContaFinanceiraV2Oficial } from "./contasFinanceirasV2";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasFinanceirasV2Page.tsx"), "utf8");
const router = readFileSync(resolve(here, "../../../server/financeiroV2Router.ts"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const legadoRouter = readFileSync(resolve(here, "../../../server/routers.ts"), "utf8");

function conta(parcial: Partial<ContaFinanceiraV2Oficial> = {}): ContaFinanceiraV2Oficial {
  return {
    id: 1,
    userId: 10,
    nome: "Caixa",
    tipo: "caixa",
    banco: null,
    agencia: null,
    numeroConta: null,
    saldoAbertura: "0.00",
    dataSaldoAbertura: "2026-01-01",
    ativa: true,
    saldoAtual: 5000,
    ...parcial,
  };
}

function movimento(parcial: Partial<MovimentoExtratoV2> = {}): MovimentoExtratoV2 {
  return {
    id: 1,
    userId: 10,
    contaId: 1,
    dataMovimento: "2026-03-10",
    direcao: "saida",
    natureza: "transferencia_saida",
    valor: "100.00",
    descricao: "Transferência",
    ...parcial,
  };
}

describe("caixaBancosV2 — extrato", () => {
  it("ordena por data e id e diferencia entrada e saída", () => {
    const lista = ordenarMovimentosExtrato([
      movimento({ id: 20, dataMovimento: "2026-03-10", direcao: "entrada", natureza: "recebimento" }),
      movimento({ id: 11, dataMovimento: "2026-03-02" }),
      movimento({ id: 12, dataMovimento: "2026-03-10" }),
    ]);
    expect(lista.map(m => m.id)).toEqual([11, 12, 20]);
    expect(rotuloDirecaoExtrato("entrada")).toBe("Entrada");
    expect(rotuloDirecaoExtrato("saida")).toBe("Saída");
    expect(origemMovimentoExtrato(movimento({ transferenciaId: 7 }))).toBe("Transferência #7");
    expect(origemMovimentoExtrato(movimento({ liquidacaoId: 3, transferenciaId: null }))).toBe("Liquidação #3");
  });

  it("omite saldo acumulado quando há filtro de período", () => {
    expect(periodoExtratoValido({ de: "2026-03-01", ate: "2026-03-31" })).toBe(true);
    expect(periodoExtratoValido({ de: "2026-03-31", ate: "2026-03-01" })).toBe(false);
    expect(deveOmitirSaldoAcumulado({ de: "2026-03-01", ate: "" })).toBe(true);
    expect(deveOmitirSaldoAcumulado({ de: "", ate: "" })).toBe(false);
    expect(MSG_EXTRATO_V2_SEM_SALDO_ACUMULADO).toMatch(/saldo acumulado/i);
  });

  it("a página de extrato usa só V2 e não apaga movimento", () => {
    expect(page).toContain("movimentosExtrato");
    expect(page).toContain("MSG_EXTRATO_V2_SEM_SALDO_ACUMULADO");
    expect(page).not.toContain("saldoAcumulado");
    expect(page).not.toContain("deleteMovimento");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("listMovimentacoes");
    expect(page).not.toContain("contas_financeiras");
  });
});

describe("caixaBancosV2 — transferência", () => {
  const contas = [
    conta({ id: 1, nome: "Origem", saldoAtual: 1000 }),
    conta({ id: 2, nome: "Destino", saldoAtual: 0 }),
    conta({ id: 3, nome: "Inativa", ativa: false, saldoAtual: 800 }),
    conta({ id: 9, userId: 99, nome: "Alheia", saldoAtual: 9000 }),
  ];

  it("aceita transferência válida e recusa mesmas contas, zero, saldo, inativa e inexistente", () => {
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "1",
      contaDestinoId: "2",
      valor: "10,50",
      dataTransferencia: "2026-03-01",
    }, contas, 10)).toEqual({
      ok: true,
      payload: {
        contaOrigemId: 1,
        contaDestinoId: 2,
        valor: 10.5,
        dataTransferencia: "2026-03-01",
        descricao: null,
      },
    });
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "1", contaDestinoId: "1", valor: "10", dataTransferencia: "2026-03-01",
    }, contas, 10).ok).toBe(false);
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "1", contaDestinoId: "1", valor: "10", dataTransferencia: "2026-03-01",
    }, contas, 10)).toMatchObject({ erros: { contaDestinoId: MSG_FIN_TRANSFERENCIA_MESMA_CONTA } });
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "1", contaDestinoId: "2", valor: "0", dataTransferencia: "2026-03-01",
    }, contas, 10)).toMatchObject({ erros: { valor: MSG_FIN_VALOR_POSITIVO } });
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "1", contaDestinoId: "2", valor: "-1", dataTransferencia: "2026-03-01",
    }, contas, 10)).toMatchObject({ erros: { valor: MSG_FIN_VALOR_POSITIVO } });
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "1", contaDestinoId: "2", valor: "1000,01", dataTransferencia: "2026-03-01",
    }, contas, 10)).toMatchObject({ erros: { valor: MSG_FIN_SALDO_INSUFICIENTE } });
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "3", contaDestinoId: "2", valor: "10", dataTransferencia: "2026-03-01",
    }, contas, 10)).toMatchObject({ erros: { contaOrigemId: MSG_FIN_CONTA_INATIVA } });
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "99", contaDestinoId: "2", valor: "10", dataTransferencia: "2026-03-01",
    }, contas, 10)).toMatchObject({ erros: { contaOrigemId: MSG_FIN_CONTA_NAO_ENCONTRADA } });
    expect(validarTransferenciaCaixaV2({
      contaOrigemId: "9", contaDestinoId: "2", valor: "10", dataTransferencia: "2026-03-01",
    }, contas, 10)).toMatchObject({ erros: { contaOrigemId: MSG_FIN_CONTA_NAO_ENCONTRADA } });
  });

  it("resume e gera chave de idempotência reutilizável", () => {
    const resumo = resumoTransferenciaCaixa({
      contaOrigemId: 1, contaDestinoId: 2, valor: 10.5, dataTransferencia: "2026-03-01", descricao: null,
    }, contas);
    expect(resumo.origem).toBe("Origem");
    expect(resumo.destino).toBe("Destino");
    expect(resumo.valor).toBe(10.5);
    const chave = novaChaveIdempotenciaTransferencia();
    expect(chave.startsWith(PREFIXO_CHAVE_TRANSFERENCIA)).toBe(true);
    expect(page).toContain("transferPendencia?.chave ?? novaChaveIdempotenciaTransferencia");
    expect(page).toContain("transferir.isPending");
    expect(page).toContain("Confirmar transferência");
    expect(page).toContain("transferir.mutate({");
    expect(page).not.toContain("retry");
  });
});

describe("caixaBancosV2 — edição e reativação", () => {
  it("edição cadastral não aceita saldo", () => {
    expect(validarEdicaoContaV2({ nome: "Caixa novo", tipo: "caixa", banco: "Sicoob" })).toEqual({
      ok: true,
      payload: { nome: "Caixa novo", tipo: "caixa", banco: "Sicoob", agencia: null, numeroConta: null },
    });
    expect(validarEdicaoContaV2({ nome: "", tipo: "caixa" }).ok).toBe(false);
    expect(page).toContain("incluirAbertura={false}");
    expect(page).toContain("contasUpdate");
    expect(page).not.toContain("saldoAtual:");
    expect(router).toContain("contasUpdate");
    expect(router).not.toMatch(/contasUpdate:[\s\S]{0,400}saldoAbertura/);
  });

  it("lista inativas e reativa sem apagar conta", () => {
    const contas = [
      conta({ id: 1, ativa: true }),
      conta({ id: 2, nome: "Parada", ativa: false }),
      conta({ id: 8, userId: 99, nome: "Alheia" }),
    ];
    expect(contasParaListagemCaixa(contas, 10, true).map(c => c.id)).toEqual([1]);
    expect(contasParaListagemCaixa(contas, 10, false).map(c => c.id)).toEqual([1, 2]);
    expect(page).toContain("contasReativar");
    expect(page).toContain("Ocultar contas inativas");
    expect(page).not.toContain("deleteConta");
    expect(nucleo).toContain("async reativarConta");
    expect(nucleo).toContain("MSG_FIN_SALDO_INSUFICIENTE");
  });
});

describe("caixaBancosV2 — isolamento e legado", () => {
  it("router V2 isola por usuário e o legado permanece bloqueado", () => {
    expect(router).toContain("financeiroNucleoService.extrato(ctx.user.id");
    expect(router).toContain("financeiroNucleoService.criarTransferencia(ctx.user.id");
    expect(router).toContain("financeiroNucleoService.atualizarConta(ctx.user.id");
    expect(router).toContain("financeiroNucleoService.reativarConta(ctx.user.id");
    expect(legadoRouter).toMatch(/listContas:[\s\S]{0,200}FORBIDDEN/);
    expect(page).not.toContain("trpc.financeiro.");
  });
});
