import { describe, expect, it } from "vitest";
import { isLocalHomologHost } from "./localHomologHost";
import { sessionCookieOptions } from "./cookies";

describe("localhost homolog — cookie e host", () => {
  it("reconhece só hosts locais", () => {
    expect(isLocalHomologHost("localhost")).toBe(true);
    expect(isLocalHomologHost("127.0.0.1:3000")).toBe(true);
    expect(isLocalHomologHost("app.fazendadigital.com")).toBe(false);
  });

  it("não marca Secure em localhost; marca em host externo em production", () => {
    const local = sessionCookieOptions("localhost");
    const remoto = sessionCookieOptions("app.fazendadigital.com");
    expect(local.secure).toBeUndefined();
    if (process.env.NODE_ENV === "production") {
      expect(remoto.secure).toBe(true);
    }
  });
});
