import { describe, expect, it } from "vitest";
import {
  formatPartoCriasDetalhes,
  formatReproDetalhesTabela,
  unpackReproObservacoes,
} from "../shared/reproRegistroMeta";

describe("formatPartoCriasDetalhes", () => {
  it("singular para uma cria", () => {
    expect(
      formatPartoCriasDetalhes([{ animalId: 1, brinco: "301", ordem: 1 }]),
    ).toBe("Cria: 301");
  });

  it("plural para várias crias na ordem do parto", () => {
    expect(
      formatPartoCriasDetalhes([
        { animalId: 2, brinco: "302", ordem: 2 },
        { animalId: 1, brinco: "301", ordem: 1 },
      ]),
    ).toBe("Crias: 301, 302");
  });

  it("retorna null sem crias", () => {
    expect(formatPartoCriasDetalhes([])).toBeNull();
  });
});

describe("formatReproDetalhesTabela — Parto com crias", () => {
  const meta = unpackReproObservacoes(null);

  it("mostra Cria: 301 em Parto Normal", () => {
    const detalhes = formatReproDetalhesTabela(
      {
        tipo: "Parto",
        crias: [{ animalId: 1, brinco: "301", ordem: 1 }],
      },
      meta,
    );
    expect(detalhes).toBe("Cria: 301");
  });

  it("mostra Crias: 301, 302 em Parto Com assistência", () => {
    const detalhes = formatReproDetalhesTabela(
      {
        tipo: "Parto",
        crias: [
          { animalId: 1, brinco: "301", ordem: 1 },
          { animalId: 2, brinco: "302", ordem: 2 },
        ],
      },
      meta,
    );
    expect(detalhes).toBe("Crias: 301, 302");
  });

  it("Natimorto sem crias retorna string vazia (UI exibe —)", () => {
    const detalhes = formatReproDetalhesTabela({ tipo: "Parto" }, meta);
    expect(detalhes).toBe("");
  });

  it("Parto legado sem crias no registro continua sem erro", () => {
    const detalhes = formatReproDetalhesTabela(
      { tipo: "Parto", dataPrevistoParto: null },
      meta,
    );
    expect(detalhes).toBe("");
  });

  it("preserva outros detalhes existentes junto com crias", () => {
    const metaComReprodutor = unpackReproObservacoes(
      'Obs livre\n__fd_repro__{"r":"Touro X"}__end__',
    );
    const detalhes = formatReproDetalhesTabela(
      {
        tipo: "Parto",
        crias: [{ animalId: 1, brinco: "301", ordem: 1 }],
      },
      metaComReprodutor,
    );
    expect(detalhes).toBe("Touro X · Cria: 301");
  });
});
