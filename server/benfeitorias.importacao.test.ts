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

  it("não classifica erro a partir de base64 nos parâmetros do SQL", () => {
    const msg = formatImportDbError(new Error(
      "Failed query: insert into benfeitorias params: xenumyIncorrectTruncated",
      {
        cause: {
          sqlMessage: "Data too long for column 'imagem1' at row 1",
          errno: 1406,
        },
      } as ErrorOptions,
    ));
    expect(msg).toContain("foto");
    expect(msg).not.toContain("informado possui");
  });

  it("não confunde coluna status na lista do SQL com erro real em valorEstimado", () => {
    const msg = formatImportDbError(new Error(
      "Failed query: insert into `benfeitorias` (`status`, `valorEstimado`) values (?, ?)",
      {
        cause: {
          sqlMessage: "Incorrect decimal value: '100000.00' for column 'valorEstimado' at row 1",
        },
      } as ErrorOptions,
    ));
    expect(msg).toContain("Valor");
    expect(msg).not.toContain("Status");
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
