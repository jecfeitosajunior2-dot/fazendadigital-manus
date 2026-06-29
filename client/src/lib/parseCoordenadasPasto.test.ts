import { describe, it, expect } from "vitest";
import { parseCoordenadasPasto, parseFazendaCentro } from "@/lib/parseCoordenadasPasto";

describe("parseCoordenadasPasto", () => {
  it("converte coordinates KML em lat/lng", () => {
    const json = JSON.stringify({
      coordinates: "-45.96,-7.52,0 -45.97,-7.53,0 -45.96,-7.52,0",
    });
    const path = parseCoordenadasPasto(json);
    expect(path).toEqual([
      { lat: -7.52, lng: -45.96 },
      { lat: -7.53, lng: -45.97 },
      { lat: -7.52, lng: -45.96 },
    ]);
  });

  it("retorna null para payload inválido", () => {
    expect(parseCoordenadasPasto(null)).toBeNull();
    expect(parseCoordenadasPasto("{}")).toBeNull();
  });
});

describe("parseFazendaCentro", () => {
  it("lê latitude e longitude da fazenda", () => {
    expect(parseFazendaCentro("-7.52", "-45.96")).toEqual({ lat: -7.52, lng: -45.96 });
  });
});
