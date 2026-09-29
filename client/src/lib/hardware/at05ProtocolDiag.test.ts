import { describe, expect, it, vi } from "vitest";
import {
  at05OnlineEventShouldEndSerialSession,
  createAt05OnlineCrlfBuffer,
  createAt05OnlineRxProcessor,
  interpretAt05OnlineLine,
} from "./at05ProtocolDiag";
import { decidirLeituraAt05RecebimentoCompra } from "../compraRecebimentoAt05";

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

describe("buffer AT05 — protocolo físico (CR / LF / CRLF + chunks)", () => {
  it("completa RFID real com CR isolado, LF ou CRLF", () => {
    const cr = createAt05OnlineCrlfBuffer();
    const lf = createAt05OnlineCrlfBuffer();
    const crlf = createAt05OnlineCrlfBuffer();
    expect(cr.push("963000400291061\r")).toEqual(["963000400291061"]);
    expect(lf.push("963000400291061\n")).toEqual(["963000400291061"]);
    expect(crlf.push("963000400291061\r\n")).toEqual(["963000400291061"]);
  });

  it("reconstrói RFID real partido em chunks sem inventar linha cedo", () => {
    const buf = createAt05OnlineCrlfBuffer();
    expect(buf.push("963000400")).toEqual([]);
    expect(buf.getPending()).toBe("963000400");
    expect(buf.push("291061\r")).toEqual(["963000400291061"]);
    expect(buf.getPending()).toBe("");
  });

  it("AT+SPPCONN / AT+SPPDISC com CRLF e CR extra continuam fechando a linha", () => {
    const buf = createAt05OnlineCrlfBuffer();
    expect(buf.push("AT+SPPCONN=ECBDA7F30A3C\r\n")).toEqual(["AT+SPPCONN=ECBDA7F30A3C"]);
    expect(buf.push("AT+SPPDISC\r\r\n")).toEqual(["AT+SPPDISC"]);
  });

  it("processor entrega IDENTIFICAÇÃO RFID com CR isolado (amostra física)", () => {
    const received: string[] = [];
    const processor = createAt05OnlineRxProcessor({
      sameRfidDedupeMs: 0,
      onIdentificationRfid: rfid => {
        received.push(rfid);
      },
    });
    processor.pushChunk("9630004");
    expect(received).toEqual([]);
    processor.pushChunk("00291061\r");
    expect(received).toEqual(["963000400291061"]);
  });

  it("pipeline Compra: bytes decodificados → identificação → campo RFID", () => {
    const received: string[] = [];
    const processor = createAt05OnlineRxProcessor({
      sameRfidDedupeMs: 0,
      onIdentificationRfid: rfid => {
        received.push(rfid);
      },
    });
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const bytes = new TextEncoder().encode("963000400291061\r");
    processor.pushChunk(decoder.decode(bytes, { stream: true }));
    expect(received).toEqual(["963000400291061"]);
    const decisao = decidirLeituraAt05RecebimentoCompra({
      line: received[0]!,
      aceitandoLeituras: true,
      cicloAtual: 1,
      cicloDaLeitura: 1,
    });
    expect(decisao).toEqual({ aplicar: true, rfid: "963000400291061" });
  });

  it("flushPending emite RFID completo sem terminador (chunk SPP único)", () => {
    const received: string[] = [];
    const processor = createAt05OnlineRxProcessor({
      sameRfidDedupeMs: 0,
      onIdentificationRfid: rfid => {
        received.push(rfid);
      },
    });
    processor.pushChunk("963000400650144");
    expect(received).toEqual([]);
    expect(processor.flushPending()).toHaveLength(1);
    expect(received).toEqual(["963000400650144"]);
  });

  it("flushPending não dispara em fragmento curto", () => {
    const received: string[] = [];
    const processor = createAt05OnlineRxProcessor({
      sameRfidDedupeMs: 0,
      onIdentificationRfid: rfid => {
        received.push(rfid);
      },
    });
    processor.pushChunk("96300");
    expect(processor.flushPending()).toEqual([]);
    expect(received).toEqual([]);
  });
});
