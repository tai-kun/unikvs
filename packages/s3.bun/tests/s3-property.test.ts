import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  collectBytes,
  forCasesAsync,
  createGetContext,
  createHasContext,
  createSetContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test } from "./_helpers.js";

const seed = 20_260_930;
const caseCount = 25;

const KEY_CHARS = Array.from(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_日本語📦éΩ",
);

/**
 * バイト列を指定幅で切り分けます。
 * 任意のチャンク分割での書き込み検証に使用します。
 */
function splitIntoChunks(
  data: Uint8Array<ArrayBuffer>,
  sizes: readonly number[],
): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const size of sizes) {
    if (offset >= data.length) {
      break;
    }

    const end = Math.min(offset + size, data.length);
    chunks.push(data.subarray(offset, end));
    offset = end;
  }

  if (offset < data.length) {
    chunks.push(data.subarray(offset));
  }

  return chunks;
}

describe("決定的ファズ検証", () => {
  test("任意のキーとバイト列で write→read が往復する", async ({ expect, signal, storage }) => {
    // 実行と検証：
    await forCasesAsync(seed, caseCount, async (random) => {
      const key = `prop/${random.string(random.int(1, 32), KEY_CHARS)}`;
      const data = random.bytes(random.uint(64 * 1024 + 1));
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

      const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
      expect(bytesEqual(result, data)).toBe(true);

      expect(
        await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).toBe(true);

      await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
      expect(
        await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).toBe(false);
    });
  });

  test("任意のチャンク分割でストリーム書き込みしても read と getReadable が一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await forCasesAsync(seed + 1, caseCount, async (random) => {
      const key = "property-stream.bin";
      const expected = random.bytes(random.uint(8 * 1024 + 1));
      const chunks = splitIntoChunks(
        expected,
        random.array(random.uint(13), () => random.int(1, 2048)),
      );

      const writer = storage
        .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
        .getWriter();

      for (const chunk of chunks) {
        await writer.write(chunk);
      }

      await writer.close();

      const direct = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
      const streamed = await collectBytes(
        storage.getReadable(createStreamContext(key, { signal }) as IStorage.GetReadableContext),
      );
      expect(bytesEqual(direct, expected)).toBe(true);
      expect(bytesEqual(streamed, expected)).toBe(true);
    });
  });
});
