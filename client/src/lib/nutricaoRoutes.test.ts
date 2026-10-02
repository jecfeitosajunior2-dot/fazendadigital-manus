import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildNutricaoVisaoGeralRetorno,
  comRetornoNutricao,
  destinoVoltarNutricaoDetalhe,
  filtrosNutricaoVisaoGeralDaQuery,
  listaFornecimentosComRetornoVisaoGeral,
  listaLeiturasComRetornoVisaoGeral,
  listaNutricaoComFazenda,
  listUrlNutricaoPreservandoRetorno,
  NUTRICAO_BATIDAS_PATH,
  NUTRICAO_COCHOS_PATH,
  NUTRICAO_DIETAS_PATH,
  NUTRICAO_FORNECIMENTOS_PATH,
  NUTRICAO_LEITURAS_PATH,
  NUTRICAO_PLANEJAMENTO_PATH,
  parseRetornoNutricao,
  parseRetornoNutricaoVisaoGeral,
  retornoNutricaoDaQuery,
} from "./nutricaoRoutes";

describe("nutricaoRoutes — retorno da Visão Geral", () => {
  it("monta retorno com fazenda, lote e período", () => {
    expect(buildNutricaoVisaoGeralRetorno({
      fazendaId: "3",
      loteId: "8",
      de: "2026-10-01",
      ate: "2026-10-31",
    })).toBe("/nutricao/visao-geral?fazendaId=3&loteId=8&de=2026-10-01&ate=2026-10-31");
  });

  it("anexa retorno à lista de fornecimentos", () => {
    const path = listaFornecimentosComRetornoVisaoGeral({
      fazendaId: "3",
      loteId: "8",
      de: "2026-10-01",
      ate: "2026-10-31",
    });
    expect(path.startsWith(`${NUTRICAO_FORNECIMENTOS_PATH}?fazendaId=3`)).toBe(true);
    expect(path).toContain("retorno=");
    expect(parseRetornoNutricaoVisaoGeral(new URL(path, "http://local").searchParams.get("retorno"))).toBe(
      "/nutricao/visao-geral?fazendaId=3&loteId=8&de=2026-10-01&ate=2026-10-31",
    );
  });

  it("anexa retorno à lista de leituras", () => {
    const path = listaLeiturasComRetornoVisaoGeral({ fazendaId: "3" });
    expect(path.startsWith(`${NUTRICAO_LEITURAS_PATH}?fazendaId=3`)).toBe(true);
    expect(parseRetornoNutricaoVisaoGeral(new URL(path, "http://local").searchParams.get("retorno"))).toBe(
      "/nutricao/visao-geral?fazendaId=3",
    );
  });

  it("rejeita retorno fora da visão geral", () => {
    expect(parseRetornoNutricaoVisaoGeral("/nutricao/fornecimentos")).toBeNull();
    expect(parseRetornoNutricaoVisaoGeral("/rebanho/visao-geral")).toBeNull();
    expect(parseRetornoNutricaoVisaoGeral(null)).toBeNull();
  });

  it("preserva retorno ao trocar fazenda na lista", () => {
    const comRetorno = listaFornecimentosComRetornoVisaoGeral({ fazendaId: "3", loteId: "8" });
    const search = new URL(comRetorno, "http://local").search;
    const trocada = listUrlNutricaoPreservandoRetorno(NUTRICAO_FORNECIMENTOS_PATH, "9", search);
    expect(trocada).toContain("fazendaId=9");
    expect(parseRetornoNutricaoVisaoGeral(new URL(trocada, "http://local").searchParams.get("retorno"))).toBe(
      "/nutricao/visao-geral?fazendaId=3&loteId=8",
    );
  });

  it("lista pelo menu não leva retorno", () => {
    expect(listUrlNutricaoPreservandoRetorno(NUTRICAO_FORNECIMENTOS_PATH, "3", "")).toBe(
      `${NUTRICAO_FORNECIMENTOS_PATH}?fazendaId=3`,
    );
    expect(filtrosNutricaoVisaoGeralDaQuery("")).toBeNull();
  });

  it("detalhe prioriza origem explícita e cai na lista com fazenda", () => {
    expect(parseRetornoNutricao("/nutricao/visao-geral?fazendaId=3&loteId=8")).toBe(
      "/nutricao/visao-geral?fazendaId=3&loteId=8",
    );
    expect(parseRetornoNutricao("/nutricao/cochos/12")).toBe("/nutricao/cochos/12");
    expect(parseRetornoNutricao("/nutricao/fornecimentos")).toBe("/nutricao/fornecimentos");
    expect(parseRetornoNutricao("/rebanho/visao-geral")).toBeNull();
    expect(parseRetornoNutricao("/nutricao/cochos/12/editar")).toBeNull();
    expect(parseRetornoNutricao("https://exemplo.com/nutricao")).toBeNull();
    expect(destinoVoltarNutricaoDetalhe({
      retorno: "/nutricao/visao-geral?fazendaId=3",
      listaPath: NUTRICAO_FORNECIMENTOS_PATH,
      fazendaId: 9,
    })).toBe("/nutricao/visao-geral?fazendaId=3");
    expect(destinoVoltarNutricaoDetalhe({
      retorno: null,
      listaPath: NUTRICAO_DIETAS_PATH,
      fazendaId: 4,
    })).toBe("/nutricao/dietas?fazendaId=4");
    expect(destinoVoltarNutricaoDetalhe({
      retorno: "/rebanho",
      listaPath: NUTRICAO_LEITURAS_PATH,
      fazendaId: 2,
    })).toBe("/nutricao/cochos/leituras?fazendaId=2");
    expect(comRetornoNutricao("/nutricao/cochos/leituras/7", "/nutricao/cochos/12")).toContain("retorno=");
    expect(parseRetornoNutricao(new URL(
      comRetornoNutricao("/nutricao/cochos/leituras/7", "/nutricao/cochos/12"),
      "http://local",
    ).searchParams.get("retorno"))).toBe("/nutricao/cochos/12");
    expect(retornoNutricaoDaQuery("retorno=%2Fnutricao%2Fcochos%2F12")).toBe("/nutricao/cochos/12");
  });
});

