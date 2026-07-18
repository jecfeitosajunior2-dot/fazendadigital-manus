import { describe, it, expect } from "vitest";
import {
  calcDiasMovimentacaoLote,
  displaySaidaMovimentacaoLote,
  formatTempoNoPastoMovimentacaoLote,
  labelEntradaMovimentacaoLote,
  ordenarHistoricoMovimentacaoLote,
  statusMovimentacaoLote,
  temOrigemHistoricoLote,
  tituloRegistroHistoricoLote,
} from "../shared/historicoMovimentacaoLote";

const HOJE = "2026-07-18";

describe("statusMovimentacaoLote", () => {
  it("Teste 1 — movimentação atual sem saída", () => {
    const row = { dataEntrada: HOJE, dataSaida: null };
    expect(statusMovimentacaoLote(row, HOJE)).toBe("atual");
    expect(labelEntradaMovimentacaoLote(row, HOJE)).toBe("Entrada");
    expect(displaySaidaMovimentacaoLote(row, HOJE)).toEqual({ tipo: "em_andamento" });
    expect(formatTempoNoPastoMovimentacaoLote(row, HOJE)).toBe("0 dias no pasto");
  });

  it("Teste 2 — movimentação encerrada com dias", () => {
    const row = {
      dataEntrada: "2026-07-15",
      dataSaida: "2026-07-21",
      diasNoPasto: 3,
    };
    expect(statusMovimentacaoLote(row, HOJE)).toBe("encerrada");
    expect(displaySaidaMovimentacaoLote(row, HOJE)).toEqual({
      tipo: "data",
      dataISO: "2026-07-21",
    });
    expect(formatTempoNoPastoMovimentacaoLote(row, HOJE)).toBe("3 dias no pasto");
    expect(calcDiasMovimentacaoLote(row, HOJE)).toBe(3);
  });

  it("Teste 3 — movimentação agendada com entrada futura", () => {
    const row = { dataEntrada: "2026-07-22", dataSaida: null };
    expect(statusMovimentacaoLote(row, HOJE)).toBe("agendada");
    expect(labelEntradaMovimentacaoLote(row, HOJE)).toBe("Entrada prevista");
    expect(displaySaidaMovimentacaoLote(row, HOJE)).toEqual({ tipo: "vazio" });
    expect(formatTempoNoPastoMovimentacaoLote(row, HOJE)).toBeNull();
  });

  it("Teste 4 — registro inicial: sem origem, destino preenchido", () => {
    const row = {
      dataEntrada: HOJE,
      dataSaida: null,
      pastoOrigemId: null,
      pastoOrigemNome: null,
      pastoDestinoNome: "Pasto 05",
    };
    expect(temOrigemHistoricoLote(row.pastoOrigemId, row.pastoOrigemNome)).toBe(false);
    expect(tituloRegistroHistoricoLote(row)).toBe("Registro inicial no Pasto 05");
  });

  it("ordenação — atual antes de encerrada", () => {
    const rows = [
      { id: 1, dataEntrada: "2026-07-10", dataSaida: "2026-07-15" },
      { id: 2, dataEntrada: "2026-07-12", dataSaida: null },
      { id: 3, dataEntrada: HOJE, dataSaida: null },
    ];
    const ordenado = ordenarHistoricoMovimentacaoLote(rows, HOJE);
    expect(ordenado.map(r => r.id)).toEqual([3, 2, 1]);
  });
});
