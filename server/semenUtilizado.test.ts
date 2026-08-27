import { describe, expect, it } from "vitest";
import { packReproObservacoes, unpackReproObservacoes } from "../shared/reproRegistroMeta";
import { SEMEN_ORIGEM_EXTERNO, SEMEN_ORIGEM_INTERNO } from "../shared/semenEstoque";
import {
  aggregateSemenUtilizado,
  buildSemenUtilizadoGrupoKey,
  buildSemenUtilizadoVisao,
  calcularCustosSemenUtilizado,
  encodeSemenUtilizadoGrupoKey,
  extractSemenUtilizadoUsos,
  formatSemenUtilizadoMatrizLabel,
  parseSemenUtilizadoGrupoKey,
  SEMEN_REPRODUTOR_NAO_INFORMADO_KEY,
  SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL,
  shouldConsumirEstoqueSemenNaInseminacao,
  sortSemenUtilizadoUsosDetalhe,
  sortSemenUtilizadoUsosExport,
  sortSemenUtilizadoGruposExport,
  groupSemenUtilizadoUsosPorDia,
  semenUtilizadoDiasAbertosIniciais,
  sortSemenUtilizadoUsosPorBrinco,
  type SemenUtilizadoAnimalFonte,
  type SemenUtilizadoRegistroFonte,
} from "../shared/semenUtilizado";

const animais: SemenUtilizadoAnimalFonte[] = [
  { id: 15, brinco: "58", nome: "Matriz 58", fazendaId: 1 },
  { id: 14, brinco: "57", nome: "Matriz 57", fazendaId: 1 },
  { id: 16, brinco: "16", nome: "Touro Teste", fazendaId: 1 },
];

function ia(partial: {
  id: number;
  femeaId: number;
  data: string;
  createdAt?: string;
  machoId?: number | null;
  reprodutor?: string;
  partida?: string;
  central?: string;
  custo?: number | null;
  inseminador?: string;
  semenPartidaId?: number;
  resultado?: string;
}): SemenUtilizadoRegistroFonte {
  return {
    id: partial.id,
    tipo: "Inseminação",
    femeaId: partial.femeaId,
    machoId: partial.machoId ?? null,
    dataCobertura: partial.data,
    createdAt: partial.createdAt ?? `${partial.data}T12:00:00.000Z`,
    resultado: partial.resultado ?? "Realizado",
    observacoes: packReproObservacoes(null, partial.reprodutor, null, null, null, {
      partidaSemen: partial.partida,
      centralOrigem: partial.central,
      custoDoseSemen: partial.custo ?? undefined,
      inseminador: partial.inseminador,
      semenPartidaId: partial.semenPartidaId,
    }),
  };
}

describe("shouldConsumirEstoqueSemenNaInseminacao", () => {
  it("só consome quando há partida de estoque selecionada", () => {
    expect(shouldConsumirEstoqueSemenNaInseminacao(undefined)).toBe(false);
    expect(shouldConsumirEstoqueSemenNaInseminacao(null)).toBe(false);
    expect(shouldConsumirEstoqueSemenNaInseminacao(0)).toBe(false);
    expect(shouldConsumirEstoqueSemenNaInseminacao(4)).toBe(true);
  });
});

