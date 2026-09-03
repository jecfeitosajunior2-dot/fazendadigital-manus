import { describe, expect, it } from "vitest";
import {
  FAZENDA_DELETE_BLOCKER_LABELS,
  formatFazendaDeleteBlockersMessage,
  fazendaDeleteBlockerHref,
} from "../shared/fazendaDeleteBlockers";

describe("fazendaDeleteBlockers", () => {
  it("formata mensagem com múltiplos bloqueios", () => {
    const msg = formatFazendaDeleteBlockersMessage("Fazenda Teste", [
      { key: "subdivisoes", label: FAZENDA_DELETE_BLOCKER_LABELS.subdivisoes, qtd: 2 },
      { key: "animais", label: FAZENDA_DELETE_BLOCKER_LABELS.animais, qtd: 5 },
    ]);
    expect(msg).toContain('Fazenda Teste');
    expect(msg).toContain("2 subdivisões");
    expect(msg).toContain("5 animais");
    expect(msg).toContain("Possui 2 subdivisões e 5 animais");
  });

  it("usa singular e plural corretos", () => {
    const um = formatFazendaDeleteBlockersMessage("Fazenda Teste", [
      { key: "subdivisoes", label: FAZENDA_DELETE_BLOCKER_LABELS.subdivisoes, qtd: 1 },
    ]);
    expect(um).toContain("1 subdivisão");
    expect(um).not.toContain("subdivisão(ões)");
  });

  it("gera links com fazendaId quando aplicável", () => {
    expect(fazendaDeleteBlockerHref("subdivisoes", 3)).toBe("/fazendas/visao-geral#fazenda-subdivisoes");
    expect(fazendaDeleteBlockerHref("animais", 3)).toBe("/rebanho/lista-animais?fazendaId=3");
    expect(fazendaDeleteBlockerHref("lotes", 3)).toBe("/rebanho/lotes?fazendaId=3");
    expect(fazendaDeleteBlockerHref("maquinas", 3)).toBe("/maquinas/visao-geral");
  });
});
