import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FINANCEIRO_CONTAS_V2_PATH,
  MSG_CONTA_V2_DATA,
  MSG_CONTA_V2_NOME,
  MSG_CONTA_V2_SALDO,
  MSG_CONTA_V2_TIPO,
  MSG_INATIVAR_CONTA_V2,
  MSG_NENHUMA_CONTA_V2,
  MSG_SEM_CONTA_V2_ATIVA,
  contasVisiveisParaUsuario,
  deveOrientarCadastroContaV2,
  parseSaldoAberturaContaV2,
  rotuloSituacaoContaV2,
  rotuloTipoContaV2,
  temContaV2Ativa,
  validarCadastroContaV2,
  type ContaFinanceiraV2Oficial,
} from "./contasFinanceirasV2";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasFinanceirasV2Page.tsx"), "utf8");
const detalhe = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const lista = readFileSync(resolve(here, "../pages/ContasAPagarPage.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const menu = readFileSync(resolve(here, "./data.ts"), "utf8");
const legado = readFileSync(resolve(here, "../pages/FinancialManagementPage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");

function conta(parcial: Partial<ContaFinanceiraV2Oficial> = {}): ContaFinanceiraV2Oficial {
  return {
    id: 1,
    userId: 1,
    nome: "Caixa",
    tipo: "caixa",
    banco: null,
    agencia: null,
    numeroConta: null,
    saldoAbertura: "0.00",
    dataSaldoAbertura: "2026-01-01",
    ativa: true,
    saldoAtual: 0,
    ...parcial,
  };
}

describe("contasFinanceirasV2 — apresentação e validação", () => {
  it("lista vazia e orientação só depois da consulta oficial", () => {
    expect(temContaV2Ativa([])).toBe(false);
    expect(deveOrientarCadastroContaV2({ carregando: true, erro: false, contas: [] })).toBe(false);
    expect(deveOrientarCadastroContaV2({ carregando: false, erro: true, contas: [] })).toBe(false);
    expect(deveOrientarCadastroContaV2({ carregando: false, erro: false, contas: undefined })).toBe(false);
    expect(deveOrientarCadastroContaV2({ carregando: false, erro: false, contas: [] })).toBe(true);
    expect(deveOrientarCadastroContaV2({
      carregando: false,
      erro: false,
      contas: [conta({ ativa: false })],
    })).toBe(true);
    expect(deveOrientarCadastroContaV2({ carregando: false, erro: false, contas: [conta()] })).toBe(false);
    expect(MSG_NENHUMA_CONTA_V2).toBe("Nenhuma conta financeira cadastrada.");
    expect(MSG_SEM_CONTA_V2_ATIVA).toMatch(/conta financeira/);
  });

  it("cadastro de conta corrente e caixa valida campos obrigatórios", () => {
    expect(validarCadastroContaV2({
      nome: "Conta da fazenda",
      tipo: "conta_corrente",
      saldoAbertura: "1500,50",
      dataSaldoAbertura: "2026-10-01",
      banco: "Sicoob",
    })).toEqual({
      ok: true,
      payload: {
        nome: "Conta da fazenda",
        tipo: "conta_corrente",
        saldoAbertura: 1500.5,
        dataSaldoAbertura: "2026-10-01",
        banco: "Sicoob",
        agencia: null,
        numeroConta: null,
      },
    });
    expect(validarCadastroContaV2({
      nome: "Caixa do curral",
      tipo: "caixa",
      saldoAbertura: "0",
      dataSaldoAbertura: "2026-10-17",
    })).toMatchObject({
      ok: true,
      payload: { tipo: "caixa", saldoAbertura: 0 },
    });
    expect(rotuloTipoContaV2("conta_corrente")).toBe("Conta corrente");
    expect(rotuloTipoContaV2("caixa")).toBe("Caixa");
  });

  it("saldo de abertura zero e positivo são aceitos; negativo e vazio não", () => {
    expect(parseSaldoAberturaContaV2("0")).toEqual({ ok: true, valor: 0 });
    expect(parseSaldoAberturaContaV2("0,00")).toEqual({ ok: true, valor: 0 });
    expect(parseSaldoAberturaContaV2("R$ 10,00")).toEqual({ ok: true, valor: 10 });
    expect(parseSaldoAberturaContaV2("1.250,40")).toEqual({ ok: true, valor: 1250.4 });
    expect(parseSaldoAberturaContaV2("")).toEqual({ ok: false });
    expect(parseSaldoAberturaContaV2("-1")).toEqual({ ok: false });
    expect(validarCadastroContaV2({
      nome: "",
      tipo: "",
      saldoAbertura: "",
      dataSaldoAbertura: "",
    }).ok).toBe(false);
    if (validarCadastroContaV2({
      nome: "",
      tipo: "corrente",
      saldoAbertura: "-10",
      dataSaldoAbertura: "17/10/2026",
    }).ok === false) {
      const erros = validarCadastroContaV2({
        nome: "",
        tipo: "corrente",
        saldoAbertura: "-10",
        dataSaldoAbertura: "17/10/2026",
      });
      expect(erros.ok).toBe(false);
      if (!erros.ok) {
        expect(erros.erros.nome).toBe(MSG_CONTA_V2_NOME);
        expect(erros.erros.tipo).toBe(MSG_CONTA_V2_TIPO);
        expect(erros.erros.saldoAbertura).toBe(MSG_CONTA_V2_SALDO);
        expect(erros.erros.dataSaldoAbertura).toBe(MSG_CONTA_V2_DATA);
      }
    }
  });

  it("conta inativa e isolamento por usuário", () => {
    expect(rotuloSituacaoContaV2(true)).toBe("Ativa");
    expect(rotuloSituacaoContaV2(false)).toBe("Inativa");
    expect(MSG_INATIVAR_CONTA_V2).toMatch(/deixa de estar disponível para novos pagamentos/i);
    const mistas = [conta({ id: 1, userId: 1 }), conta({ id: 2, userId: 99, nome: "Outra" })];
    expect(contasVisiveisParaUsuario(mistas, 1).map(c => c.id)).toEqual([1]);
    expect(contasVisiveisParaUsuario(mistas, 99).map(c => c.id)).toEqual([2]);
    expect(temContaV2Ativa([conta({ ativa: false })])).toBe(false);
  });
});

describe("contasFinanceirasV2 — tela e separação do legado", () => {
  it("rota própria não substitui o legado e usa só o V2", () => {
    expect(FINANCEIRO_CONTAS_V2_PATH).toBe("/financeiro/v2/contas");
    expect(app).toContain("ContasFinanceirasV2Page");
    expect(app).toContain("FINANCEIRO_CONTAS_V2_PATH");
    expect(app.indexOf("FINANCEIRO_CONTAS_V2_PATH")).toBeGreaterThan(-1);
    expect(app).toContain('path="/financeiro/contas" component={FinancialManagementPage}');
    expect(page).toContain("financeiroV2.contasList");
    expect(page).toContain("financeiroV2.contasGet");
    expect(page).toContain("financeiroV2.contasCreate");
    expect(page).toContain("financeiroV2.contasInativar");
    expect(page).not.toContain("trpc.financeiro.");
    expect(page).not.toContain("listContas");
    expect(page).not.toContain("createConta");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).not.toContain("titulosDefinirParcelas");
    expect(page).not.toContain("contas_financeiras");
    expect(legado).not.toContain("financeiroV2");
    expect(legado).not.toContain("FINANCEIRO_CONTAS_V2_PATH");
  });

  it("não cria segundo item de menu chamado Contas Financeiras", () => {
    expect(menu).toContain('label: "Contas"');
    expect(menu).toContain('path: "/financeiro/contas"');
    expect(menu).not.toContain(FINANCEIRO_CONTAS_V2_PATH);
    expect(menu).not.toContain("Contas Financeiras");
    expect(lista).toContain("FINANCEIRO_CONTAS_V2_PATH");
    expect(detalhe).toContain("FINANCEIRO_CONTAS_V2_PATH");
    expect(detalhe).toContain("MSG_SEM_CONTA_V2_ATIVA");
    expect(detalhe).toContain("financeiroV2.contasList");
    expect(detalhe).not.toContain("liquidacaoPagar");
    expect(detalhe).not.toContain("trpc.financeiro.");
  });

  it("não altera o núcleo V2 nem calcula saldo no cliente", () => {
    expect(nucleo).toContain("async listarContas(userId: number)");
    expect(nucleo).toContain("saldoAtual: await saldoContaTx");
    expect(page).toContain("saldoAtual");
    expect(page).not.toContain("calcularSaldoConta");
    expect(page).toContain("MSG_NENHUMA_CONTA_V2");
    expect(page).toContain("contasInativar");
    expect(page).not.toContain("contasReativar");
    expect(page).not.toContain("deleteConta");
  });
});
