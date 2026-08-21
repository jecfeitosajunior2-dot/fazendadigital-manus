import { describe, it, expect } from "vitest";
import {
  buildRfidConflitoMessage,
  findRfidConflict,
  normalizeRfidKey,
} from "../shared/rfidUnicidade";

describe("rfidUnicidade", () => {
  it("normaliza RFID só com trim (string, sem Number)", () => {
    expect(normalizeRfidKey("  963000400123456 ")).toBe("963000400123456");
    expect(normalizeRfidKey("963000400123456")).toBe("963000400123456");
  });

  it("bloqueia RFID de outro animal ativo", () => {
    const lista = [
      { id: 1, brincoEletronico: "RFID-A", status: "ativo" },
      { id: 2, brincoEletronico: "RFID-B", status: "ativo" },
    ];
    expect(findRfidConflict(lista, "RFID-B", { excludeAnimalId: 1 })?.id).toBe(2);
  });

  it("bloqueia RFID de animal inativo (não reutilizável)", () => {
    const lista = [{ id: 5, brincoEletronico: "RFID-X", status: "vendido" }];
    expect(findRfidConflict(lista, "RFID-X", { excludeAnimalId: 9 })?.id).toBe(5);
    expect(findRfidConflict(lista, "RFID-X", { excludeAnimalId: 9 })?.status).toBe("vendido");
  });

  it("exclui o próprio animal da checagem", () => {
    const lista = [{ id: 10, brincoEletronico: "RFID-SELF", status: "ativo" }];
    expect(findRfidConflict(lista, "RFID-SELF", { excludeAnimalId: 10 })).toBeNull();
  });

  it("monta mensagem distinta para ativo vs histórico/inativo", () => {
    expect(buildRfidConflitoMessage({ id: 1, status: "ativo" })).toBe(
      "Este RFID já está vinculado a outro animal ativo nesta fazenda.",
    );
    expect(buildRfidConflitoMessage({ id: 2, status: "morto" })).toBe(
      "Este RFID já foi vinculado a outro animal e não pode ser reutilizado.",
    );
    expect(buildRfidConflitoMessage({ id: 3, status: "vendido" })).toBe(
      "Este RFID já foi vinculado a outro animal e não pode ser reutilizado.",
    );
  });
});
