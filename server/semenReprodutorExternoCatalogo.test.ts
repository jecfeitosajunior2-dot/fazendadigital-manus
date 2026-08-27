import { describe, expect, it } from "vitest";
import { SEMEN_ORIGEM_EXTERNO, SEMEN_ORIGEM_INTERNO } from "../shared/semenEstoque";
import type { SemenUtilizadoUso } from "../shared/semenUtilizado";
import {
  MSG_SEMEN_CATALOGO_JA_CADASTRADO,
  canChangeSemenReprodutorExternoTexto,
  filterSemenReprodutorExternoCatalogoSugestao,
  formatSemenReprodutorExternoCatalogoSubtitulo,
  historicoReprodutoresExternosDeUsos,
  mergeSemenReprodutorExternoCatalogo,
  resolveSemenReprodutorExternoCreate,
  semenReprodutorExternoCatalogoKeyFromTexto,
  sortSemenReprodutorExternoCatalogo,
  type SemenReprodutorExternoCadastro,
} from "../shared/semenReprodutorExternoCatalogo";

function cadastro(
  partial: Partial<SemenReprodutorExternoCadastro> & { reprodutorTexto: string },
): SemenReprodutorExternoCadastro {
  const key = semenReprodutorExternoCatalogoKeyFromTexto(partial.reprodutorTexto)!;
  return {
    id: partial.id ?? 1,
    userId: 1,
    fazendaId: 1,
    reprodutorKey: partial.reprodutorKey ?? key,
    reprodutorTexto: partial.reprodutorTexto,
    centralPadrao: partial.centralPadrao ?? null,
    observacoes: partial.observacoes ?? null,
    ativo: partial.ativo ?? true,
    createdAt: "2026-08-27T12:00:00.000Z",
    updatedAt: "2026-08-27T12:00:00.000Z",
  };
}

function uso(partial: Partial<SemenUtilizadoUso> & { reprodutorDisplay: string; dataIso: string }): SemenUtilizadoUso {
  return {
    registroId: partial.registroId ?? 1,
    femeaId: 15,
    matrizBrinco: "58",
    dataIso: partial.dataIso,
    createdAtIso: `${partial.dataIso}T12:00:00.000Z`,
    inseminador: null,
    custoDose: 90,
    resultado: "Realizado",
    origem: partial.origem ?? SEMEN_ORIGEM_EXTERNO,
    machoId: null,
    reprodutorKey: partial.reprodutorKey ?? semenReprodutorExternoCatalogoKeyFromTexto(partial.reprodutorDisplay)!,
    reprodutorDisplay: partial.reprodutorDisplay,
    partida: partial.partida ?? "A25",
    central: partial.central ?? "Alta",
    fazendaId: 1,
  };
}

describe("chave normalizada do catálogo externo", () => {
  it("usa a regra atual: trim + lowercase, preserva hífen", () => {
    expect(semenReprodutorExternoCatalogoKeyFromTexto("GSC-7117")).toBe("e:gsc-7117");
    expect(semenReprodutorExternoCatalogoKeyFromTexto("gsc-7117")).toBe("e:gsc-7117");
    expect(semenReprodutorExternoCatalogoKeyFromTexto("  GSC-7117  ")).toBe("e:gsc-7117");
  });

  it("GSC 7117 permanece identidade distinta da atual (espaço ≠ hífen)", () => {
    expect(semenReprodutorExternoCatalogoKeyFromTexto("GSC 7117")).toBe("e:gsc 7117");
    expect(semenReprodutorExternoCatalogoKeyFromTexto("GSC 7117")).not.toBe(
      semenReprodutorExternoCatalogoKeyFromTexto("GSC-7117"),
    );
  });
});

