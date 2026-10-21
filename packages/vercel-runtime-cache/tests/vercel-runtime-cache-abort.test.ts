import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  captureThrown,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import VercelRuntimeCache from "../src/vercel-runtime-cache.js";

describe("AbortSignal による中断", () => {
  test("中断済みの signal は open と close を中断理由で拒否する", async ({ expect }) => {
    // 準備
    const storage = new VercelRuntimeCache();
    const reason = new Error("テスト用の中断");
    const signal = abortedSignal(reason);

    // 実行と検証
    await expect(storage.open(createOpenContext({ signal }) as IStorage.OpenContext)).rejects.toBe(
      reason,
    );
    await expect(
      storage.close(createCloseContext({ signal }) as IStorage.CloseContext),
    ).rejects.toBe(reason);
  });

  test("中断済みの signal はデータ操作を開始前に拒否する", async ({ expect }) => {
    // 準備
    const storage = new VercelRuntimeCache();
    const reason = new Error("テスト用の中断");
    const signal = abortedSignal(reason);

    // 実行と検証
    await expect(
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1"),
    ).rejects.toBe(reason);
    await expect(
      storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    ).rejects.toBe(reason);
    await expect(
      storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext),
    ).rejects.toBe(reason);
    await expect(
      storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext),
    ).rejects.toBe(reason);
    expect(
      captureThrown(() =>
        storage.getWritable(createSetContext("k1", { signal }) as IStorage.GetWritableContext),
      ),
    ).toBe(reason);
    expect(
      await captureRejection(
        storage.getReadable(createStreamContext("k1", { signal }) as IStorage.GetReadableContext),
      ),
    ).toBe(reason);

    // clear は実装が signal を確認しないため、中断テストの対象外です。
  });
});
