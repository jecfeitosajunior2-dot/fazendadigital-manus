import { describe, expect, it } from "vitest";
import {
  getAt05SharedSessionSnapshot,
  shutdownAt05SharedSession,
} from "@/hooks/useAt05Reader";

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
