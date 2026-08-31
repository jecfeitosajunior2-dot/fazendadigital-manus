import { describe, expect, it } from "vitest";
import {
  buildObservacoesHistoricoIdentificacao,
  formatAlteracaoIdentificacao,
  getLinhasAlteracaoIdentificacao,
  listHistoricoIdentificacaoDoAnimal,
  mapHistoricoBrincoToDisplay,
  sortHistoricoIdentificacaoDesc,
  type HistoricoBrincoRow,
} from "../shared/historicoIdentificacao";

const baseRow = (over: Partial<HistoricoBrincoRow>): HistoricoBrincoRow => ({
  id: 1,
  animalId: 10,
  brincoAnterior: "01",
  brincoNovo: "01",
  motivo: "reidentificacao",
  dataAlteracao: "2026-08-20",
  usuarioNome: "Paulo Gomes",
  createdAt: "2026-08-20T12:00:00.000Z",
  observacoes: "",
  ...over,
});

describe("buildObservacoesHistoricoIdentificacao", () => {
  it("Trocar RFID preserva oldRfid e newRfid como string", () => {
    const obs = buildObservacoesHistoricoIdentificacao({
      operacao: "rfid",
      tinhaRfid: true,
      rfidAnterior: "963000400291061",
      rfidNovo: "963000400650124",
    });
    expect(obs).toContain("Trocar RFID");
    expect(obs).toContain("RFID: 963000400291061 → 963000400650124");
    expect(typeof "963000400291061").toBe("string");
    const display = mapHistoricoBrincoToDisplay(
      baseRow({ observacoes: obs }),
    );
    expect(display.rfidAnterior).toBe("963000400291061");
    expect(display.rfidNovo).toBe("963000400650124");
    expect(display.operacao).toBe("rfid");
    expect(display.brincoAnterior).toBeNull();
    expect(display.brincoNovo).toBeNull();
  });

  it("Trocar brinco preserva oldTag e newTag", () => {
    const obs = buildObservacoesHistoricoIdentificacao({
      operacao: "brinco",
      brincoAnterior: "01",
      brincoNovo: "15",
    });
    const display = mapHistoricoBrincoToDisplay(
      baseRow({
        observacoes: obs,
        brincoAnterior: "01",
        brincoNovo: "15",
      }),
    );
    expect(display.operacao).toBe("brinco");
    expect(display.brincoAnterior).toBe("01");
    expect(display.brincoNovo).toBe("15");
    expect(display.rfidAnterior).toBeNull();
    expect(display.rfidNovo).toBeNull();
  });

  it("Trocar brinco e RFID preserva ambos em um único evento", () => {
    const obs = buildObservacoesHistoricoIdentificacao({
      operacao: "ambos",
      tinhaRfid: true,
      rfidAnterior: "963000400291061",
      rfidNovo: "963000400650124",
      brincoAnterior: "01",
      brincoNovo: "22",
      motivo: "reidentificacao",
    });
    const display = mapHistoricoBrincoToDisplay(
      baseRow({
        observacoes: obs,
        brincoAnterior: "01",
        brincoNovo: "22",
      }),
    );
    expect(display.operacao).toBe("ambos");
    expect(display.operacaoLabel).toBe("Trocar brinco visual e RFID");
    expect(display.rfidAnterior).toBe("963000400291061");
    expect(display.rfidNovo).toBe("963000400650124");
    expect(display.brincoAnterior).toBe("01");
    expect(display.brincoNovo).toBe("22");
  });
});

describe("mapHistoricoBrincoToDisplay — legado", () => {
  it("entende rótulo antigo 'Vincular / atualizar RFID'", () => {
    const display = mapHistoricoBrincoToDisplay(
      baseRow({
        observacoes:
          "Vincular / atualizar RFID · RFID: 963000400291061 → 963000400650124",
        motivo: "reidentificacao",
        dataAlteracao: "2026-08-20",
      }),
    );
    expect(display.operacao).toBe("rfid");
    expect(display.operacaoLabel).toBe("Trocar RFID");
    expect(display.rfidAnterior).toBe("963000400291061");
    expect(display.rfidNovo).toBe("963000400650124");
    expect(display.motivoLabel).toBe("Reidentificação");
    expect(display.rfidAnterior).not.toBe(963000400291061 as unknown as string);
  });
});

describe("listHistoricoIdentificacaoDoAnimal", () => {
  it("animal sem histórico retorna vazio", () => {
    expect(listHistoricoIdentificacaoDoAnimal([], 10)).toEqual([]);
  });

  it("histórico de outro animal não aparece", () => {
    const rows = [
      baseRow({
        id: 1,
        animalId: 99,
        observacoes:
          "Trocar RFID · RFID: 111 → 222",
      }),
      baseRow({
        id: 2,
        animalId: 10,
        observacoes:
          "Trocar RFID · RFID: 963000400291061 → 963000400650124",
      }),
    ];
    const list = listHistoricoIdentificacaoDoAnimal(rows, 10);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(2);
    expect(list[0].rfidNovo).toBe("963000400650124");
  });

  it("ordena mais recente primeiro", () => {
    const rows = [
      baseRow({
        id: 1,
        animalId: 10,
        dataAlteracao: "2026-07-15",
        createdAt: "2026-07-15T10:00:00.000Z",
        observacoes: "Trocar brinco · Brinco visual: 01 → 02",
        brincoAnterior: "01",
        brincoNovo: "02",
      }),
      baseRow({
        id: 2,
        animalId: 10,
        dataAlteracao: "2026-08-20",
        createdAt: "2026-08-20T10:00:00.000Z",
        observacoes:
          "Trocar RFID · RFID: 963000400291061 → 963000400650124",
      }),
    ];
    const sorted = sortHistoricoIdentificacaoDesc(rows);
    expect(sorted.map(r => r.id)).toEqual([2, 1]);
    const list = listHistoricoIdentificacaoDoAnimal(rows, 10);
    expect(list.map(r => r.id)).toEqual([2, 1]);
  });

  it("RFID permanece string (sem Number)", () => {
    const display = mapHistoricoBrincoToDisplay(
      baseRow({
        observacoes:
          "Trocar RFID · RFID: 963000400291061 → 963000400650124",
      }),
    );
    expect(typeof display.rfidAnterior).toBe("string");
    expect(typeof display.rfidNovo).toBe("string");
    expect(display.rfidNovo).toBe("963000400650124");
  });
});

