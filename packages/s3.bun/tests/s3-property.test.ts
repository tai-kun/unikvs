import { describe } from "vitest";

import { bytesEqual, collectBytes, test } from "./_helpers.js";
import { forCasesAsync } from "./_random.js";

const seed = 20260930;
const caseCount = 25;

const KEY_CHARS = Array.from(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_日本語📦éΩ",
);

describe("決定的ファズ検証", () => {
  test("任意のキーとバイト列で write→read が往復する", async ({ expect, signal, storage }) => {
    // 実行と検証
    await forCasesAsync(seed, caseCount, async (random) => {
      const key = `prop/${random.string(random.int(1, 32), KEY_CHARS)}`;
      const data = random.bytes(random.uint(64 * 1024 + 1));

      await storage.write({ key, data, signal, vars: {} });
      const result = await storage.read({ key, signal });

      expect(bytesEqual(result, data)).toBe(true);
      expect(await storage.exists({ key, signal })).toBe(true);

      await storage.delete({ key, signal });
      expect(await storage.exists({ key, signal })).toBe(false);
    });
  });

  test("任意のチャンク分割でストリーム書き込みしても read と getReadable が一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証
    await forCasesAsync(seed + 1, caseCount, async (random) => {
      const key = "property-stream.bin";
      const expected = random.bytes(random.uint(8 * 1024 + 1));
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let offset = 0;

      for (const size of random.array(random.uint(13), () => random.int(1, 2048))) {
        if (offset >= expected.length) break;
        const end = Math.min(offset + size, expected.length);
        chunks.push(expected.subarray(offset, end));
        offset = end;
      }
      if (offset < expected.length) {
        chunks.push(expected.subarray(offset));
      }

      const writer = storage.getWritable({ key, vars: {}, signal }).getWriter();
      for (const chunk of chunks) {
        await writer.write(chunk);
      }
      await writer.close();

      const direct = await storage.read({ key, signal });
      const streamed = await collectBytes(storage.getReadable({ key, signal }));

      expect(bytesEqual(direct, expected)).toBe(true);
      expect(bytesEqual(streamed, expected)).toBe(true);
    });
  });
});
