import { describe, expect, it } from "vitest";
import {
  getTruTestBleSharedSnapshot,
  shutdownTruTestBleSharedSession,
} from "@/hooks/useTruTestBleReader";

describe("shutdownTruTestBleSharedSession", () => {
  it("shutdown sem sessão BLE conclui sem erro", async () => {
    await shutdownTruTestBleSharedSession("test-noop");
    const snap = getTruTestBleSharedSnapshot();
    expect(snap.gattConnected).toBe(false);
    expect(snap.status).toBe("disconnected");
  });
});
