import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  MSG_RFID_ATIVO_CONFLITO,
  buildRfidConflitoMessage,
  escolherAnimalPorRfid,
  findRfidConflict,
  normalizeRfidKey,
  rfidOcupadoPorOutroAtivo,
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

  it("permite reutilizar RFID de animal inativo", () => {
    const lista = [{ id: 5, brincoEletronico: "RFID-X", status: "vendido" }];
    expect(findRfidConflict(lista, "RFID-X", { excludeAnimalId: 9 })).toBeNull();
    expect(
      findRfidConflict(
        [
          { id: 5, brincoEletronico: "RFID-X", status: "morto" },
          { id: 8, brincoEletronico: "RFID-X", status: "ativo" },
        ],
        "RFID-X",
        { excludeAnimalId: 8 },
      ),
    ).toBeNull();
  });

  it("exclui o próprio animal da checagem", () => {
    const lista = [{ id: 10, brincoEletronico: "RFID-SELF", status: "ativo" }];
    expect(findRfidConflict(lista, "RFID-SELF", { excludeAnimalId: 10 })).toBeNull();
  });

  it("mensagem de conflito fala só de animal ativo", () => {
    expect(buildRfidConflitoMessage({ id: 1, status: "ativo" })).toBe(MSG_RFID_ATIVO_CONFLITO);
    expect(buildRfidConflitoMessage({ id: 2, status: "morto" })).toBe(MSG_RFID_ATIVO_CONFLITO);
  });

  it("busca por RFID prefere o vivo e cai no histórico se não houver ativo", () => {
    const lista = [
      { id: 5, brincoEletronico: "RFID-X", status: "morto" },
      { id: 8, brincoEletronico: "RFID-X", status: "ativo" },
      { id: 9, brincoEletronico: "OUTRO", status: "ativo" },
    ];
    expect(escolherAnimalPorRfid(lista, "RFID-X")?.id).toBe(8);
    expect(escolherAnimalPorRfid(lista.slice(0, 1), "RFID-X")?.id).toBe(5);
    expect(escolherAnimalPorRfid(lista, "SUMIU")).toBeNull();
  });

  it("RFID de inativo não ocupa o chip de outro animal", () => {
    expect(rfidOcupadoPorOutroAtivo({ id: 5, status: "morto" })).toBe(false);
    expect(rfidOcupadoPorOutroAtivo({ id: 8, status: "ativo" }, { excludeAnimalId: 8 })).toBe(false);
    expect(rfidOcupadoPorOutroAtivo({ id: 8, status: "ativo" }, { excludeAnimalId: 1 })).toBe(true);
  });

  it("servidor e curral aplicam a mesma regra de reaproveitamento", () => {
    const here = import.meta.dirname;
    const routers = readFileSync(resolve(here, "routers.ts"), "utf8");
    const compraDb = readFileSync(resolve(here, "receberAnimalCompraDb.ts"), "utf8");
    const contexto = readFileSync(resolve(here, "manejoContexto.ts"), "utf8");
    const curralTroca = readFileSync(
      resolve(here, "../client/src/components/curral/CurralBrincoEletronicoPanel.tsx"),
      "utf8",
    );
    const curralCadastro = readFileSync(
      resolve(here, "../client/src/components/curral/CurralCadastroAnimalPanel.tsx"),
      "utf8",
    );
    expect(routers).toContain("escolherAnimalPorRfid");
    expect(routers).toContain("LOWER(TRIM(${animais.status})) = 'ativo'");
    expect(compraDb).toContain('eq(animais.status, "ativo")');
    expect(contexto).toContain('eq(animais.status, "ativo")');
    expect(curralTroca).toContain("rfidOcupadoPorOutroAtivo");
    expect(curralCadastro).toContain("rfidOcupadoPorOutroAtivo");
    expect(curralTroca).not.toContain("não pode ser reutilizado.");
    expect(curralCadastro).not.toContain("não pode ser reutilizado.");
  });
});
