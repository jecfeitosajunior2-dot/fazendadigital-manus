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
  MSG_RECEITA_DATA,
  MSG_RECEITA_DESCRICAO,
  MSG_RECEITA_PAGADOR,
  MSG_RECEITA_SEM_CAIXA,
  aplicarModalidadeReceita,
  caminhoNovaPessoaReceita,
  pagadoresAtivosReceita,
  rascunhoReceitaVazio,
  validarReceitaManual,
} from "./contasAReceberReceita";
import { FINANCEIRO_CONTAS_A_RECEBER_PATH } from "./contasAReceberListagem";
import { FINANCEIRO_PESSOAS_PATH } from "./pessoasListagem";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/ContasAReceberPage.tsx"), "utf8");
const detalhe = readFileSync(resolve(here, "../pages/ContasAReceberDetalhePage.tsx"), "utf8");
const nucleo = readFileSync(resolve(here, "../../../server/financeiroNucleo.ts"), "utf8");

const pagadores = [
  { id: 4, nome: "Sitio Vizinho", ativo: true, tipo: "fornecedor" },
  { id: 5, nome: "Cliente", ativo: true, tipo: "cliente" },
  { id: 8, nome: "Inativa", ativo: false, tipo: "cliente" },
];
const fazendas = [{ id: 3, nome: "Sede" }];

function rascunhoValido() {
  return {
    ...rascunhoReceitaVazio("2026-03-01"),
    pessoaId: "4",
    descricao: "Aluguel do pasto",
    valorOriginal: "3000,00",
    dataCompetencia: "2026-03-01",
    modalidade: "unico" as const,
    quantidade: 1,
    linhas: [{ numero: 1, valor: "3000,00", vencimento: "2026-03-31" }],
  };
}

describe("contasAReceberReceita — cadastro manual", () => {
  it("cadastra receita à vista sem receber", () => {
    expect(validarReceitaManual({
      rascunho: rascunhoValido(),
      pagadores,
      fazendas,
    })).toEqual({
      ok: true,
      payload: {
        tipo: "receber",
        pessoaId: 4,
        descricao: "Aluguel do pasto",
        dataCompetencia: "2026-03-01",
        valorOriginal: 3000,
        observacoes: null,
        fazendaOrigemId: null,
        parcelas: [{ numero: 1, vencimento: "2026-03-31", valorOriginal: 3000 }],
      },
    });
    expect(MSG_RECEITA_SEM_CAIXA).toMatch(/caixa/i);
  });

  it("aceita pessoa ativa de qualquer papel e recusa inválidos", () => {
    expect(validarReceitaManual({
      rascunho: { ...rascunhoValido(), pessoaId: "5" },
      pagadores,
      fazendas,
    })).toMatchObject({ ok: true, payload: { pessoaId: 5, tipo: "receber" } });
    expect(validarReceitaManual({
      rascunho: { ...rascunhoValido(), valorOriginal: "0" },
      pagadores,
      fazendas,
    })).toMatchObject({ erros: { valorOriginal: MSG_FIN_VALOR_POSITIVO } });
    expect(validarReceitaManual({
      rascunho: { ...rascunhoValido(), pessoaId: "8" },
      pagadores,
      fazendas,
    })).toMatchObject({ erros: { pessoaId: MSG_FIN_PESSOA_INVALIDA } });
    expect(validarReceitaManual({
      rascunho: { ...rascunhoValido(), pessoaId: "" },
      pagadores,
      fazendas,
    })).toMatchObject({ erros: { pessoaId: MSG_RECEITA_PAGADOR } });
    expect(validarReceitaManual({
      rascunho: { ...rascunhoValido(), descricao: "" },
      pagadores,
      fazendas,
    })).toMatchObject({ erros: { descricao: MSG_RECEITA_DESCRICAO } });
    expect(validarReceitaManual({
      rascunho: { ...rascunhoValido(), dataCompetencia: "31/03/2026" },
      pagadores,
      fazendas,
    })).toMatchObject({ erros: { dataCompetencia: MSG_RECEITA_DATA } });
  });

  it("parcela a soma e permite definir depois", () => {
    const parcelado = aplicarModalidadeReceita({ ...rascunhoValido(), valorOriginal: "100,00" }, "parcelado");
    expect(validarReceitaManual({
      rascunho: {
        ...parcelado,
        linhas: [
          { numero: 1, valor: "40,00", vencimento: "2026-03-10" },
          { numero: 2, valor: "40,00", vencimento: "2026-04-10" },
        ],
      },
      pagadores,
      fazendas,
    })).toMatchObject({ erros: { geral: MSG_FIN_PARCELAS_SOMA } });
    const depois = validarReceitaManual({
      rascunho: aplicarModalidadeReceita(rascunhoValido(), "a_definir"),
      pagadores,
      fazendas,
    });
    expect(depois.ok).toBe(true);
    if (depois.ok) expect(depois.payload.parcelas).toBeUndefined();
    expect(pagadoresAtivosReceita(pagadores).map(p => p.id)).toEqual([4, 5]);
    expect(caminhoNovaPessoaReceita()).toContain(FINANCEIRO_PESSOAS_PATH);
    expect(caminhoNovaPessoaReceita()).toContain(encodeURIComponent(FINANCEIRO_CONTAS_A_RECEBER_PATH));
  });

  it("a lista cadastra pelo V2 e o detalhe continua recebendo e estornando", () => {
    expect(page).toContain("titulosCreateManual");
    expect(page).toContain("idempotencyKey");
    expect(page).toContain("novaChaveIdempotenciaTituloManual");
    expect(page).toContain("Nova receita");
    expect(page).toContain("MSG_RECEITA_SEM_CAIXA");
    expect(page).toContain("rotuloOrigemTitulo");
    expect(page).not.toContain("liquidacaoReceber");
    expect(page).not.toContain("trpc.financeiro.");
    expect(detalhe).toContain("liquidacaoReceber");
    expect(detalhe).toContain("liquidacaoEstornar");
    expect(detalhe).toContain("titulosDefinirParcelas");
    expect(nucleo).toContain("async function criarTituloNoTx");
    expect(nucleo).not.toContain("pessoa.tipo === \"cliente\"");
  });
});