describe("calcularCustosSemenUtilizado", () => {
  it("teste D — 90 + 90 + 120 = total 300 e média 100", () => {
    const r = calcularCustosSemenUtilizado([90, 90, 120]);
    expect(r.doses).toBe(3);
    expect(r.custoTotal).toBe(300);
    expect(r.custoMedio).toBe(100);
    expect(r.usosComCusto).toBe(3);
    expect(r.usosSemCusto).toBe(0);
  });

  it("teste E — custo ausente não entra na média e não vira zero", () => {
    const r = calcularCustosSemenUtilizado([90, 90, null]);
    expect(r.doses).toBe(3);
    expect(r.custoTotal).toBe(180);
    expect(r.custoMedio).toBe(90);
    expect(r.usosComCusto).toBe(2);
    expect(r.usosSemCusto).toBe(1);
  });

  it("zero não conta como custo conhecido", () => {
    const r = calcularCustosSemenUtilizado([90, 0, undefined]);
    expect(r.doses).toBe(3);
    expect(r.custoTotal).toBe(90);
    expect(r.custoMedio).toBe(90);
    expect(r.usosSemCusto).toBe(2);
  });

  it("teste A — 1 utilização sem custo: média e total ausentes", () => {
    const r = calcularCustosSemenUtilizado([null]);
    expect(r.doses).toBe(1);
    expect(r.usosComCusto).toBe(0);
    expect(r.usosSemCusto).toBe(1);
    expect(r.custoMedio).toBeNull();
    expect(r.custoTotal).toBeNull();
  });

  it("teste B — 5 doses, 4 com custo 100: total 400 e média 100", () => {
    const r = calcularCustosSemenUtilizado([100, 100, 100, 100, null]);
    expect(r.doses).toBe(5);
    expect(r.usosComCusto).toBe(4);
    expect(r.usosSemCusto).toBe(1);
    expect(r.custoTotal).toBe(400);
    expect(r.custoMedio).toBe(100);
  });

  it("teste C — centavos: total 339,99 e média exibida 85,00", () => {
    const r = calcularCustosSemenUtilizado([84.99, 85, 85, 85]);
    expect(r.doses).toBe(4);
    expect(r.custoTotal).toBe(339.99);
    expect(r.custoMedio).toBe(85);
    expect(r.custoTotal).not.toBe(340);
    expect(Number((r.custoMedio! * r.doses).toFixed(2))).not.toBe(r.custoTotal);
  });

  it("teste D — 3 utilizações sem custo: média e total ausentes", () => {
    const r = calcularCustosSemenUtilizado([null, undefined, 0]);
    expect(r.doses).toBe(3);
    expect(r.usosComCusto).toBe(0);
    expect(r.usosSemCusto).toBe(3);
    expect(r.custoMedio).toBeNull();
    expect(r.custoTotal).toBeNull();
  });
});

