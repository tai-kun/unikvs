import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import CloudflareCache from "../src/cloudflare-cache.js";
import { KeyNotFoundError, InvalidChunkTypeError } from "../src/errors.js";
import { createFakeCache } from "./_helpers.js";

/**
 * ストリームの全チャンクを読み切って結合します。
 * 読み取り結果の検証に使用します。
 */
async function readAll(stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value !== undefined) {
      chunks.push(value);
    }
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }

  return merged;
}

describe("getWritable", () => {
  test("複数のチャンクを順番どおり結合して保存する", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4]));
    await writer.write(new Uint8Array([5, 6]));
    await writer.close();

    // 検証：
    expect(
      await storage.read(
        createGetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  test("チャンクを 1 つも書かずに close したとき、0 バイトの値が保存される", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行：
    await writer.close();

    // 検証：
    expect(
      await storage.exists(
        createHasContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(true);
    expect(
      await storage.read(
        createGetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("書き込み後に元のチャンクを変更しても保存値は変わらない", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });
    const chunk = new Uint8Array([1, 2, 3]);
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行：
    await writer.write(chunk);
    chunk[0] = 99;
    await writer.close();

    // 検証：
    expect(
      await storage.read(
        createGetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("close するまで値は保存されない", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1]));

    const existsBeforeClose = await storage.exists(
      createHasContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
    );

    await writer.close();

    // 検証：
    expect(existsBeforeClose).toBe(false);
    expect(
      await storage.exists(
        createHasContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(true);
  });

  test("Uint8Array 以外のチャンクは InvalidChunkTypeError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行：
    const error = await captureRejection(
      writer.write("nope" as unknown as Uint8Array<ArrayBuffer>),
    );

    // 検証：
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect(
      await storage.exists(
        createHasContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("abort したとき値は保存されず、既存の値は残る", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });
    await storage.write(
      createSetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.abort();

    // 検証：
    expect(
      await storage.read(
        createGetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([9]));
  });

  test("中断済みシグナルでの getWritable は中断例外を投げる", ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行：
    let error: unknown;

    try {
      storage.getWritable(
        createSetContext("s1", { signal: abortedSignal() }) as IStorage.GetWritableContext,
      );
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("getWritable 取得後に中断したとき、close は中断理由で拒否され値は保存されない", async ({
    expect,
  }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });
    const controller = new AbortController();
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: controller.signal,
        }) as IStorage.GetWritableContext,
      )
      .getWriter();
    const reason = new Error("独自の中断理由");

    // 実行：
    await writer.write(new Uint8Array([1, 2, 3]));
    controller.abort(reason);

    const error = await captureRejection(writer.close());

    // 検証：
    expect(error).toBe(reason);

    expect(
      await storage.exists(
        createHasContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });
});

describe("getReadable", () => {
  test("保存した値をストリームで読み出せる", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });
    await storage.write(
      createSetContext("r1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([7, 8, 9]),
    );

    // 実行：
    const stream = await storage.getReadable(
      createStreamContext("r1", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.GetReadableContext,
    );

    // 検証：
    expect(await readAll(stream)).toStrictEqual(new Uint8Array([7, 8, 9]));
  });

  test("存在しないキーの getReadable は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行：
    const error = await captureRejection(
      storage.getReadable(
        createStreamContext("unknown", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetReadableContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });

  test("ボディなし応答は空ストリームとして返す", async ({ expect }) => {
    // 準備：
    const nullBodyCache = {
      put: async (): Promise<void> => {},
      match: async (): Promise<Response | undefined> =>
        ({
          ok: true,
          body: null,
          status: 200,
        }) as unknown as Response,
      delete: async (): Promise<boolean> => true,
    };
    const storage = new CloudflareCache({ cache: nullBodyCache });

    // 実行：
    const stream = await storage.getReadable(
      createStreamContext("r1", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.GetReadableContext,
    );

    // 検証：
    expect(await readAll(stream)).toStrictEqual(new Uint8Array(0));
  });

  test("中断済みシグナルでの getReadable は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行：
    const error = await captureRejection(
      storage.getReadable(
        createStreamContext("r1", {
          signal: abortedSignal(),
        }) as IStorage.GetReadableContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
