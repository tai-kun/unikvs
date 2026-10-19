import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  createAllByteValues,
  createDeleteContext,
  createGetContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import VercelKv from "../src/vercel-kv.js";

const url = process.env["KV_REST_API_URL"];
const token = process.env["KV_REST_API_TOKEN"];

function liveKeyPrefix(): string {
  return `unikvs-live-test-${Date.now()}-${Math.random().toString(36).slice(2)}:`;
}

describe.skipIf(!url || !token)("Vercel KV 実接続 (env-gated)", () => {
  test("write/read/delete が往復する", async ({ expect }) => {
    // 準備
    // 環境変数がない場合は `skipIf` で全体が飛ばされるため、ここでは存在が保証される。
    const storage = new VercelKv({ url, token, keyPrefix: liveKeyPrefix() });
    const signal = AbortSignal.timeout(30_000);
    const key = "roundtrip.bin";
    const data = createAllByteValues(1024);

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(bytesEqual(result, data)).toBe(true);

    // 後始末
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow();
  });
});
