import { describe, expect, it } from "vitest";
import {
  assertDataMovimentacaoNaoFutura,
  filtrarLotesDestinoTroca,
  formatLinhaMovimentacaoTrocaLote,
  formatLinhaPastoHistoricoLote,
  formatLoteAtualDisplay,
  isLoteDestinoMesmaFazenda,
  isMesmoLoteDestino,
  LABEL_SEM_LOTE,
  LABEL_SEM_LOTE_ATUAL,
  LABEL_TROCA_LOTE,
  labelHistoricoOrigemLote,
  labelLoteDestinoComPasto,
  montarTooltipTrocaLote,
  MSG_TROCA_LOTE_DATA_FUTURA,
  MSG_TROCA_LOTE_MESMO_LOTE,
  podeSalvarTrocaLote,
} from "../shared/transferirAnimaisEntreLotes";

describe("regras de troca de lote", () => {
  it("bloqueia destino igual ao lote atual", () => {
    expect(isMesmoLoteDestino(10, 10)).toBe(true);
    expect(isMesmoLoteDestino(10, 20)).toBe(false);
    expect(isMesmoLoteDestino(null, 10)).toBe(false);
  });

  it("bloqueia fazendas diferentes quando ambas são conhecidas", () => {
    expect(isLoteDestinoMesmaFazenda(1, 2)).toBe(false);
    expect(isLoteDestinoMesmaFazenda(1, 1)).toBe(true);
    expect(isLoteDestinoMesmaFazenda(null, 1)).toBe(true);
  });

  it("rejeita data futura com a mesma mensagem do manejo", () => {
    const r = assertDataMovimentacaoNaoFutura("2099-01-01", "2026-08-28");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_TROCA_LOTE_DATA_FUTURA);
  });

  it("aceita data de hoje", () => {
    expect(assertDataMovimentacaoNaoFutura("2026-08-28", "2026-08-28")).toEqual({ ok: true });
  });
});

describe("filtrarLotesDestinoTroca", () => {
  const lotes = [
    { id: 1, nome: "Bezerros", fazendaId: 1, ativo: true },
    { id: 2, nome: "Novilhas", fazendaId: 1, ativo: true },
    { id: 3, nome: "Outra fazenda", fazendaId: 2, ativo: true },
    { id: 4, nome: "Inativo", fazendaId: 1, ativo: false },
  ];

  it("mostra só lotes da mesma fazenda", () => {
    const r = filtrarLotesDestinoTroca(lotes, { fazendaAnimalId: 1 });
    expect(r.map(l => l.nome)).toEqual(["Bezerros", "Novilhas"]);
  });

  it("não lista o lote atual entre os destinos", () => {
    const r = filtrarLotesDestinoTroca(lotes, { fazendaAnimalId: 1, loteAtualId: 1 });
    expect(r.map(l => l.nome)).toEqual(["Novilhas"]);
    expect(r.some(l => l.nome === "Bezerros")).toBe(false);
  });

  it("animal sem lote não exclui nenhum destino da fazenda", () => {
    const r = filtrarLotesDestinoTroca(lotes, { fazendaAnimalId: 1, loteAtualId: null });
    expect(r.map(l => l.nome)).toEqual(["Bezerros", "Novilhas"]);
  });

  it("não lista lote de outra fazenda", () => {
    const r = filtrarLotesDestinoTroca(lotes, { fazendaAnimalId: 1 });
    expect(r.some(l => l.id === 3)).toBe(false);
  });
});

describe("lote atual e histórico", () => {
  it("mostra Sem lote atual quando o animal não tem lote", () => {
    expect(formatLoteAtualDisplay({ temLote: false }).titulo).toBe(LABEL_SEM_LOTE_ATUAL);
  });

  it("mostra pasto de forma discreta no lote atual", () => {
    const r = formatLoteAtualDisplay({
      temLote: true,
      loteNome: "Bezerros",
      pastoNome: "Pasto 05",
    });
    expect(r.titulo).toBe("Bezerros");
    expect(r.subtitulo).toBe("Pasto 05");
  });

  it("sem lote atual não mostra pasto", () => {
    const r = formatLoteAtualDisplay({ temLote: false, pastoNome: "Pasto 05" });
    expect(r.titulo).toBe(LABEL_SEM_LOTE_ATUAL);
    expect(r.subtitulo).toBeUndefined();
  });

  it("rótulo de destino inclui pasto quando houver", () => {
    expect(labelLoteDestinoComPasto("Vacas", "Pasto 08")).toBe("Vacas · Pasto 08");
    expect(labelLoteDestinoComPasto("Vacas", null)).toBe("Vacas");
    expect(labelLoteDestinoComPasto("Vacas", "  ")).toBe("Vacas");
  });

  it("origem sem lote permanece Sem lote no histórico", () => {
    expect(labelHistoricoOrigemLote(null)).toBe(LABEL_SEM_LOTE);
    expect(
      formatLinhaMovimentacaoTrocaLote({
        loteOrigemId: null,
        loteDestinoNome: "Bezerros",
      }),
    ).toBe("Sem lote → Bezerros");
  });

  it("monta a linha de pasto do Histórico de lotes", () => {
    expect(
      formatLinhaPastoHistoricoLote({
        pastoOrigemNome: "Pasto 05",
        pastoDestinoNome: "Pasto 08",
      }),
    ).toBe("Pasto 05 → Pasto 08");
    expect(
      formatLinhaPastoHistoricoLote({
        pastoOrigemNome: null,
        pastoDestinoNome: "Pasto 05",
      }),
    ).toBe("Pasto 05");
  });

  it("tooltip usa Troca de lote com responsável e observações", () => {
    const texto = montarTooltipTrocaLote({
      loteOrigemId: 1,
      loteOrigemNome: "Bezerros",
      loteDestinoNome: "Novilhas 01",
      dataFormatada: "28/08/2026",
      responsavel: "Pedro",
      observacoes: "Movido após desmama.",
    });
    expect(texto).toContain(LABEL_TROCA_LOTE);
    expect(texto).toContain("Lote anterior: Bezerros");
    expect(texto).toContain("Novo lote: Novilhas 01");
    expect(texto).toContain("Responsável: Pedro");
    expect(texto).toContain("Movido após desmama.");
    expect(texto).not.toContain("Transferência entre lotes");
  });
});

describe("podeSalvarTrocaLote", () => {
  const base = {
    fazendaId: 1,
    animalId: 3,
    dataMovimentacao: "2026-06-10",
    loteDestinoId: 20,
    loteAtualId: 10,
  };

  it("libera salvar com fazenda, animal, data e destino diferentes", () => {
    expect(podeSalvarTrocaLote(base)).toBe(true);
  });

  it("bloqueia sem fazenda", () => {
    expect(podeSalvarTrocaLote({ ...base, fazendaId: null })).toBe(false);
  });

  it("bloqueia o mesmo lote", () => {
    expect(podeSalvarTrocaLote({ ...base, loteDestinoId: 10 })).toBe(false);
    expect(MSG_TROCA_LOTE_MESMO_LOTE).toContain("já pertence a este lote");
  });

  it("permite animal sem lote", () => {
    expect(podeSalvarTrocaLote({ ...base, loteAtualId: null })).toBe(true);
  });
});
