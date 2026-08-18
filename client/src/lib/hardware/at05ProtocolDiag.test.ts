import { describe, expect, it, vi } from "vitest";
import {
  at05OnlineEventShouldEndSerialSession,
  createAt05OnlineRxProcessor,
  interpretAt05OnlineLine,
} from "./at05ProtocolDiag";

describe("interpretAt05OnlineLine — cartões de função por ID exato", () => {
  it("classifica ENVIAR MICROCHIP", () => {
    const ev = interpretAt05OnlineLine("999090000000065");
    expect(ev.tipo).toBe("CARTÃO DE FUNÇÃO");
    expect(ev.functionName).toBe("ENVIAR MICROCHIP");
    expect(ev.rfid).toBe("999090000000065");
    expect(ev.onlineMode).toBeUndefined();
  });

  it("classifica CONTAGEM", () => {
    const ev = interpretAt05OnlineLine("999090000000055");
    expect(ev.tipo).toBe("CARTÃO DE FUNÇÃO");
    expect(ev.functionName).toBe("CONTAGEM");
  });

  it("classifica CONFIGURAÇÃO", () => {
    const ev = interpretAt05OnlineLine("999090000000062");
    expect(ev.tipo).toBe("CARTÃO DE FUNÇÃO");
    expect(ev.functionName).toBe("CONFIGURAÇÃO");
  });

  it("brinco animal permanece IDENTIFICAÇÃO RFID", () => {
    expect(interpretAt05OnlineLine("963000400291061").tipo).toBe("IDENTIFICAÇÃO RFID");
    expect(interpretAt05OnlineLine("963000400315712").tipo).toBe("IDENTIFICAÇÃO RFID");
  });

  it("999090000000099 não comprovado → IDENTIFICAÇÃO RFID (não cartão)", () => {
    const ev = interpretAt05OnlineLine("999090000000099");
    expect(ev.tipo).toBe("IDENTIFICAÇÃO RFID");
    expect(ev.functionName).toBeUndefined();
  });

  it("AT+SPPCONN / AT+SPPDISC controlam estado observado", () => {
    const conn = interpretAt05OnlineLine("AT+SPPCONN=ECBDA7F30A3C");
    expect(conn.tipo).toBe("CONEXÃO");
    expect(conn.onlineMode).toBe("CONECTADO");
    const disc = interpretAt05OnlineLine("AT+SPPDISC");
    expect(disc.tipo).toBe("CONEXÃO");
    expect(disc.onlineMode).toBe("DESCONECTADO");
  });
});

describe("sessão serial contínua após IDENTIFICAÇÃO RFID", () => {
  it("processar IDENTIFICAÇÃO RFID NÃO encerra a sessão serial", () => {
    const ev = interpretAt05OnlineLine("963000400291061");
    expect(ev.tipo).toBe("IDENTIFICAÇÃO RFID");
    expect(at05OnlineEventShouldEndSerialSession(ev)).toBe(false);
  });

  it("cartão / CONN / DISC também NÃO encerram a sessão serial", () => {
    expect(
      at05OnlineEventShouldEndSerialSession(interpretAt05OnlineLine("999090000000055")),
    ).toBe(false);
    expect(
      at05OnlineEventShouldEndSerialSession(
        interpretAt05OnlineLine("AT+SPPCONN=ECBDA7F30A3C"),
      ),
    ).toBe(false);
    expect(
      at05OnlineEventShouldEndSerialSession(interpretAt05OnlineLine("AT+SPPDISC")),
    ).toBe(false);
  });

  it("mesma sessão processa vários RFIDs consecutivos (incl. repetidos após dedupe)", () => {
    const received: string[] = [];
    const processor = createAt05OnlineRxProcessor({
      sameRfidDedupeMs: 0,
      onIdentificationRfid: rfid => {
        received.push(rfid);
      },
    });

    processor.pushChunk("963000400291061\r\n");
    processor.pushChunk("963000400291061\r\n");
    processor.pushChunk("963000400291061\r\n");
    processor.pushChunk("999090000000055\r\n"); // CONTAGEM — não RFID animal
    processor.pushChunk("963000400315712\r\n");

    expect(received).toEqual([
      "963000400291061",
      "963000400291061",
      "963000400291061",
      "963000400315712",
    ]);
    expect(processor.getIdentificationCount()).toBe(4);
  });

  it("anti-bounce ignora só o eco imediato do mesmo RFID; sessão segue", () => {
    vi.useFakeTimers();
    const received: string[] = [];
    const processor = createAt05OnlineRxProcessor({
      sameRfidDedupeMs: 250,
      onIdentificationRfid: rfid => {
        received.push(rfid);
      },
    });

    processor.pushChunk("963000400291061\r\n");
    processor.pushChunk("963000400291061\r\n"); // bounce
    expect(received).toEqual(["963000400291061"]);

    vi.advanceTimersByTime(300);
    processor.pushChunk("963000400291061\r\n");
    expect(received).toEqual(["963000400291061", "963000400291061"]);
    expect(
      at05OnlineEventShouldEndSerialSession(interpretAt05OnlineLine("963000400291061")),
    ).toBe(false);

    vi.useRealTimers();
  });
});
