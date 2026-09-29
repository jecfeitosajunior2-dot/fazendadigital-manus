import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORIGEM_LEGADO_LISTA,
  ORIGEM_RECEBIMENTO_LISTA,
  STATUS_LISTA_RECEBIDO,
  TEXTO_VAZIO_RECEBIMENTO_LISTA,
  formatarDataEntradaRecebimentoLista,
  formatarPesoRecebimentoLista,
  formatarRecebidoEmLista,
  labelDestinoRecebimentoCompra,
  rotuloUltimoAnimalRecebido,
  montarItemListaRecebimentoCompra,
  montarItemListaRecebimentoLegado,
  podeMostrarAcaoDesfazerRecebimento,
  recebimentosVisiveisNaSecao,
  unificarAnimaisRecebidosCompra,
} from "./compraRecebimentosListagem";

const here = dirname(fileURLToPath(import.meta.url));

const grupoMacho = { id: 9101, categoria: "Bezerro", sexo: "macho" };

function itemRastreado(opts: {
  recebimentoId: number;
  animalId: number;
  brinco: string;
  status: "confirmado" | "estornado";
  recebidoEm?: string | null;
}) {
  return montarItemListaRecebimentoCompra({
    id: opts.recebimentoId,
    userId: 7,
    compraId: 9001,
    compraGrupoId: 9101,
    animalId: opts.animalId,
    brincoVisual: opts.brinco,
    rfid: null,
    sexo: "macho",
    categoria: "Bezerro",
    pesoRecebimento: null,
    loteDestinoId: 31,
    pastoDestinoId: 41,
    status: opts.status,
    recebidoEm: opts.recebidoEm ?? "2026-09-28T14:30:00.000Z",
  }, { loteNome: "B01", pastoNome: "444" });
}

