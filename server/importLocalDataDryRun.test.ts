import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOCAL_DATA_FILES,
  assertSentinelas,
  assertThisFileCannotWrite,
  explodeManutencaoPecas,
  runDryRun,
} from "../scripts/import-local-data-to-mysql.dry-run";

const root = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(root, "scripts", "import-local-data-to-mysql.dry-run.ts");

describe("importador dry-run local → mysql", () => {
  it("não contém caminho de conexão ou escrita em banco", () => {
    const source = readFileSync(scriptPath, "utf8");
    expect(assertThisFileCannotWrite(source)).toEqual([]);
  });

  it("lista os 19 JSON oficiais de .local-data", () => {
    expect(LOCAL_DATA_FILES).toHaveLength(19);
  });

  it("explode peças de manutenção sem inventar id", () => {
    const exploded = explodeManutencaoPecas({
      id: 1,
      tipo: "Preventiva",
      pecas: [{ estoqueId: 24, nome: "Terminal", quantidade: "1.00" }],
    });
    expect(exploded.principal.pecas).toBeUndefined();
    expect(exploded.principal.id).toBe(1);
    expect(exploded.pecas).toEqual([
      {
        manutencaoId: 1,
        estoqueId: 24,
        nome: "Terminal",
        quantidade: "1.00",
        valorUnitario: undefined,
        valorTotal: undefined,
      },
    ]);
  });

  it("valida sentinelas 801/802 do conjunto real", () => {
    const report = runDryRun(root);
    const sentinelas = assertSentinelas(
      [{ id: 25, userId: 1, fazendaId: 1, brinco: "801", brincoEletronico: "963000400650144", pesoAtual: "300.00" }],
      [{ id: 35, animalId: 25, peso: "300.00" }],
    );
    expect(sentinelas[0]?.ok).toBe(true);
    expect(report.sentinelas.every(item => item.ok)).toBe(true);
    expect(report.lote1.existe).toBe(false);
    expect(report.animais).toBe(26);
  });
});
