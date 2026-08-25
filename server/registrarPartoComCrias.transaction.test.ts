/**
 * Testes transacionais com mocks — prova ordem de operações e rollback lógico.
 * Não usa MySQL real; valida contrato do callback `db.transaction`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { resolveGenealogiaDisplay } from "../shared/genealogiaDisplay";
import { animais, partoCrias, pesagens, reproducaoRegistros } from "../drizzle/schema";

const mockValidatePreconditions = vi.fn();
const mockAssertBrincoDb = vi.fn();
const mockAssertRfid = vi.fn();
const mockUpdateLocalAnimal = vi.fn();
const mockListLocalRepro = vi.fn();

type TxOp =
  | { kind: "insert"; table: unknown; values: Record<string, unknown> }
  | { kind: "update"; table: unknown };

let txOps: TxOp[] = [];
let insertSeq = 100;
let transactionCommitted = false;
let transactionRolledBack = false;
let brincoFailAfter = Infinity;
let brincoCall = 0;
let pesagemShouldFail = false;
let reproRegistrosFemea: Array<{
  id?: number;
  tipo: string;
  machoId: number | null;
  dataCobertura: string;
  resultado?: string | null;
}> = [];

vi.mock("./reproducaoCreateValidate", () => ({
  validateReproducaoCreatePreconditions: (...args: unknown[]) => mockValidatePreconditions(...args),
}));

vi.mock("./brincoAtivoValidation", () => ({
  assertBrincoUnicoEntreAtivosDb: (...args: unknown[]) => mockAssertBrincoDb(...args),
  assertBrincoUnicoEntreAtivos: vi.fn(),
}));

vi.mock("./manejoContexto", () => ({
  assertRfidNaoReutilizavel: (...args: unknown[]) => mockAssertRfid(...args),
}));

vi.mock("./localFallbackStore", () => ({
  isDatabaseUnavailable: () => false,
  listLocalReproducaoRegistros: (...args: unknown[]) => mockListLocalRepro(...args),
  updateLocalAnimal: (...args: unknown[]) => mockUpdateLocalAnimal(...args),
  createLocalReproducaoRegistro: vi.fn(),
  fecharPrevisoesPartoLocal: vi.fn(),
  createLocalAnimal: vi.fn(),
  createLocalPesagem: vi.fn(),
  createLocalPartoCriasBatch: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => reproRegistrosFemea),
        })),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCommitted = false;
      transactionRolledBack = false;
      txOps = [];
      insertSeq = 100;
      const tx = {
        insert: (table: unknown) => ({
          values: async (values: Record<string, unknown>) => {
            if (pesagemShouldFail && table === pesagens) {
              transactionRolledBack = true;
              throw new Error("Falha simulada na pesagem");
            }
            txOps.push({ kind: "insert", table, values: { ...values } });
            insertSeq += 1;
            return [{ insertId: insertSeq }];
          },
        }),
        update: (table: unknown) => ({
          set: (_patch: unknown) => ({
            where: async () => {
              txOps.push({ kind: "update", table });
            },
          }),
        }),
      };
      try {
        const result = await fn(tx);
        transactionCommitted = true;
        return result;
      } catch (error) {
        transactionRolledBack = true;
        txOps = [];
        throw error;
      }
    }),
  },
}));

const { executeRegistrarPartoComCrias } = await import("./registrarPartoComCrias");

function tableLabel(table: unknown): string {
  if (table === reproducaoRegistros) return "reproducaoRegistros";
  if (table === animais) return "animais";
  if (table === partoCrias) return "partoCrias";
  if (table === pesagens) return "pesagens";
  return "unknown";
}

function inserts(table: unknown) {
  return txOps.filter(op => op.kind === "insert" && op.table === table) as Array<{
    kind: "insert";
    table: unknown;
    values: Record<string, unknown>;
  }>;
}

describe("executeRegistrarPartoComCrias — transação MySQL (mock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brincoCall = 0;
    brincoFailAfter = Infinity;
    pesagemShouldFail = false;
    mockValidatePreconditions.mockImplementation(async (_userId, input) => ({
      animal: { sexo: "femea", loteId: 5, pastoId: 9, categoria: "Vaca" },
      dataISO: String(input.dataCobertura).trim().slice(0, 10),
      fazendaId: 1,
    }));
    mockAssertBrincoDb.mockImplementation(async () => {
      brincoCall += 1;
      if (brincoCall >= brincoFailAfter) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Brinco duplicado simulado" });
      }
    });
    mockAssertRfid.mockResolvedValue(undefined);
    reproRegistrosFemea = [
      { tipo: "Cobertura", machoId: 77, dataCobertura: "2025-05-01" },
    ];
  });

  it("usa femeaId como PK interna — maeId da cria = 15, não brinco 58", async () => {
    const result = await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Normal",
      crias: [{ brinco: "58", sexo: "macho", categoria: "Bezerro" }],
    });

    expect(result.crias).toHaveLength(1);
    const animalRow = inserts(animais)[0]?.values;
    expect(animalRow?.maeId).toBe(15);
    expect(animalRow?.brinco).toBe("58");
    expect(animalRow?.dataNascimento).toBe("2025-08-24");
    expect(animalRow?.paiId).toBe(77);
    expect(transactionCommitted).toBe(true);
  });

  it("natimorto: Parto sim, sem animal, parto_crias ou pesagem", async () => {
    mockValidatePreconditions.mockResolvedValue({
      animal: { sexo: "femea", loteId: 5, pastoId: 9, categoria: "Vaca" },
      dataISO: "2025-08-24",
      fazendaId: 1,
    });

    const result = await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Natimorto",
    });

    expect(result.isNatimorto).toBe(true);
    expect(inserts(reproducaoRegistros)).toHaveLength(1);
    expect(inserts(animais)).toHaveLength(0);
    expect(inserts(partoCrias)).toHaveLength(0);
    expect(inserts(pesagens)).toHaveLength(0);
    expect(txOps.some(op => op.kind === "update")).toBe(true);
  });

  it("pesoNascimento: uma pesagem com data do parto", async () => {
    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Normal",
      crias: [{ brinco: "901", sexo: "femea", categoria: "Bezerra", pesoNascimento: "32.5" }],
    });

    const animalRow = inserts(animais)[0]?.values;
    expect(animalRow?.pesoAtual).toBe("32.5");
    expect(inserts(pesagens)).toHaveLength(1);
    expect(inserts(pesagens)[0]?.values.peso).toBe("32.5");
    expect(inserts(pesagens)[0]?.values.observacoes).toBe("Peso ao nascimento");
  });

  it("sem peso: animal sem pesoAtual e zero pesagens", async () => {
    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Normal",
      crias: [{ brinco: "902", sexo: "macho", categoria: "Bezerro" }],
    });

    expect(inserts(animais)[0]?.values.pesoAtual).toBeUndefined();
    expect(inserts(pesagens)).toHaveLength(0);
  });

  it("duas crias: ordem 1 e 2, mesmo maeId", async () => {
    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Com assistência",
      crias: [
        { brinco: "A1", sexo: "macho", categoria: "Bezerro" },
        { brinco: "A2", sexo: "femea", categoria: "Bezerra" },
      ],
    });

    expect(inserts(animais)).toHaveLength(2);
    expect(inserts(partoCrias)).toHaveLength(2);
    expect(inserts(partoCrias).map(op => op.values.ordem)).toEqual([1, 2]);
    expect(inserts(animais).every(op => op.values.maeId === 15)).toBe(true);
  });

  it("brinco duplicado na 1ª cria: rollback — nenhuma operação commitada", async () => {
    brincoFailAfter = 1;
    await expect(
      executeRegistrarPartoComCrias(1, {
        femeaId: 15,
        fazendaId: 1,
        dataParto: "2025-08-24",
        resultado: "Normal",
        crias: [{ brinco: "DUP", sexo: "macho", categoria: "Bezerro" }],
      }),
    ).rejects.toThrow("Brinco duplicado simulado");

    expect(transactionRolledBack).toBe(true);
    expect(transactionCommitted).toBe(false);
    expect(txOps).toHaveLength(0);
    expect(mockUpdateLocalAnimal).not.toHaveBeenCalled();
  });

  it("2ª cria inválida: rollback completo (inclui Parto e 1ª cria)", async () => {
    brincoFailAfter = 2;
    await expect(
      executeRegistrarPartoComCrias(1, {
        femeaId: 15,
        fazendaId: 1,
        dataParto: "2025-08-24",
        resultado: "Normal",
        crias: [
          { brinco: "OK1", sexo: "macho", categoria: "Bezerro" },
          { brinco: "BAD", sexo: "femea", categoria: "Bezerra" },
        ],
      }),
    ).rejects.toThrow("Brinco duplicado simulado");

    expect(transactionRolledBack).toBe(true);
    expect(transactionCommitted).toBe(false);
    expect(txOps).toHaveLength(0);
  });

  it("falha na pesagem: rollback completo", async () => {
    pesagemShouldFail = true;
    await expect(
      executeRegistrarPartoComCrias(1, {
        femeaId: 15,
        fazendaId: 1,
        dataParto: "2025-08-24",
        resultado: "Normal",
        crias: [{ brinco: "P1", sexo: "macho", categoria: "Bezerro", pesoNascimento: "30" }],
      }),
    ).rejects.toThrow("Falha simulada na pesagem");

    expect(transactionCommitted).toBe(false);
    expect(txOps).toHaveLength(0);
    expect(mockUpdateLocalAnimal).not.toHaveBeenCalled();
  });

  it("retry após sucesso: 2ª chamada falha no brinco e não commita Parto", async () => {
    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Normal",
      crias: [{ brinco: "R1", sexo: "macho", categoria: "Bezerro" }],
    });

    brincoFailAfter = 1;
    await expect(
      executeRegistrarPartoComCrias(1, {
        femeaId: 15,
        fazendaId: 1,
        dataParto: "2025-08-24",
        resultado: "Normal",
        crias: [{ brinco: "R1", sexo: "macho", categoria: "Bezerro" }],
      }),
    ).rejects.toThrow("Brinco duplicado simulado");

    expect(inserts(reproducaoRegistros)).toHaveLength(0);
  });

  it("espelho local só após commit MySQL", async () => {
    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Normal",
      crias: [{ brinco: "M1", sexo: "macho", categoria: "Bezerro" }],
    });

    expect(transactionCommitted).toBe(true);
    expect(mockUpdateLocalAnimal).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocalAnimal.mock.calls[0]?.[1]).toBeGreaterThan(100);
  });

  it("ordem das operações: Parto → fechar previsões → animal → parto_crias → pesagem", async () => {
    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Normal",
      crias: [{ brinco: "O1", sexo: "macho", categoria: "Bezerro", pesoNascimento: "28" }],
    });

    const labels = txOps.map(op => {
      if (op.kind === "update") return "updatePrevisao";
      return tableLabel(op.table);
    });
    expect(labels).toEqual([
      "reproducaoRegistros",
      "updatePrevisao",
      "animais",
      "partoCrias",
      "pesagens",
    ]);
  });

  it("paiId null quando concepção sem machoId", async () => {
    reproRegistrosFemea = [
      { tipo: "Inseminação", machoId: null, dataCobertura: "2025-05-01" },
    ];

    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2025-08-24",
      resultado: "Normal",
      crias: [{ brinco: "S1", sexo: "macho", categoria: "Bezerro" }],
    });

    expect(inserts(animais)[0]?.values.paiId).toBeUndefined();
  });

  it("RFID duplicado: rollback completo", async () => {
    mockAssertRfid.mockRejectedValue(
      new TRPCError({ code: "BAD_REQUEST", message: "RFID duplicado simulado" }),
    );

    await expect(
      executeRegistrarPartoComCrias(1, {
        femeaId: 15,
        fazendaId: 1,
        dataParto: "2025-08-24",
        resultado: "Normal",
        crias: [{ brinco: "RF1", sexo: "macho", categoria: "Bezerro", brincoEletronico: "E0001" }],
      }),
    ).rejects.toThrow("RFID duplicado simulado");

    expect(transactionCommitted).toBe(false);
    expect(txOps).toHaveLength(0);
  });

  it("A/H) Cobertura estruturada id=7 brinco=16 → cria.paiId=7, nunca 16", async () => {
    reproRegistrosFemea = [
      { tipo: "Cobertura", machoId: 7, dataCobertura: "2026-08-25" },
    ];

    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2027-06-04",
      resultado: "Normal",
      crias: [{ brinco: "TEST-PAI-001", sexo: "macho", categoria: "Bezerro" }],
    });

    const animalRow = inserts(animais)[0]?.values;
    expect(animalRow?.maeId).toBe(15);
    expect(animalRow?.paiId).toBe(7);
    expect(animalRow?.paiId).not.toBe(16);
  });

  it("B) Inseminação estruturada → cria.paiId=7", async () => {
    reproRegistrosFemea = [
      { tipo: "Inseminação", machoId: 7, dataCobertura: "2026-03-01" },
    ];

    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2026-12-01",
      resultado: "Normal",
      crias: [{ brinco: "TEST-INS-001", sexo: "macho", categoria: "Bezerro" }],
    });

    expect(inserts(animais)[0]?.values.paiId).toBe(7);
  });

  it("D) duas crias recebem o mesmo paiId e ordem 1/2", async () => {
    reproRegistrosFemea = [
      { tipo: "Cobertura", machoId: 7, dataCobertura: "2026-08-25" },
    ];

    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2027-06-04",
      resultado: "Normal",
      crias: [
        { brinco: "DUA-1", sexo: "macho", categoria: "Bezerro" },
        { brinco: "DUA-2", sexo: "femea", categoria: "Bezerra" },
      ],
    });

    const animalRows = inserts(animais);
    expect(animalRows).toHaveLength(2);
    expect(animalRows.every(op => op.values.maeId === 15)).toBe(true);
    expect(animalRows.every(op => op.values.paiId === 7)).toBe(true);
    expect(inserts(partoCrias).map(op => op.values.ordem)).toEqual([1, 2]);
    const partoId = inserts(reproducaoRegistros)[0]?.values;
    expect(partoId?.tipo).toBe("Parto");
    expect(inserts(partoCrias).every(op => op.values.partoRegistroId != null)).toBe(true);
  });

  it("G) genealogiaDisplay — mãe 58, pai 16 a partir de PKs estruturadas", () => {
    const parentMap = new Map([
      [15, { id: 15, brinco: "58" }],
      [7, { id: 7, brinco: "16" }],
    ]);
    const display = resolveGenealogiaDisplay(
      { maeId: 15, paiId: 7, mae: "x", pai: "y" },
      parentMap,
    );
    expect(display).toEqual({ mae: "58", pai: "16" });
    expect(display.pai).not.toBe("7");
    expect(display.mae).not.toBe("15");
  });

  it("crias 300/301 — Parto 24/08/2026 sem machoId estruturado no ciclo → paiId null", async () => {
    reproRegistrosFemea = [
      { tipo: "Cobertura", machoId: null, dataCobertura: "2025-11-14" },
    ];

    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2026-08-24",
      resultado: "Normal",
      crias: [{ brinco: "300", sexo: "macho", categoria: "Bezerro" }],
    });

    expect(inserts(animais)[0]?.values.paiId).toBeUndefined();
    expect(inserts(animais)[0]?.values.maeId).toBe(15);
  });

  it("F) ciclo antigo encerrado por Parto — sem nova concepção → paiId null", async () => {
    reproRegistrosFemea = [
      { tipo: "Cobertura", machoId: 10, dataCobertura: "2025-01-01" },
      { tipo: "Parto", machoId: null, dataCobertura: "2025-10-01", resultado: "Normal" },
    ];

    await executeRegistrarPartoComCrias(1, {
      femeaId: 15,
      fazendaId: 1,
      dataParto: "2026-06-01",
      resultado: "Normal",
      crias: [{ brinco: "POS-PARTO", sexo: "macho", categoria: "Bezerro" }],
    });

    expect(inserts(animais)[0]?.values.paiId).toBeUndefined();
  });
});