describe("formatAlteracaoIdentificacao", () => {
  it("Trocar RFID: label + setas em linhas", () => {
    const display = mapHistoricoBrincoToDisplay(
      baseRow({
        observacoes:
          "Trocar RFID · RFID: 963000400291061 → 963000400650124",
      }),
    );
    expect(formatAlteracaoIdentificacao(display)).toBe(
      "RFID\n963000400291061 → 963000400650124",
    );
    expect(getLinhasAlteracaoIdentificacao(display)).toEqual([
      {
        label: "RFID",
        de: "963000400291061",
        para: "963000400650124",
      },
    ]);
  });

  it("Trocar brinco e RFID: Brinco depois RFID na mesma célula", () => {
    const display = mapHistoricoBrincoToDisplay(
      baseRow({
        observacoes: buildObservacoesHistoricoIdentificacao({
          operacao: "ambos",
          tinhaRfid: true,
          rfidAnterior: "963000400291061",
          rfidNovo: "963000400650124",
          brincoAnterior: "01",
          brincoNovo: "105",
        }),
        brincoAnterior: "01",
        brincoNovo: "105",
      }),
    );
    expect(getLinhasAlteracaoIdentificacao(display)).toEqual([
      { label: "Brinco", de: "01", para: "105" },
      {
        label: "RFID",
        de: "963000400291061",
        para: "963000400650124",
      },
    ]);
  });
});

describe("mapHistoricoBrincoToDisplay — caso real 20/08/2026", () => {
  it("exibe troca RFID do Animal 01 sem inventar dados", () => {
    const display = mapHistoricoBrincoToDisplay({
      id: 9,
      animalId: 5,
      brincoAnterior: "01",
      brincoNovo: "01",
      motivo: "reidentificacao",
      observacoes:
        "Vincular / atualizar RFID · RFID: 963000400291061 → 963000400650124",
      dataAlteracao: "2026-08-20",
      usuarioNome: "Paulo Gomes",
      createdAt: "2026-08-20T13:06:54.355Z",
    });
    expect(display.operacaoLabel).toBe("Trocar RFID");
    expect(display.rfidAnterior).toBe("963000400291061");
    expect(display.rfidNovo).toBe("963000400650124");
    expect(display.motivoLabel).toBe("Reidentificação");
    expect(display.dataAlteracao).toBe("2026-08-20");
    expect(display.brincoAnterior).toBeNull();
    expect(display.brincoNovo).toBeNull();
  });
});

describe("contrato de persistência append-only", () => {
  it("RFID permanece string integral no texto persistido", () => {
    const novo = "963000400650124";
    const obs = buildObservacoesHistoricoIdentificacao({
      operacao: "rfid",
      tinhaRfid: true,
      rfidAnterior: "963000400291061",
      rfidNovo: novo,
    });
    expect(obs).toContain(`RFID: 963000400291061 → ${novo}`);
    expect(obs).not.toMatch(/RFID: \d+e\+/i);
  });
});

describe("consulta oficial na ficha (02 → 7845)", () => {
  it("preserva alteração de brinco e motivo Brinco danificado", () => {
    const display = mapHistoricoBrincoToDisplay({
      id: 12,
      animalId: 2,
      brincoAnterior: "02",
      brincoNovo: "7845",
      motivo: "danificado",
      observacoes: null,
      dataAlteracao: "2026-07-04",
    });
    expect(display.motivoLabel).toBe("Brinco danificado");
    expect(formatAlteracaoIdentificacao(display)).toBe("Brinco\n02 → 7845");
    expect(getLinhasAlteracaoIdentificacao(display)).toEqual([
      { label: "Brinco", de: "02", para: "7845" },
    ]);
  });
});

describe("legado só visual (observacoes nulas)", () => {
  it("infere Trocar brinco pelas colunas", () => {
    const display = mapHistoricoBrincoToDisplay({
      id: 1,
      animalId: 1,
      brincoAnterior: "01",
      brincoNovo: "10",
      motivo: "reidentificacao",
      observacoes: null,
      dataAlteracao: "2026-07-04",
    });
    expect(display.operacao).toBe("brinco");
    expect(display.brincoAnterior).toBe("01");
    expect(display.brincoNovo).toBe("10");
    expect(display.rfidAnterior).toBeNull();
    expect(display.rfidNovo).toBeNull();
  });
});
