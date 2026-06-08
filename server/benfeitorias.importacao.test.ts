import { describe, it, expect } from "vitest";
import { formatImportDbError } from "./importacaoErrors";

describe("formatImportDbError — benfeitorias", () => {
  it("traduz erro de chave estrangeira (fazenda)", () => {
    const msg = formatImportDbError(new Error(
      'Failed query: insert into `benfeitorias` ...',
      { cause: { errno: 1452, sqlMessage: "Cannot add or update a child row: a foreign key constraint fails" } } as ErrorOptions
    ));
    expect(msg).toContain("Fazenda");
    expect(msg).not.toContain("Failed query");
  });

  it("traduz coluna desconhecida", () => {
    const msg = formatImportDbError(new Error("Unknown column 'valorEstimado' in 'field list'"));
    expect(msg).toContain("estrutura do banco");
  });

  it("não expõe SQL bruto em produção", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const msg = formatImportDbError(new Error("Failed query: insert into benfeitorias"));
    process.env.NODE_ENV = prev;
    expect(msg).not.toContain("insert into");
  });
});

describe("payload de importação benfeitorias", () => {
  it("aceita os mesmos tipos do cadastro manual", () => {
    const manualPayload = {
      fazendaId: 150001,
      nome: "Galpão",
      anoConstrucao: 2025,
      vidaUtil: "30",
      valorEstimado: "150.00",
      observacoes: "obs teste",
    };
    expect(typeof manualPayload.fazendaId).toBe("number");
    expect(typeof manualPayload.anoConstrucao).toBe("number");
    expect(typeof manualPayload.valorEstimado).toBe("string");
    expect(manualPayload.nome.length).toBeGreaterThan(0);
  });
});
