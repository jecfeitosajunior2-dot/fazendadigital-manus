import { describe, expect, it } from "vitest";
import {
  MSG_BLOQUEIO_ESTORNO_RECEBIMENTO,
  MSG_ESTORNO_RECEBIMENTO_MOTIVO,
  MSG_ESTORNO_RECEBIMENTO_OBSERVACAO_OUTRO,
  isRecebimentoLegado,
  normalizarEstornoRecebimentoCompraInput,
  verificarElegibilidadeEstornoRecebimento,
  type AnimalEstornoSnap,
  type FatosEstornoRecebimentoCompra,
  type RecebimentoEstornoSnap,
} from "./compraRecebimentoEstorno";

const rec: RecebimentoEstornoSnap = {
  id: 7701,
  userId: 7,
  compraId: 9001,
  compraGrupoId: 9101,
  animalId: 8801,
  brincoVisual: "810",
  rfid: null,
  sexo: "macho",
  categoria: "Bezerro",
  pesoRecebimento: null,
  loteDestinoId: null,
  pastoDestinoId: null,
  status: "confirmado",
};

const animal: AnimalEstornoSnap = {
  id: 8801,
  userId: 7,
  status: "ativo",
  brinco: "810",
  brincoEletronico: null,
  loteId: null,
  pastoId: null,
  sexo: "macho",
  categoria: "Bezerro",
  compraId: 9001,
  compraGrupoId: 9101,
  castrado: null,
  dataDesmama: null,
  pesoAtual: null,
};

function fatos(
  extra: Partial<FatosEstornoRecebimentoCompra> = {},
): FatosEstornoRecebimentoCompra {
  return {
    userId: 7,
    recebimento: rec,
    animal,
    compraUserId: 7,
    pesagens: [],
    movimentacoes: [],
    temHistoricoBrincos: false,
    temSaude: false,
    temReproducaoFemea: false,
    temReproducaoMacho: false,
    temFilhoComoMae: false,
    temFilhoComoPai: false,
    temPartoCria: false,
    temSemenPartida: false,
    temBaixa: false,
    temVendaItem: false,
    ...extra,
  };
}

describe("normalizarEstornoRecebimentoCompraInput", () => {
  it("rejeita motivo outro sem observação", () => {
    expect(
      normalizarEstornoRecebimentoCompraInput({
        recebimentoId: 7701,
        motivo: "outro",
        observacao: "   ",
      }),
    ).toEqual({ ok: false, message: MSG_ESTORNO_RECEBIMENTO_OBSERVACAO_OUTRO });
  });

  it("aceita motivo outro com observação", () => {
    expect(
      normalizarEstornoRecebimentoCompraInput({
        recebimentoId: 7701,
        motivo: "outro",
        observacao: "Digitou o brinco errado",
      }),
    ).toMatchObject({
      ok: true,
      motivo: "outro",
      observacao: "Digitou o brinco errado",
    });
  });

  it("rejeita motivo inválido", () => {
    expect(
      normalizarEstornoRecebimentoCompraInput({
        recebimentoId: 7701,
        motivo: "qualquer",
      }),
    ).toEqual({ ok: false, message: MSG_ESTORNO_RECEBIMENTO_MOTIVO });
  });
});

