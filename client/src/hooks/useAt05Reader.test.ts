import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getAt05SharedSessionSnapshot,
  shutdownAt05SharedSession,
} from "@/hooks/useAt05Reader";

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(resolve(here, "useAt05Reader.ts"), "utf8");

describe("shutdownAt05SharedSession — liberação idempotente", () => {
  it("shutdown sem sessão aberta conclui sem erro", async () => {
    await shutdownAt05SharedSession("test-noop");
    const snap = getAt05SharedSessionSnapshot();
    expect(snap.hasReader).toBe(false);
    expect(snap.hasRxLoop).toBe(false);
    expect(snap.shuttingDown).toBe(false);
    expect(snap.status).toBe("disconnected");
  });

  it("shutdown chamado duas vezes em paralelo não explode", async () => {
    const [a, b] = await Promise.all([
      shutdownAt05SharedSession("test-parallel-a"),
      shutdownAt05SharedSession("test-parallel-b"),
    ]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    const snap = getAt05SharedSessionSnapshot();
    expect(snap.hasReader).toBe(false);
    expect(snap.shuttingDown).toBe(false);
    expect(snap.status).toBe("disconnected");
  });

  it("connect resolve a porta antes do cleanup para não perder o gesto do requestPort", () => {
    expect(hookSrc.indexOf("RESOLVE PORT START")).toBeLessThan(
      hookSrc.indexOf('shutdownAt05SharedSession("pre-open-other-port")'),
    );
    expect(hookSrc).toContain("startRxLoop(port, connectGen)");
    expect(hookSrc).toContain("resolveAt05PortForConnect");
    expect(hookSrc).toContain("rxProvenPort");
    expect(hookSrc).toContain("requestPortFromUserGesture");
    expect(hookSrc).not.toContain("preferredPort");
    expect(hookSrc).not.toContain("noteAt05Diag");
    expect(hookSrc).not.toContain("closeAt05PortForFreshOpen");
  });

  it("shutdown sequencial repetido permanece idempotente", async () => {
    await shutdownAt05SharedSession("test-seq-1");
    await shutdownAt05SharedSession("test-seq-2");
    await shutdownAt05SharedSession("test-seq-3");
    const snap = getAt05SharedSessionSnapshot();
    expect(snap.serviceConnected).toBe(false);
    expect(snap.portOpen).toBe(false);
    expect(snap.status).toBe("disconnected");
  });
});