describe("listagem unificada de animais recebidos", () => {
  it("monta o item rastreado pelo snapshot, sem inventar peso", () => {
    const item = itemRastreado({
      recebimentoId: 7701,
      animalId: 8803,
      brinco: "810",
      status: "confirmado",
      recebidoEm: "2026-09-28T13:43:37.000Z",
    });
    expect(item.origem).toBe(ORIGEM_RECEBIMENTO_LISTA);
    expect(item.animalId).toBe(8803);
    expect(item.recebimentoId).toBe(7701);
    expect(item.chaveLista).toBe("recebimento:7701");
    expect(item.brincoVisual).toBe("810");
    expect(item.grupoLabel).toBe("Bezerro • Macho");
    expect(item.pesoKg).toBeNull();
    expect(formatarPesoRecebimentoLista(item.pesoKg)).toBe(TEXTO_VAZIO_RECEBIMENTO_LISTA);
    expect(item.destinoLabel).toBe("Lote B01 • Pasto 444");
    expect(item.statusLabel).toBe("Confirmado");
    expect(item.recebidoEmSoData).toBe(false);
  });

  it("A. legado: contrato, traços, data sem horário e sem desfazer", () => {
    const item = montarItemListaRecebimentoLegado(
      {
        id: 8801,
        brinco: "801",
        brincoEletronico: null,
        sexo: "macho",
        categoria: "Bezerro",
        compraGrupoId: 9101,
        dataEntrada: "2026-09-24",
      },
      grupoMacho,
      9001,
    );
    expect(item).toMatchObject({
      origem: ORIGEM_LEGADO_LISTA,
      animalId: 8801,
      recebimentoId: null,
      status: STATUS_LISTA_RECEBIDO,
      statusLabel: "Recebido",
      pesoKg: null,
      destinoLabel: TEXTO_VAZIO_RECEBIMENTO_LISTA,
      recebidoEm: "2026-09-24",
      recebidoEmSoData: true,
    });
    expect(formatarRecebidoEmLista(item)).toBe("24/09/2026");
    expect(formatarDataEntradaRecebimentoLista(item.recebidoEm)).not.toMatch(/\d{2}:\d{2}/);
    expect(podeMostrarAcaoDesfazerRecebimento(item)).toBe(false);
  });

  it("B. novo: snapshot, Confirmado e desfazer com recebimentoId", () => {
    const item = itemRastreado({
      recebimentoId: 7701,
      animalId: 8803,
      brinco: "810",
      status: "confirmado",
    });
    expect(item.origem).toBe(ORIGEM_RECEBIMENTO_LISTA);
    expect(item.recebimentoId).toBe(7701);
    expect(item.animalId).toBe(8803);
    expect(item.statusLabel).toBe("Confirmado");
    expect(item.destinoLabel).toBe("Lote B01 • Pasto 444");
    expect(podeMostrarAcaoDesfazerRecebimento(item)).toBe(true);
  });

  it("cenário principal + C/D/E: 2 legados + 1 confirmado; estornado e animal removido ficam de fora", () => {
    const confirmado = itemRastreado({
      recebimentoId: 7701,
      animalId: 8803,
      brinco: "810",
      status: "confirmado",
      recebidoEm: "2026-09-28T14:30:00.000Z",
    });
    const estornado = itemRastreado({
      recebimentoId: 7702,
      animalId: 8804,
      brinco: "811",
      status: "estornado",
      recebidoEm: "2026-09-27T10:00:00.000Z",
    });
    const lista = unificarAnimaisRecebidosCompra({
      compraId: 9001,
      recebimentos: [confirmado, estornado],
      animais: [
        {
          id: 8801,
          brinco: "801",
          brincoEletronico: null,
          sexo: "macho",
          categoria: "Bezerro",
          compraGrupoId: 9101,
          dataEntrada: "2026-09-24",
        },
        {
          id: 8802,
          brinco: "802",
          brincoEletronico: "RFID-802",
          sexo: "macho",
          categoria: "Bezerro",
          compraGrupoId: 9101,
          dataEntrada: "2026-09-24",
        },
        {
          id: 8803,
          brinco: "810",
          brincoEletronico: null,
          sexo: "macho",
          categoria: "Bezerro",
          compraGrupoId: 9101,
          dataEntrada: "2026-09-28",
        },
      ],
      grupos: [grupoMacho],
    });
    expect(lista).toHaveLength(3);
    expect(lista.map(i => i.brincoVisual)).toEqual(["810", "802", "801"]);
    expect(lista.filter(i => i.origem === ORIGEM_LEGADO_LISTA)).toHaveLength(2);
    expect(lista.filter(i => i.origem === ORIGEM_RECEBIMENTO_LISTA)).toHaveLength(1);
    expect(lista.some(i => i.recebimentoId === 7702 || i.animalId === 8804 || i.brincoVisual === "811")).toBe(
      false,
    );
    expect(lista.filter(i => i.animalId === 8803)).toHaveLength(1);
    expect(lista.find(i => i.animalId === 8803)?.origem).toBe(ORIGEM_RECEBIMENTO_LISTA);
    expect(lista.find(i => i.animalId === 8802)?.rfid).toBe("RFID-802");
    expect(lista.find(i => i.animalId === 8802)?.pesoKg).toBeNull();
  });

  it("seção visível exclui estornado e mantém legado", () => {
    const confirmado = itemRastreado({
      recebimentoId: 7701,
      animalId: 8803,
      brinco: "810",
      status: "confirmado",
    });
    const estornado = itemRastreado({
      recebimentoId: 7702,
      animalId: 8804,
      brinco: "811",
      status: "estornado",
    });
    const legado = montarItemListaRecebimentoLegado(
      {
        id: 8801,
        brinco: "801",
        sexo: "macho",
        compraGrupoId: 9101,
        dataEntrada: "2026-09-24",
      },
      grupoMacho,
      9001,
    );
    const visiveis = recebimentosVisiveisNaSecao([confirmado, estornado, legado]);
    expect(visiveis.map(i => i.brincoVisual).sort()).toEqual(["801", "810"]);
  });

  it("F. desfazer exige origem recebimento, recebimentoId e confirmado", () => {
    expect(
      podeMostrarAcaoDesfazerRecebimento({
        origem: ORIGEM_RECEBIMENTO_LISTA,
        recebimentoId: 7701,
        status: "confirmado",
      }),
    ).toBe(true);
    expect(
      podeMostrarAcaoDesfazerRecebimento({
        origem: ORIGEM_LEGADO_LISTA,
        recebimentoId: null,
        status: STATUS_LISTA_RECEBIDO,
      }),
    ).toBe(false);
    expect(
      podeMostrarAcaoDesfazerRecebimento({
        origem: ORIGEM_RECEBIMENTO_LISTA,
        recebimentoId: null,
        status: "confirmado",
      }),
    ).toBe(false);
    expect(
      podeMostrarAcaoDesfazerRecebimento({
        origem: ORIGEM_RECEBIMENTO_LISTA,
        recebimentoId: 7701,
        status: "estornado",
      }),
    ).toBe(false);
  });

  it("destino vazio vira traço", () => {
    expect(labelDestinoRecebimentoCompra({})).toBe(TEXTO_VAZIO_RECEBIMENTO_LISTA);
  });

  it("último animal distingue brinco visual de RFID", () => {
    expect(rotuloUltimoAnimalRecebido({ brincoVisual: "000909", rfid: "963000400315712" })).toBe(
      "Brinco 000909",
    );
    expect(rotuloUltimoAnimalRecebido({ brincoVisual: "", rfid: "963000400650112" })).toBe(
      "RFID 963000400650112",
    );
    expect(rotuloUltimoAnimalRecebido({ brincoVisual: "  ", rfid: null })).toBe(
      TEXTO_VAZIO_RECEBIMENTO_LISTA,
    );
  });

  it("G. contadores continuam derivados de animais.compraId", () => {
    const detalhe = readFileSync(resolve(here, "../server/compraDetalhe.ts"), "utf8");
    expect(detalhe).toContain("resumirIdentificacaoCompra");
    expect(detalhe).toContain("eq(animais.compraId, compra.id)");
  });

  it("backend une compra_recebimentos com animais vinculados, sem desfazer", () => {
    const src = readFileSync(resolve(here, "../server/listarRecebimentosCompra.ts"), "utf8");
    expect(src).toContain("unificarAnimaisRecebidosCompra");
    expect(src).toContain("compraRecebimentos");
    expect(src).toContain("eq(animais.compraId, compra.id)");
    expect(src).not.toContain("desfazerRecebimento");
    expect(src).not.toContain("insert(");
    expect(src).not.toContain("update(");
    expect(src).not.toContain("delete(");
  });
});