describe("cadastro e duplicidade", () => {
  it("teste A — cadastra ABS 1234 com central Alta", () => {
    const result = resolveSemenReprodutorExternoCreate(
      { reprodutorTexto: "ABS 1234", centralPadrao: "Alta" },
      [],
    );
    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.item.reprodutorTexto).toBe("ABS 1234");
    expect(result.item.reprodutorKey).toBe("e:abs 1234");
    expect(result.item.centralPadrao).toBe("Alta");
    expect(result.item.ativo).toBe(true);
  });

  it("teste B — não duplica ABS 1234 e oferece o existente", () => {
    const existente = mergeSemenReprodutorExternoCatalogo(
      [cadastro({ id: 9, reprodutorTexto: "ABS 1234", centralPadrao: "Alta" })],
      [],
    );
    const result = resolveSemenReprodutorExternoCreate({ reprodutorTexto: "abs 1234" }, existente);
    expect(result.status).toBe("already_exists");
    if (result.status !== "already_exists") return;
    expect(result.message).toBe(MSG_SEMEN_CATALOGO_JA_CADASTRADO);
    expect(result.message).toContain("Este sêmen/reprodutor já está cadastrado");
    expect(result.message).toContain("Inseminação");
    expect(result.item.id).toBe(9);
    expect(result.item.reprodutorTexto).toBe("ABS 1234");
  });

  it("histórico GSC-7117 conta como já cadastrado", () => {
    const catalogo = mergeSemenReprodutorExternoCatalogo([], [
      { reprodutorKey: "e:gsc-7117", reprodutorTexto: "GSC-7117", centralOrigem: "Alta" },
    ]);
    const result = resolveSemenReprodutorExternoCreate({ reprodutorTexto: "GSC-7117" }, catalogo);
    expect(result.status).toBe("already_exists");
    if (result.status !== "already_exists") return;
    expect(result.item.origem).toBe("historico");
  });
});

describe("merge e autocomplete", () => {
  it("não mistura partida na identidade do catálogo", () => {
    const usos = [
      uso({ reprodutorDisplay: "GSC-7117", dataIso: "2026-08-26", partida: "A25" }),
      uso({ reprodutorDisplay: "GSC-7117", dataIso: "2026-09-15", partida: "B25", custoDose: 105 }),
    ];
    const hist = historicoReprodutoresExternosDeUsos(usos);
    expect(hist).toHaveLength(1);
    expect(hist[0]?.reprodutorKey).toBe("e:gsc-7117");
    expect(hist[0]?.ultimoUso).toBe("2026-09-15");
  });

  it("não inclui reprodutor interno no catálogo externo", () => {
    const hist = historicoReprodutoresExternosDeUsos([
      uso({
        reprodutorDisplay: "Touro 16",
        dataIso: "2026-08-26",
        origem: SEMEN_ORIGEM_INTERNO,
        reprodutorKey: "m:7",
        machoId: 7,
      }),
    ]);
    expect(hist).toHaveLength(0);
  });

  it("teste K — inativo some do autocomplete e permanece no catálogo", () => {
    const catalogo = mergeSemenReprodutorExternoCatalogo(
      [cadastro({ reprodutorTexto: "ABS 1234", ativo: false, centralPadrao: "Alta" })],
      [],
    );
    expect(catalogo[0]?.ativo).toBe(false);
    expect(filterSemenReprodutorExternoCatalogoSugestao(catalogo, "")).toHaveLength(0);
    expect(filterSemenReprodutorExternoCatalogoSugestao(catalogo, "ABS")).toHaveLength(0);
  });

  it("teste L — reativar volta ao autocomplete", () => {
    const catalogo = mergeSemenReprodutorExternoCatalogo(
      [cadastro({ reprodutorTexto: "ABS 1234", ativo: true })],
      [],
    );
    expect(filterSemenReprodutorExternoCatalogoSugestao(catalogo, "")).toHaveLength(1);
  });

  it("ordena pelo último uso e não mostra partida no subtítulo", () => {
    const items = sortSemenReprodutorExternoCatalogo(
      mergeSemenReprodutorExternoCatalogo(
        [
          cadastro({ id: 1, reprodutorTexto: "KREM-663" }),
          cadastro({ id: 2, reprodutorTexto: "ABS 1234", centralPadrao: "Alta" }),
        ],
        [
          { reprodutorKey: "e:krem-663", reprodutorTexto: "KREM-663", ultimoUso: "2026-08-24" },
          { reprodutorKey: "e:abs 1234", reprodutorTexto: "ABS 1234", ultimoUso: "2026-08-27" },
        ],
      ),
    );
    expect(items.map(i => i.reprodutorTexto)).toEqual(["ABS 1234", "KREM-663"]);
    expect(formatSemenReprodutorExternoCatalogoSubtitulo(items[0]!)).toBe("Externo · Alta");
    expect(formatSemenReprodutorExternoCatalogoSubtitulo(items[0]!)).not.toContain("A25");
  });

  it("editar nome só é permitido se a chave permanecer a mesma", () => {
    expect(canChangeSemenReprodutorExternoTexto("e:gsc-7117", "GSC-7117")).toBe(true);
    expect(canChangeSemenReprodutorExternoTexto("e:gsc-7117", "gsc-7117")).toBe(true);
    expect(canChangeSemenReprodutorExternoTexto("e:gsc-7117", "GSC 7117")).toBe(false);
  });
});