describe("Sêmen utilizado — agregação", () => {
  it("teste A — IA sem estoque aparece agrupada por reprodutor + partida", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({
          id: 1,
          femeaId: 15,
          data: "2026-08-26",
          reprodutor: "GSC-7117",
          partida: "P-01",
          central: "Alta",
          custo: 90,
          inseminador: "João",
        }),
      ],
      animais,
    );
    expect(usos).toHaveLength(1);
    expect(usos[0]?.reprodutorDisplay).toBe("GSC-7117");
    expect(usos[0]?.partida).toBe("P-01");
    expect(usos[0]?.central).toBe("Alta");
    expect(usos[0]?.custoDose).toBe(90);
    expect(usos[0]?.machoId).toBeNull();
    expect(usos[0]?.reprodutorKey.startsWith("e:")).toBe(true);
    const grupos = aggregateSemenUtilizado(usos);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.dosesUtilizadas).toBe(1);
    expect(grupos[0]?.matrizes).toBe(1);
    expect(grupos[0]?.reprodutorDisplay).toBe("GSC-7117");
    expect(grupos[0]?.reprodutorDisplay).not.toContain("P-01");
    expect(grupos[0]?.partida).toBe("P-01");
  });

  it("teste B — IA com semenPartidaId aparece da mesma forma", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({
          id: 2,
          femeaId: 15,
          data: "2026-08-26",
          reprodutor: "GSC-7117",
          partida: "P-10FAZ",
          central: "Alta",
          custo: 90,
          semenPartidaId: 9,
        }),
      ],
      animais,
      [{ id: 9, centralOrigem: "Alta" }],
    );
    expect(usos[0]?.partida).toBe("P-10FAZ");
    expect(usos[0]?.reprodutorDisplay).toBe("GSC-7117");
    expect(usos[0]?.reprodutorDisplay).not.toContain("P-10FAZ");
  });

  it("enriquece central pela partida quando o snapshot da IA não tem central", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({
          id: 3,
          femeaId: 15,
          data: "2026-08-20",
          reprodutor: "GSC-7117",
          partida: "P-10FAZ",
          semenPartidaId: 9,
        }),
      ],
      animais,
      [{ id: 9, centralOrigem: "GE" }],
    );
    expect(usos[0]?.central).toBe("GE");
  });

  it("não mostra o lote no lugar do reprodutor quando a IA antiga gravou P-10FAZ em r", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({
          id: 32,
          femeaId: 15,
          data: "2026-08-26",
          reprodutor: "P-10FAZ",
          partida: "P-10FAZ",
          custo: 90,
          semenPartidaId: 1,
        }),
        ia({
          id: 40,
          femeaId: 14,
          data: "2026-08-25",
          reprodutor: "GSC-7117",
          partida: "P-10FAZ",
          custo: 90,
        }),
      ],
      animais,
      { fazendaId: 1 },
      [
        {
          id: 1,
          centralOrigem: "Alta",
          reprodutorTexto: "GSC-7117",
          reprodutorKey: "e:gsc-7117",
          origemReprodutor: "externo",
        },
      ],
    );
    expect(visao.grupos).toHaveLength(1);
    expect(visao.grupos[0]?.reprodutorDisplay).toBe("GSC-7117");
    expect(visao.grupos[0]?.partida).toBe("P-10FAZ");
    expect(visao.grupos[0]?.dosesUtilizadas).toBe(2);
    expect(visao.grupos[0]?.reprodutorDisplay).not.toBe("P-10FAZ");
    expect(visao.grupos[0]?.reprodutorDisplay).not.toContain("P-10FAZ");
  });

  it("teste E — reprodutor não duplica a partida", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({
          id: 1,
          femeaId: 15,
          data: "2026-08-26",
          reprodutor: "GSC-7117",
          partida: "P-10FAZ",
          custo: 90,
        }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.grupos[0]?.reprodutorDisplay).toBe("GSC-7117");
    expect(visao.grupos[0]?.partida).toBe("P-10FAZ");
    expect(visao.grupos[0]?.reprodutorDisplay).not.toMatch(/P-10FAZ/i);
  });

  it("teste F — Central vem do snapshot da IA; ausente permanece nula", () => {
    const comCentral = buildSemenUtilizadoVisao(
      [
        ia({
          id: 1,
          femeaId: 15,
          data: "2026-08-26",
          reprodutor: "GSC-7117",
          partida: "P-01",
          central: "Alta",
        }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(comCentral.grupos[0]?.central).toBe("Alta");

    const semCentral = buildSemenUtilizadoVisao(
      [
        ia({
          id: 2,
          femeaId: 15,
          data: "2026-08-26",
          reprodutor: "16",
          partida: "",
        }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(semCentral.grupos[0]?.central).toBeNull();
    expect(semCentral.grupos[0]?.custoMedioUso).toBeNull();
    expect(semCentral.grupos[0]?.custoTotalUtilizado).toBeNull();
  });

  it("teste C — 3 doses e 2 matrizes distintas", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-20", reprodutor: "GSC-7117", partida: "P-01", custo: 90 }),
        ia({ id: 2, femeaId: 14, data: "2026-08-25", reprodutor: "GSC-7117", partida: "P-01", custo: 90 }),
        ia({ id: 3, femeaId: 15, data: "2026-08-26", reprodutor: "GSC-7117", partida: "P-01", custo: 120 }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.grupos).toHaveLength(1);
    expect(visao.grupos[0]?.dosesUtilizadas).toBe(3);
    expect(visao.grupos[0]?.matrizes).toBe(2);
    expect(visao.grupos[0]?.custoTotalUtilizado).toBe(300);
    expect(visao.grupos[0]?.custoMedioUso).toBe(100);
    expect(visao.grupos[0]?.ultimoUso).toBe("2026-08-26");
  });

  it("teste F — ordena pelo último uso mais recente", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({ id: 10, femeaId: 15, data: "2026-08-20", reprodutor: "AAA", partida: "P-A" }),
        ia({ id: 11, femeaId: 15, data: "2026-08-26", reprodutor: "BBB", partida: "P-B" }),
        ia({ id: 12, femeaId: 15, data: "2026-08-25", reprodutor: "CCC", partida: "P-C" }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.grupos.map(g => g.reprodutorDisplay)).toEqual(["BBB", "CCC", "AAA"]);
  });

  it("não mistura partidas diferentes do mesmo reprodutor", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-26", reprodutor: "GSC-7117", partida: "P-10FAZ" }),
        ia({ id: 2, femeaId: 15, data: "2026-08-26", reprodutor: "GSC-7117", partida: "" }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.grupos).toHaveLength(2);
    const partidas = visao.grupos.map(g => g.partida).sort();
    expect(partidas).toEqual(["P-10FAZ", "Sem lote"]);
  });

  it("teste I — período recalcula doses, matrizes e custos", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-10", reprodutor: "GSC-7117", partida: "P-01", custo: 90 }),
        ia({ id: 2, femeaId: 14, data: "2026-08-20", reprodutor: "GSC-7117", partida: "P-01", custo: 90 }),
        ia({ id: 3, femeaId: 15, data: "2026-08-26", reprodutor: "GSC-7117", partida: "P-01", custo: 120 }),
      ],
      animais,
      { fazendaId: 1, dataIni: "2026-08-01", dataFim: "2026-08-15" },
    );
    expect(visao.grupos[0]?.dosesUtilizadas).toBe(1);
    expect(visao.grupos[0]?.matrizes).toBe(1);
    expect(visao.grupos[0]?.custoTotalUtilizado).toBe(90);
    expect(visao.custoTotalFiltrado).toBe(90);
  });

  it("custo total filtrado ignora grupos sem snapshot e não soma zero fictício", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-26", reprodutor: "GSC-7117", partida: "P-01", custo: 90 }),
        ia({ id: 2, femeaId: 14, data: "2026-08-26", reprodutor: "16", partida: "" }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.grupos).toHaveLength(2);
    expect(visao.custoTotalFiltrado).toBe(90);
    const semCusto = visao.grupos.find(g => g.reprodutorDisplay === "16");
    expect(semCusto?.custoTotalUtilizado).toBeNull();
    expect(semCusto?.custoMedioUso).toBeNull();
  });

  it("todas as linhas sem custo: total filtrado permanece nulo", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-26", reprodutor: "16", partida: "" }),
        ia({ id: 2, femeaId: 14, data: "2026-08-25", reprodutor: "16", partida: "" }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.custoTotalFiltrado).toBeNull();
    expect(visao.grupos[0]?.dosesUtilizadas).toBe(2);
    expect(visao.grupos[0]?.custoTotalUtilizado).toBeNull();
  });

  it("reprodutor interno usa machoId e mostra brinco humano", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({
          id: 1,
          femeaId: 15,
          data: "2026-08-26",
          machoId: 16,
          partida: "P-INT",
          custo: 50,
        }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.grupos[0]?.origem).toBe(SEMEN_ORIGEM_INTERNO);
    expect(visao.grupos[0]?.machoId).toBe(16);
    expect(visao.grupos[0]?.reprodutorDisplay).toBe("16");
    expect(visao.grupos[0]?.reprodutorKey).toBe("m:16");
    expect(visao.grupos[0]?.reprodutorDisplay).not.toContain("#");
    expect(visao.grupos[0]?.key.startsWith(`${SEMEN_ORIGEM_INTERNO}|m:16|`)).toBe(true);
  });

  it("busca encontra reprodutor, partida e central", () => {
    const registros = [
      ia({
        id: 1,
        femeaId: 15,
        data: "2026-08-26",
        reprodutor: "GSC-7117",
        partida: "P-01",
        central: "Alta",
      }),
    ];
    expect(buildSemenUtilizadoVisao(registros, animais, { fazendaId: 1, search: "gsc" }).grupos).toHaveLength(1);
    expect(buildSemenUtilizadoVisao(registros, animais, { fazendaId: 1, search: "p-01" }).grupos).toHaveLength(1);
    expect(buildSemenUtilizadoVisao(registros, animais, { fazendaId: 1, search: "alta" }).grupos).toHaveLength(1);
    expect(buildSemenUtilizadoVisao(registros, animais, { fazendaId: 1, search: "xyz" }).grupos).toHaveLength(0);
  });

  it("select de reprodutor lista interno e externo, sem repetir partida", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-26", reprodutor: "GSC-7117", partida: "P-10FAZ" }),
        ia({ id: 2, femeaId: 14, data: "2026-08-25", reprodutor: "GSC-7117", partida: "" }),
        ia({ id: 3, femeaId: 15, data: "2026-08-24", machoId: 16, partida: "P-INT" }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.grupos).toHaveLength(3);
    expect(visao.reprodutoresOpcoes.map(o => o.label)).toEqual(["16", "GSC-7117"]);
    expect(visao.reprodutoresOpcoes.map(o => o.origem)).toEqual([
      SEMEN_ORIGEM_INTERNO,
      SEMEN_ORIGEM_EXTERNO,
    ]);
    expect(visao.reprodutoresOpcoes.some(o => /P-10FAZ|Sem lote|P-INT/i.test(o.label))).toBe(false);
    expect(visao.reprodutoresOpcoes.every(o => !o.label.includes("#"))).toBe(true);
  });

  it("não coloca partida no select de reprodutor", () => {
    const visao = buildSemenUtilizadoVisao(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-26", reprodutor: "P-10FAZ", partida: "P-10FAZ" }),
        ia({ id: 2, femeaId: 14, data: "2026-08-25", reprodutor: "GSC-7117", partida: "P-10FAZ" }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.reprodutoresOpcoes.map(o => o.label)).toEqual(["GSC-7117"]);
    expect(visao.reprodutoresOpcoes.some(o => o.label === "P-10FAZ")).toBe(false);
  });

  it("teste A/E — legado r=P-10FAZ não vira reprodutor nem chave e:p-10faz", () => {
    const legado: SemenUtilizadoRegistroFonte = {
      id: 32,
      tipo: "Inseminação",
      femeaId: 15,
      machoId: null,
      dataCobertura: "2026-08-26",
      createdAt: "2026-08-26T12:00:00.000Z",
      resultado: "Realizado",
      observacoes: `\n__fd_repro__${JSON.stringify({
        r: "P-10FAZ",
        ps: "P-10FAZ",
        spi: 1,
        cds: 83.33,
      })}__end__`,
    };
    const visao = buildSemenUtilizadoVisao([legado], animais, { fazendaId: 1 });
    expect(visao.grupos).toHaveLength(1);
    expect(visao.grupos[0]?.reprodutorDisplay).toBe(SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL);
    expect(visao.grupos[0]?.reprodutorDisplay).not.toBe("P-10FAZ");
    expect(visao.grupos[0]?.partida).toBe("P-10FAZ");
    expect(visao.grupos[0]?.reprodutorKey).toBe(SEMEN_REPRODUTOR_NAO_INFORMADO_KEY);
    expect(visao.grupos[0]?.reprodutorKey).not.toBe("e:p-10faz");
    expect(visao.grupos[0]?.dosesUtilizadas).toBe(1);
    expect(visao.grupos[0]?.custoTotalUtilizado).toBe(83.33);
    expect(visao.reprodutoresOpcoes.some(o => o.label === "P-10FAZ")).toBe(false);
    expect(visao.reprodutoresOpcoes.some(o => o.label === SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL)).toBe(
      false,
    );
  });

  it("teste F — não mistura legado sem reprodutor com 16 + P-10FAZ", () => {
    const legado: SemenUtilizadoRegistroFonte = {
      id: 32,
      tipo: "Inseminação",
      femeaId: 15,
      machoId: null,
      dataCobertura: "2026-08-26",
      createdAt: "2026-08-26T12:00:00.000Z",
      resultado: "Realizado",
      observacoes: `\n__fd_repro__${JSON.stringify({ r: "P-10FAZ", ps: "P-10FAZ" })}__end__`,
    };
    const visao = buildSemenUtilizadoVisao(
      [
        legado,
        ia({ id: 27, femeaId: 14, data: "2026-08-25", machoId: 16, partida: "P-10FAZ", custo: 150 }),
      ],
      animais,
      { fazendaId: 1 },
    );
    expect(visao.grupos).toHaveLength(2);
    const interno = visao.grupos.find(g => g.reprodutorDisplay === "16");
    const desconhecido = visao.grupos.find(g => g.reprodutorDisplay === SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL);
    expect(interno?.partida).toBe("P-10FAZ");
    expect(interno?.dosesUtilizadas).toBe(1);
    expect(interno?.custoTotalUtilizado).toBe(150);
    expect(desconhecido?.partida).toBe("P-10FAZ");
    expect(desconhecido?.dosesUtilizadas).toBe(1);
  });

  it("teste H — corrigir identificador não altera custos do agrupamento válido", () => {
    const legado: SemenUtilizadoRegistroFonte = {
      id: 32,
      tipo: "Inseminação",
      femeaId: 14,
      machoId: null,
      dataCobertura: "2026-08-26",
      createdAt: "2026-08-26T12:00:00.000Z",
      resultado: "Realizado",
      observacoes: `\n__fd_repro__${JSON.stringify({
        r: "P-10FAZ",
        ps: "P-10FAZ",
        cds: 83.33,
      })}__end__`,
    };
    const visao = buildSemenUtilizadoVisao(
      [
        ia({
          id: 40,
          femeaId: 15,
          data: "2026-08-26",
          reprodutor: "GSC-7117",
          partida: "P-10FAZ",
          custo: 90,
        }),
        ia({
          id: 41,
          femeaId: 14,
          data: "2026-08-25",
          reprodutor: "GSC-7117",
          partida: "P-10FAZ",
          custo: 90,
        }),
        legado,
      ],
      animais,
      { fazendaId: 1 },
    );
    const gsc = visao.grupos.find(g => g.reprodutorDisplay === "GSC-7117");
    expect(gsc?.dosesUtilizadas).toBe(2);
    expect(gsc?.matrizes).toBe(2);
    expect(gsc?.custoTotalUtilizado).toBe(180);
    expect(gsc?.custoMedioUso).toBe(90);
    expect(gsc?.partida).toBe("P-10FAZ");
  });

  it("opções do select não encolhem com período ou filtro de reprodutor", () => {
    const registros = [
      ia({ id: 1, femeaId: 15, data: "2026-08-10", reprodutor: "GSC-7117", partida: "P-01" }),
      ia({ id: 2, femeaId: 15, data: "2026-08-26", machoId: 16, partida: "P-INT" }),
    ];
    const filtrada = buildSemenUtilizadoVisao(registros, animais, {
      fazendaId: 1,
      dataIni: "2026-08-01",
      dataFim: "2026-08-15",
    });
    expect(filtrada.grupos).toHaveLength(1);
    expect(filtrada.reprodutoresOpcoes.map(o => o.label).sort()).toEqual(["16", "GSC-7117"]);

    const soExterno = buildSemenUtilizadoVisao(registros, animais, {
      fazendaId: 1,
      reprodutor: filtrada.reprodutoresOpcoes.find(o => o.origem === SEMEN_ORIGEM_EXTERNO)?.value,
    });
    expect(soExterno.grupos).toHaveLength(1);
    expect(soExterno.grupos[0]?.reprodutorDisplay).toBe("GSC-7117");
    expect(soExterno.reprodutoresOpcoes).toHaveLength(2);
  });

  it("ignora eventos que não são Inseminação", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        {
          id: 99,
          tipo: "Cobertura",
          femeaId: 15,
          machoId: 16,
          dataCobertura: "2026-08-26",
          observacoes: null,
        },
      ],
      animais,
    );
    expect(usos).toHaveLength(0);
  });
});

