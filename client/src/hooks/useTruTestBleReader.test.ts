import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getTruTestBleSharedSnapshot,
  shutdownTruTestBleSharedSession,
} from "@/hooks/useTruTestBleReader";

const hookSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "useTruTestBleReader.ts"),
  "utf8",
);

describe("shutdownTruTestBleSharedSession", () => {
  it("shutdown sem sessão BLE conclui sem erro", async () => {
    await shutdownTruTestBleSharedSession("test-noop");
    const snap = getTruTestBleSharedSnapshot();
    expect(snap.gattConnected).toBe(false);
    expect(snap.status).toBe("disconnected");
  });
});

describe("visor atual da S3 via BLE", () => {
  it("pede {RW} no NUS quando o 0x2A9D não reenvia o peso travado", () => {
    expect(hookSrc).toContain("requestWeightViaNusRw");
    expect(hookSrc).toContain("nusWrite");
    expect(hookSrc).toContain("nusNotify");
    expect(hookSrc).toContain("lastWeightAt");
    expect(hookSrc).not.toContain("NUS detected (unused)");
  });
});
