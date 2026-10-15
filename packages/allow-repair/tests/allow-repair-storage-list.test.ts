import { RepairNotAllowedError, type IMiddleware } from "@unikvs/core";
import {
  captureRejection,
  createNext,
  createRepairContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import AllowRepair from "../src/allow-repair.js";

/**
 * 修復コンテキストで use を実行し、拒否理由を返します。
 * 書き戻し先の表示名転送を検証するために使用します。
 */
async function useRepairError(
  gate: AllowRepair,
  key: string,
  targets: readonly string[],
): Promise<RepairNotAllowedError> {
  return (await captureRejection(
    gate.use(
      createRepairContext(key, targets, { source: "x" }) as IMiddleware.UseContext,
      createNext(),
    ),
  )) as RepairNotAllowedError;
}

describe("targets の転送", () => {
  test("単一要素のときはその名を含む", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = await useRepairError(gate, "k1", ["cache"]);

    // 検証
    expect(error.meta).toStrictEqual({ names: ["cache"] });
    expect(error.message).toBe('Repair writes via "cache" are not allowed');
  });

  test("複数要素のときは列挙を含む", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = await useRepairError(gate, "k1", ["a", "b"]);

    // 検証
    expect(error.meta).toStrictEqual({ names: ["a", "b"] });
    expect(error.message).toBe('Repair writes via "a, b" are not allowed');
  });

  test("空配列のときはそのまま転送する", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = await useRepairError(gate, "k1", []);

    // 検証
    expect(error.meta).toStrictEqual({ names: [] });
    expect(error.message).toBe('Repair writes via "(unknown)" are not allowed');
  });

  test("stream の書き戻しでも対象名が転送される", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行
    const error = (await captureRejection(
      gate.use(
        createStreamContext("k1", {
          repair: { enabled: true, targets: ["cache"] },
        }) as IMiddleware.UseContext,
        createNext(),
      ),
    )) as RepairNotAllowedError;

    // 検証
    expect(error.meta).toStrictEqual({ names: ["cache"] });
    expect(error.message).toBe('Repair writes via "cache" are not allowed');
  });
});