describe("chave de agrupamento", () => {
  it("encode/decode redondo", () => {
    const key = buildSemenUtilizadoGrupoKey({
      origem: SEMEN_ORIGEM_EXTERNO,
      reprodutorKey: "e:gsc-7117",
      partida: "P-01",
    });
    const encoded = encodeSemenUtilizadoGrupoKey(key);
    expect(parseSemenUtilizadoGrupoKey(encoded)).toEqual({
      origem: SEMEN_ORIGEM_EXTERNO,
      reprodutorKey: "e:gsc-7117",
      partida: "P-01",
    });
  });
});

describe("formatSemenUtilizadoMatrizLabel", () => {
  it("mostra brinco humano e nunca Animal #id", () => {
    expect(formatSemenUtilizadoMatrizLabel("58")).toBe("Matriz 58");
    expect(formatSemenUtilizadoMatrizLabel("—")).toBe("Matriz");
    expect(formatSemenUtilizadoMatrizLabel("58")).not.toContain("#15");
    expect(formatSemenUtilizadoMatrizLabel("58")).not.toContain("ID 15");
  });
});

describe("ordem do histórico de utilizações", () => {
  const animaisCom27: SemenUtilizadoAnimalFonte[] = [
    ...animais,
    { id: 99, brinco: "27", nome: "Vaca 27", fazendaId: 1 },
  ];

  it("tela: mais recente primeiro; mesma data usa createdAt e id DESC", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({ id: 40, femeaId: 14, data: "2026-08-24", createdAt: "2026-08-24T12:00:00.000Z" }),
        ia({ id: 47, femeaId: 99, data: "2026-08-26", createdAt: "2026-08-26T15:00:00.000Z", custo: 200 }),
        ia({ id: 48, femeaId: 99, data: "2026-08-26", createdAt: "2026-08-26T16:00:00.000Z", custo: 138.89 }),
        ia({ id: 50, femeaId: 15, data: "2026-08-26", createdAt: "2026-08-26T18:00:00.000Z" }),
      ],
      animaisCom27,
    );
    const tela = sortSemenUtilizadoUsosDetalhe(usos);
    expect(tela.map(u => u.registroId)).toEqual([50, 48, 47, 40]);
    expect(tela[0]?.dataIso >= tela[tela.length - 1]?.dataIso).toBe(true);
  });

  it("Excel: mais antigo primeiro; mesma matriz permanece em linhas distintas", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({ id: 48, femeaId: 99, data: "2026-08-26", createdAt: "2026-08-26T16:00:00.000Z", custo: 138.89 }),
        ia({ id: 47, femeaId: 99, data: "2026-08-26", createdAt: "2026-08-26T15:00:00.000Z", custo: 200 }),
        ia({ id: 40, femeaId: 14, data: "2026-08-24" }),
      ],
      animaisCom27,
    );
    const excel = sortSemenUtilizadoUsosExport(usos);
    expect(excel.map(u => u.registroId)).toEqual([40, 47, 48]);
    expect(excel.filter(u => u.matrizBrinco === "27")).toHaveLength(2);
    expect(excel.filter(u => u.matrizBrinco === "27").map(u => u.custoDose)).toEqual([200, 138.89]);
  });

  it("listagem: tela DESC por último uso; exportação ASC sem mudar a tela", () => {
    const visao = aggregateSemenUtilizado(
      extractSemenUtilizadoUsos(
        [
          ia({ id: 10, femeaId: 15, data: "2026-08-27", reprodutor: "Não informado", partida: "P-10FAZ" }),
          ia({ id: 8, femeaId: 15, data: "2026-08-24", reprodutor: "KREM-663", partida: "Sem lote" }),
          ia({ id: 9, femeaId: 15, data: "2026-08-25", reprodutor: "16", partida: "Teste" }),
        ],
        animais,
      ),
    );
    expect(visao.map(g => g.ultimoUso)).toEqual(["2026-08-27", "2026-08-25", "2026-08-24"]);
    expect(sortSemenUtilizadoGruposExport(visao).map(g => g.ultimoUso)).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-27",
    ]);
    expect(visao.map(g => g.ultimoUso)).toEqual(["2026-08-27", "2026-08-25", "2026-08-24"]);
  });

  it("agrupa por dia sem juntar duas IAs da mesma matriz", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({ id: 40, femeaId: 14, data: "2026-08-24" }),
        ia({ id: 47, femeaId: 99, data: "2026-08-26", createdAt: "2026-08-26T15:00:00.000Z", custo: 200 }),
        ia({ id: 48, femeaId: 99, data: "2026-08-26", createdAt: "2026-08-26T16:00:00.000Z", custo: 138.89 }),
        ia({ id: 50, femeaId: 15, data: "2026-08-26", createdAt: "2026-08-26T18:00:00.000Z", custo: 90 }),
      ],
      animaisCom27,
    );
    const dias = groupSemenUtilizadoUsosPorDia(usos);
    expect(dias.map(d => d.dataIso)).toEqual(["2026-08-26", "2026-08-24"]);
    expect(dias[0]?.utilizacoes).toBe(3);
    expect(dias[0]?.matrizes).toBe(2);
    expect(dias[0]?.custoTotal).toBe(428.89);
    expect(dias[0]?.usos.filter(u => u.matrizBrinco === "27")).toHaveLength(2);
    expect(dias[0]?.usos.map(u => u.matrizBrinco)).toEqual(["27", "27", "58"]);
    expect(dias[1]?.utilizacoes).toBe(1);
    expect(dias[1]?.custoTotal).toBeNull();
  });

  it("teste A/B — 4 IAs no mesmo dia: 3 matrizes e custo 339,99", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({ id: 41, femeaId: 15, data: "2026-08-26", createdAt: "2026-08-26T18:00:00.000Z", custo: 90 }),
        ia({ id: 42, femeaId: 15, data: "2026-08-26", createdAt: "2026-08-26T17:00:00.000Z", custo: 83.33 }),
        ia({ id: 43, femeaId: 14, data: "2026-08-26", createdAt: "2026-08-26T16:00:00.000Z", custo: 83.33 }),
        ia({ id: 44, femeaId: 99, data: "2026-08-26", createdAt: "2026-08-26T15:00:00.000Z", custo: 83.33 }),
      ],
      animaisCom27,
    );
    const dias = groupSemenUtilizadoUsosPorDia(usos);
    expect(dias).toHaveLength(1);
    expect(dias[0]?.utilizacoes).toBe(4);
    expect(dias[0]?.matrizes).toBe(3);
    expect(dias[0]?.custoTotal).toBe(339.99);
    expect(dias[0]?.usos.filter(u => u.matrizBrinco === "58")).toHaveLength(2);
    expect(dias[0]?.usos.map(u => u.matrizBrinco)).toEqual(["27", "57", "58", "58"]);
    expect(dias[0]?.usos.map(u => u.registroId)).toEqual([44, 43, 42, 41]);
  });

  it("teste C — IA sem custo conta na utilização e não na soma", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-26", custo: 90 }),
        ia({ id: 2, femeaId: 14, data: "2026-08-26", custo: 83.33 }),
        ia({ id: 3, femeaId: 99, data: "2026-08-26", custo: 83.33 }),
        ia({ id: 4, femeaId: 15, data: "2026-08-26" }),
      ],
      animaisCom27,
    );
    const dia = groupSemenUtilizadoUsosPorDia(usos)[0];
    expect(dia?.utilizacoes).toBe(4);
    expect(dia?.usosComCusto).toBe(3);
    expect(dia?.custoTotal).toBe(256.66);
    expect(dia?.custoTotal).not.toBe(0);
  });

  it("teste D — dia sem custo conhecido mostra total nulo", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-24" }),
        ia({ id: 2, femeaId: 14, data: "2026-08-24" }),
        ia({ id: 3, femeaId: 99, data: "2026-08-24" }),
      ],
      animaisCom27,
    );
    const dia = groupSemenUtilizadoUsosPorDia(usos)[0];
    expect(dia?.utilizacoes).toBe(3);
    expect(dia?.custoTotal).toBeNull();
  });

  it("agrupa pela data operacional da IA, não pelo createdAt", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({
          id: 1,
          femeaId: 15,
          data: "2026-08-24",
          createdAt: "2026-08-26T22:00:00.000Z",
          custo: 90,
        }),
        ia({
          id: 2,
          femeaId: 14,
          data: "2026-08-26",
          createdAt: "2026-08-26T10:00:00.000Z",
          custo: 83.33,
        }),
      ],
      animaisCom27,
    );
    const dias = groupSemenUtilizadoUsosPorDia(usos);
    expect(dias.map(d => d.dataIso)).toEqual(["2026-08-26", "2026-08-24"]);
    expect(dias[0]?.utilizacoes).toBe(1);
    expect(dias[1]?.utilizacoes).toBe(1);
    expect(dias[1]?.usos[0]?.registroId).toBe(1);
  });

  it("teste E/F — dois dias DESC e só o mais recente abre por padrão", () => {
    const usos = extractSemenUtilizadoUsos(
      [
        ia({ id: 1, femeaId: 15, data: "2026-08-26", custo: 90 }),
        ia({ id: 2, femeaId: 14, data: "2026-08-24" }),
      ],
      animaisCom27,
    );
    const dias = groupSemenUtilizadoUsosPorDia(usos);
    expect(dias.map(d => d.dataIso)).toEqual(["2026-08-26", "2026-08-24"]);
    expect(semenUtilizadoDiasAbertosIniciais(dias)).toEqual(["2026-08-26"]);
  });

  it("dentro do dia ordena pelo número do brinco crescente, sem juntar IAs", () => {
    const animaisCom8: SemenUtilizadoAnimalFonte[] = [
      ...animaisCom27,
      { id: 8, brinco: "8", nome: "Matriz 8", fazendaId: 1 },
    ];
    const usos = extractSemenUtilizadoUsos(
      [
        ia({ id: 3, femeaId: 15, data: "2026-08-26", createdAt: "2026-08-26T18:00:00.000Z" }),
        ia({ id: 1, femeaId: 8, data: "2026-08-26", createdAt: "2026-08-26T10:00:00.000Z" }),
        ia({ id: 2, femeaId: 99, data: "2026-08-26", createdAt: "2026-08-26T12:00:00.000Z" }),
        ia({ id: 4, femeaId: 15, data: "2026-08-26", createdAt: "2026-08-26T11:00:00.000Z" }),
      ],
      animaisCom8,
    );
    const ordenados = sortSemenUtilizadoUsosPorBrinco(usos);
    expect(ordenados.map(u => u.matrizBrinco)).toEqual(["8", "27", "58", "58"]);
    expect(ordenados.filter(u => u.matrizBrinco === "58")).toHaveLength(2);
    expect(ordenados.map(u => u.registroId)).toEqual([1, 2, 4, 3]);
  });
});

describe("metadados de IA", () => {
  it("pack/unpack preserva centralOrigem sem migration", () => {
    const packed = packReproObservacoes(null, "GSC-7117", null, null, null, {
      partidaSemen: "P-01",
      centralOrigem: "Alta",
      custoDoseSemen: 90,
    });
    const meta = unpackReproObservacoes(packed);
    expect(meta.centralOrigem).toBe("Alta");
    expect(meta.custoDoseSemen).toBe(90);
    expect(meta.partidaSemen).toBe("P-01");
  });

  it("não empacota custo zero", () => {
    const packed = packReproObservacoes(null, "GSC-7117", null, null, null, {
      custoDoseSemen: 0,
    });
    const meta = unpackReproObservacoes(packed);
    expect(meta.custoDoseSemen).toBeNull();
  });

  it("não empacota partida como nome de reprodutor", () => {
    const packed = packReproObservacoes(null, "P-10FAZ", null, null, null, {
      partidaSemen: "P-10FAZ",
    });
    const meta = unpackReproObservacoes(packed);
    expect(meta.reprodutorSemen).toBeNull();
    expect(meta.partidaSemen).toBe("P-10FAZ");
  });
});