describe("verificarElegibilidadeEstornoRecebimento", () => {
  it("libera recebimento estruturado limpo", () => {
    expect(verificarElegibilidadeEstornoRecebimento(fatos())).toEqual({ ok: true });
  });

  it("bloqueia recebimento legado", () => {
    const legado = fatos({
      recebimento: null,
      animal: { ...animal, compraId: 1, compraGrupoId: 1, id: 32, brinco: "998" },
    });
    expect(isRecebimentoLegado(legado)).toBe(true);
    expect(verificarElegibilidadeEstornoRecebimento(legado)).toMatchObject({
      codigo: "RECEBIMENTO_LEGADO",
      message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.RECEBIMENTO_LEGADO,
    });
  });

  it("bloqueia já estornado", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({ recebimento: { ...rec, status: "estornado" } }),
      ),
    ).toMatchObject({ codigo: "RECEBIMENTO_JA_ESTORNADO" });
  });

  it("bloqueia animal ausente", () => {
    expect(verificarElegibilidadeEstornoRecebimento(fatos({ animal: null }))).toMatchObject({
      codigo: "ANIMAL_NAO_ENCONTRADO",
    });
  });

  it("bloqueia pesagem posterior", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({ pesagens: [{ compraRecebimentoId: null }] }),
      ),
    ).toMatchObject({ codigo: "PESAGEM_POSTERIOR" });
  });

  it("bloqueia segunda movimentação", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({
          recebimento: { ...rec, loteDestinoId: 31, pastoDestinoId: 41 },
          animal: { ...animal, loteId: 31, pastoId: 41 },
          movimentacoes: [{ compraRecebimentoId: 7701 }, { compraRecebimentoId: null }],
        }),
      ),
    ).toMatchObject({ codigo: "MOVIMENTACAO_POSTERIOR" });
  });

  it("bloqueia lote/pasto diferente do snapshot", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({ animal: { ...animal, loteId: 99 } }),
      ),
    ).toMatchObject({ codigo: "LOCALIZACAO_ALTERADA" });
  });

  it("bloqueia histórico de brincos", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(fatos({ temHistoricoBrincos: true })),
    ).toMatchObject({ codigo: "IDENTIFICACAO_ALTERADA" });
  });

  it("bloqueia brinco diferente do snapshot", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({ animal: { ...animal, brinco: "811" } }),
      ),
    ).toMatchObject({ codigo: "IDENTIFICACAO_ALTERADA" });
  });

  it("bloqueia RFID diferente do snapshot", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({
          recebimento: { ...rec, rfid: "TAG-810" },
          animal: { ...animal, brincoEletronico: "TAG-OUTRO" },
        }),
      ),
    ).toMatchObject({ codigo: "IDENTIFICACAO_ALTERADA" });
  });

  it("bloqueia saúde", () => {
    expect(verificarElegibilidadeEstornoRecebimento(fatos({ temSaude: true }))).toMatchObject({
      codigo: "MANEJO_SANITARIO",
    });
  });

  it("bloqueia flag castrado", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({ animal: { ...animal, castrado: true } }),
      ),
    ).toMatchObject({ codigo: "MANEJO_SANITARIO" });
  });

  it("bloqueia reprodução como fêmea", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(fatos({ temReproducaoFemea: true })),
    ).toMatchObject({ codigo: "MANEJO_REPRODUTIVO" });
  });

  it("bloqueia reprodução como macho", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(fatos({ temReproducaoMacho: true })),
    ).toMatchObject({ codigo: "MANEJO_REPRODUTIVO" });
  });

  it("bloqueia desmama cadastral", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({ animal: { ...animal, dataDesmama: "2026-08-01" } }),
      ),
    ).toMatchObject({ codigo: "MANEJO_REPRODUTIVO" });
  });

  it("bloqueia filho apontando como mãe", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(fatos({ temFilhoComoMae: true })),
    ).toMatchObject({ codigo: "GENEALOGIA_EXISTENTE" });
  });

  it("bloqueia filho apontando como pai", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(fatos({ temFilhoComoPai: true })),
    ).toMatchObject({ codigo: "GENEALOGIA_EXISTENTE" });
  });

  it("bloqueia parto_crias", () => {
    expect(verificarElegibilidadeEstornoRecebimento(fatos({ temPartoCria: true }))).toMatchObject({
      codigo: "GENEALOGIA_EXISTENTE",
    });
  });

  it("bloqueia sêmen", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(fatos({ temSemenPartida: true })),
    ).toMatchObject({ codigo: "SEMEN_EXISTENTE" });
  });

  it("bloqueia baixa", () => {
    expect(verificarElegibilidadeEstornoRecebimento(fatos({ temBaixa: true }))).toMatchObject({
      codigo: "BAIXA_EXISTENTE",
    });
  });

  it("bloqueia venda_itens mesmo com venda cancelada", () => {
    expect(verificarElegibilidadeEstornoRecebimento(fatos({ temVendaItem: true }))).toMatchObject({
      codigo: "VENDA_EXISTENTE",
    });
  });

  it("bloqueia status vendido, morto e transferido", () => {
    for (const status of ["vendido", "morto", "transferido"] as const) {
      expect(
        verificarElegibilidadeEstornoRecebimento(fatos({ animal: { ...animal, status } })),
      ).toMatchObject({ codigo: "STATUS_INCOMPATIVEL" });
    }
  });

  it("bloqueia inconsistência de vínculo comercial", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({ animal: { ...animal, compraId: 9002 } }),
      ),
    ).toMatchObject({ codigo: "INCONSISTENCIA_DADOS" });
  });

  it("bloqueia pesagem ligada a outro recebimento", () => {
    expect(
      verificarElegibilidadeEstornoRecebimento(
        fatos({
          recebimento: { ...rec, pesoRecebimento: "218" },
          animal: { ...animal, pesoAtual: "218" },
          pesagens: [{ compraRecebimentoId: 7702 }],
        }),
      ),
    ).toMatchObject({ codigo: "INCONSISTENCIA_DADOS" });
  });
});
