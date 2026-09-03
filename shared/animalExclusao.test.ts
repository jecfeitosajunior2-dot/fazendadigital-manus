import { describe, expect, it } from "vitest";
import {
  animalStatusNaoAtivo,
  collectBlockedAnimalIds,
  isAnimalExclusaoBloqueada,
  MSG_ANIMAL_EXCLUSAO_BLOQUEADA,
  TOOLTIP_ANIMAL_EXCLUIR,
} from "./animalExclusao";

describe("animalExclusao", () => {
  it("libera exclusão quando o cadastro está limpo", () => {
    expect(isAnimalExclusaoBloqueada({})).toBe(false);
    expect(
      isAnimalExclusaoBloqueada({
        statusNaoAtivo: false,
        temHistoricoOperacional: false,
      }),
    ).toBe(false);
  });

  it("bloqueia animal que já saiu da operação (baixa)", () => {
    expect(animalStatusNaoAtivo("vendido")).toBe(true);
    expect(animalStatusNaoAtivo("morto")).toBe(true);
    expect(animalStatusNaoAtivo("transferido")).toBe(true);
    expect(animalStatusNaoAtivo("ativo")).toBe(false);
    expect(animalStatusNaoAtivo(null)).toBe(false);
    expect(isAnimalExclusaoBloqueada({ statusNaoAtivo: true })).toBe(true);
  });

  it("bloqueia quando há histórico operacional", () => {
    expect(isAnimalExclusaoBloqueada({ temHistoricoOperacional: true })).toBe(true);
  });

  it("não trata lote nem peso de entrada como histórico", () => {
    const blocked = collectBlockedAnimalIds([10], {});
    expect(blocked.has(10)).toBe(false);
    expect(isAnimalExclusaoBloqueada({ temHistoricoOperacional: blocked.has(10) })).toBe(false);
  });

  it("marca animal com pesagem", () => {
    const blocked = collectBlockedAnimalIds([1, 2], { pesagemIds: [2] });
    expect(blocked.has(1)).toBe(false);
    expect(blocked.has(2)).toBe(true);
  });

  it("marca mãe/pai quando há filho cadastrado", () => {
    const blocked = collectBlockedAnimalIds([5, 8], { maeDeIds: [5], paiDeIds: [null, 8] });
    expect(blocked.has(5)).toBe(true);
    expect(blocked.has(8)).toBe(true);
  });

  it("ignora vínculos nulos e IDs fora da lista", () => {
    const blocked = collectBlockedAnimalIds([1], {
      reproducaoMachoIds: [null, 99],
      semenMachoIds: [undefined],
      vendaIds: [3],
    });
    expect(blocked.size).toBe(0);
  });

  it("une vários tipos de histórico no mesmo animal", () => {
    const blocked = collectBlockedAnimalIds([7], {
      saudeIds: [7],
      baixaIds: [7],
      vendaIds: [7],
    });
    expect([...blocked]).toEqual([7]);
  });

  it("expõe o aviso para a lixeira cinza", () => {
    expect(MSG_ANIMAL_EXCLUSAO_BLOQUEADA).toMatch(/Manejo → Baixa/);
    expect(TOOLTIP_ANIMAL_EXCLUIR).toBe("Excluir animal");
  });
});
