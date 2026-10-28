import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MSG_FIN_PARCELAS_SOMA,
  MSG_FIN_PESSOA_INVALIDA,
  MSG_FIN_VALOR_POSITIVO,
} from "@shared/financeiroNucleo";
import {
  MSG_DESPESA_DATA,
  MSG_DESPESA_DESCRICAO,
  MSG_DESPESA_FORNECEDOR,
  MSG_DESPESA_SEM_CAIXA,
  aplicarModalidadeDespesa,
  caminhoNovoFornecedorDespesa,
  fornecedoresAtivosDespesa,
  rascunhoDespesaVazio,
  validarDespesaManual,
} from "./contasAPagarDespesa";
import { FINANCEIRO_CONTAS_A_PAGAR_PATH } from "./contasAPagarListagem";
import { FINANCEIRO_PESSOAS_PATH } from "./pessoasListagem";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAPagarPage.tsx"), "utf8");
const detalhe = readFileSync(resolve(here, "../pages/ContasAPagarDetalhePage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");
const compra = readFileSync(resolve(here, "../../../server/compraInsumos.ts"), "utf8");

const fornecedores = [
  { id: 7, nome: "Agro Norte", ativo: true },
  { id: 8, nome: "Inativa", ativo: false },
];
const fazendas = [{ id: 3, nome: "Sede" }];

function rascunhoValido() {
  return {
    ...rascunhoDespesaVazio("2026-03-01"),
    pessoaId: "7",
    descricao: "Ração",
    valorOriginal: "3000,00",
    dataCompetencia: "2026-03-01",
    modalidade: "unico" as const,
    quantidade: 1,
    linhas: [{ numero: 1, valor: "3000,00", vencimento: "2026-03-10" }],
  };
}

describe("contasAPagarDespesa — cadastro manual", () => {
  it("cadastra despesa à vista sem pagar", () => {
    expect(validarDespesaManual({
      rascunho: rascunhoValido(),
      fornecedores,
      fazendas,
    })).toEqual({
      ok: true,
      payload: {
        tipo: "pagar",
        pessoaId: 7,
        descricao: "Ração",
        dataCompetencia: "2026-03-01",
        valorOriginal: 3000,
        observacoes: null,
        fazendaOrigemId: null,
        parcelas: [{ numero: 1, vencimento: "2026-03-10", valorOriginal: 3000 }],
      },
    });
    expect(MSG_DESPESA_SEM_CAIXA).toMatch(/caixa/i);
  });

  it("recusa valor inválido, fornecedor inexistente e data vazia", () => {
    expect(validarDespesaManual({
      rascunho: { ...rascunhoValido(), valorOriginal: "0" },
      fornecedores,
      fazendas,
    })).toMatchObject({ erros: { valorOriginal: MSG_FIN_VALOR_POSITIVO } });
    expect(validarDespesaManual({
      rascunho: { ...rascunhoValido(), pessoaId: "8" },
      fornecedores,
      fazendas,
    })).toMatchObject({ erros: { pessoaId: MSG_FIN_PESSOA_INVALIDA } });
    expect(validarDespesaManual({
      rascunho: { ...rascunhoValido(), pessoaId: "99" },
      fornecedores,
      fazendas,
    })).toMatchObject({ erros: { pessoaId: MSG_FIN_PESSOA_INVALIDA } });
    expect(validarDespesaManual({
      rascunho: { ...rascunhoValido(), pessoaId: "" },
      fornecedores,
      fazendas,
    })).toMatchObject({ erros: { pessoaId: MSG_DESPESA_FORNECEDOR } });
    expect(validarDespesaManual({
      rascunho: { ...rascunhoValido(), descricao: "" },
      fornecedores,
      fazendas,
    })).toMatchObject({ erros: { descricao: MSG_DESPESA_DESCRICAO } });
    expect(validarDespesaManual({
      rascunho: { ...rascunhoValido(), dataCompetencia: "10/03/2026" },
      fornecedores,
      fazendas,
    })).toMatchObject({ erros: { dataCompetencia: MSG_DESPESA_DATA } });
  });

  it("parcela a soma e permite definir depois", () => {
    const parcelado = aplicarModalidadeDespesa({
      ...rascunhoValido(),
      valorOriginal: "100,00",
    }, "parcelado");
    expect(parcelado.linhas).toHaveLength(2);
    expect(validarDespesaManual({
      rascunho: {
        ...parcelado,
        linhas: [
          { numero: 1, valor: "40,00", vencimento: "2026-03-10" },
          { numero: 2, valor: "40,00", vencimento: "2026-04-10" },
        ],
      },
      fornecedores,
      fazendas,
    })).toMatchObject({ erros: { geral: MSG_FIN_PARCELAS_SOMA } });
    expect(validarDespesaManual({
      rascunho: {
        ...parcelado,
        linhas: [
          { numero: 1, valor: "50,00", vencimento: "2026-03-10" },
          { numero: 2, valor: "50,00", vencimento: "2026-04-10" },
        ],
      },
      fornecedores,
      fazendas,
    })).toMatchObject({
      ok: true,
      payload: {
        valorOriginal: 100,
        parcelas: [
          { numero: 1, vencimento: "2026-03-10", valorOriginal: 50 },
          { numero: 2, vencimento: "2026-04-10", valorOriginal: 50 },
        ],
      },
    });
    const depois = validarDespesaManual({
      rascunho: aplicarModalidadeDespesa(rascunhoValido(), "a_definir"),
      fornecedores,
      fazendas,
    });
    expect(depois.ok).toBe(true);
    if (depois.ok) {
      expect(depois.payload.valorOriginal).toBe(3000);
      expect(depois.payload.parcelas).toBeUndefined();
    }
  });

  it("fornecedores ativos e atalho de Pessoas", () => {
    expect(fornecedoresAtivosDespesa(fornecedores).map(p => p.id)).toEqual([7]);
    expect(caminhoNovoFornecedorDespesa()).toContain(FINANCEIRO_PESSOAS_PATH);
    expect(caminhoNovoFornecedorDespesa()).toContain(encodeURIComponent(FINANCEIRO_CONTAS_A_PAGAR_PATH));
  });

  it("a lista cadastra pelo V2 e o detalhe continua pagando e estornando", () => {
    expect(page).toContain("titulosCreateManual");
    expect(page).toContain("idempotencyKey");
    expect(page).toContain("novaChaveIdempotenciaTituloManual");
    expect(page).toContain("Nova despesa");
    expect(page).toContain("MSG_DESPESA_SEM_CAIXA");
    expect(page).not.toContain("liquidacaoPagar");
    expect(page).not.toContain("trpc.financeiro.");
    expect(detalhe).toContain("liquidacaoPagar");
    expect(detalhe).toContain("liquidacaoEstornar");
    expect(detalhe).toContain("titulosDefinirParcelas");
    expect(nucleo).toContain("async function criarTituloNoTx");
    expect(compra).toContain("FINANCEIRO_ORIGEM_COMPRA_INSUMOS");
    expect(compra).toContain("criarTituloNoTx");
  });
});