describe("nutricaoRoutes — contrato das telas", () => {
  it("Visão Geral usa o retorno oficial no Ver todos / Ver todas", () => {
    const page = readFileSync(new URL("../pages/NutricaoVisaoGeralPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("listaFornecimentosComRetornoVisaoGeral");
    expect(page).toContain("listaLeiturasComRetornoVisaoGeral");
    expect(page).toContain("filtrosNutricaoVisaoGeralDaQuery");
    expect(page).toContain("comRetornoNutricaoVisaoGeral");
    expect(page).toContain("`/nutricao/fornecimentos/${f.id}`");
    expect(page).toContain("`/nutricao/cochos/leituras/${l.id}`");
  });

  it("detalhes da Nutrição usam o Voltar padrão acima do cartão", () => {
    const detalhes = [
      ["NutricaoPlanejamentoDetalhePage.tsx", "NUTRICAO_PLANEJAMENTO_PATH"],
      ["NutricaoDietaDetalhePage.tsx", "NUTRICAO_DIETAS_PATH"],
      ["NutricaoFornecimentoDetalhePage.tsx", "NUTRICAO_FORNECIMENTOS_PATH"],
      ["NutricaoBatidaDetalhePage.tsx", "NUTRICAO_BATIDAS_PATH"],
      ["NutricaoCochoDetalhePage.tsx", "NUTRICAO_COCHOS_PATH"],
      ["NutricaoCochoLeituraDetalhePage.tsx", "NUTRICAO_LEITURAS_PATH"],
    ] as const;
    for (const [file, lista] of detalhes) {
      const page = readFileSync(new URL(`../pages/${file}`, import.meta.url), "utf8");
      expect(page).toContain('aria-label="Voltar"');
      expect(page).toContain("arrow_back");
      expect(page).toContain("mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group");
      expect(page).toContain("destinoVoltarNutricaoDetalhe");
      expect(page).toContain(lista);
      expect(page).not.toContain("history.back");
      expect(page).not.toMatch(/className="text-\[12px\] text-gray-600 underline"[^>]*>\s*Voltar/);
    }
    const cocho = readFileSync(new URL("../pages/NutricaoCochoDetalhePage.tsx", import.meta.url), "utf8");
    expect(cocho).toContain("comRetornoNutricao");
  });

  it("cadastros de edição já usam o mesmo Voltar padrão", () => {
    const forms = [
      "NutricaoPlanejamentoFormPage.tsx",
      "NutricaoDietaFormPage.tsx",
      "NutricaoFornecimentoFormPage.tsx",
      "NutricaoBatidaFormPage.tsx",
      "NutricaoCochoFormPage.tsx",
      "NutricaoCochoLeituraFormPage.tsx",
    ];
    for (const file of forms) {
      const page = readFileSync(new URL(`../pages/${file}`, import.meta.url), "utf8");
      expect(page).toContain('aria-label="Voltar"');
      expect(page).toContain("arrow_back");
      expect(page).not.toMatch(/className="text-\[12px\] text-gray-600 underline"[^>]*>\s*Voltar/);
    }
  });

  it("cadastros da Nutrição usam o Voltar padrão acima do cabeçalho", () => {
    const forms = [
      ["NutricaoPlanejamentoFormPage.tsx", "/nutricao/planejamento"],
      ["NutricaoDietaFormPage.tsx", "/nutricao/dietas"],
      ["NutricaoFornecimentoFormPage.tsx", "/nutricao/fornecimentos"],
      ["NutricaoBatidaFormPage.tsx", "/nutricao/batidas"],
      ["NutricaoCochoFormPage.tsx", "/nutricao/cochos"],
      ["NutricaoCochoLeituraFormPage.tsx", "/nutricao/cochos/leituras"],
    ] as const;
    for (const [file, lista] of forms) {
      const page = readFileSync(new URL(`../pages/${file}`, import.meta.url), "utf8");
      expect(page).toContain('aria-label="Voltar"');
      expect(page).toContain("arrow_back");
      expect(page).toContain("mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group");
      expect(page).toContain("listaNutricaoComFazenda");
      expect(page).toContain(lista);
      expect(page).not.toMatch(/className="text-\[12px\] text-gray-600 underline"[^>]*>\s*Voltar/);
    }
    expect(listaNutricaoComFazenda(NUTRICAO_PLANEJAMENTO_PATH, "1")).toBe("/nutricao/planejamento?fazendaId=1");
    expect(listaNutricaoComFazenda(NUTRICAO_DIETAS_PATH, "1")).toBe("/nutricao/dietas?fazendaId=1");
    expect(listaNutricaoComFazenda(NUTRICAO_FORNECIMENTOS_PATH, "1")).toBe("/nutricao/fornecimentos?fazendaId=1");
    expect(listaNutricaoComFazenda(NUTRICAO_BATIDAS_PATH, "1")).toBe("/nutricao/batidas?fazendaId=1");
    expect(listaNutricaoComFazenda(NUTRICAO_COCHOS_PATH, "1")).toBe("/nutricao/cochos?fazendaId=1");
    expect(listaNutricaoComFazenda(NUTRICAO_LEITURAS_PATH, "1")).toBe("/nutricao/cochos/leituras?fazendaId=1");
    expect(listaNutricaoComFazenda(NUTRICAO_COCHOS_PATH, "")).toBe("/nutricao/cochos");
  });

  it("listas mostram o Voltar aprovado só com retorno da Visão Geral", () => {
    const fornecimentos = readFileSync(new URL("../pages/NutricaoFornecimentosListPage.tsx", import.meta.url), "utf8");
    const leituras = readFileSync(new URL("../pages/NutricaoCochoLeiturasListPage.tsx", import.meta.url), "utf8");
    for (const page of [fornecimentos, leituras]) {
      expect(page).toContain("parseRetornoNutricaoVisaoGeral");
      expect(page).toContain('aria-label="Voltar"');
      expect(page).toContain("arrow_back");
      expect(page).toContain("retornoVisaoGeral ?");
    }
  });
});
