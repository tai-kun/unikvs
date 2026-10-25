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

import { KeyNotFoundError, InvalidChunkTypeError } from "../src/errors.js";
import Http, { type IFetch } from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

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
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
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

  test("書き込み後に元のチャンクを変更しても保存値は変わらない", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
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
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
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

  test("空のストリームを close したとき、長さ 0 の値が保存される", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
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

  test("abort したとき値は保存されず送信もされない", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2]));
    await writer.abort();

    // 検証：
    expect(calls.length).toBe(0);
    expect(
      await storage.exists(
        createHasContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("Uint8Array 以外のチャンクは InvalidChunkTypeError で拒否される", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行：
    const error = await captureRejection(
      writer.write("invalid" as unknown as Uint8Array<ArrayBuffer>),
    );

    // 検証：
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect((error as InvalidChunkTypeError).meta).toStrictEqual({
      key: "s1",
      chunk: "invalid",
      chunkType: "string",
    });
  });

  test("既存の値を上書きする", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
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
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 検証：
    expect(
      await storage.read(
        createGetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("中断済みシグナルでは送信せず中断例外を投げる", ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行と検証：
    expect(() =>
      storage.getWritable(
        createSetContext("s1", { signal: abortedSignal() }) as IStorage.GetWritableContext,
      ),
    ).toThrow(DOMException);
  });

  test("close 進行中の中断は中断例外を優先する", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const controller = new AbortController();
    const writer = storage
      .getWritable(
        createSetContext("s1", { signal: controller.signal }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行：
    controller.abort();

    const error = await captureRejection(writer.close());

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
  });
});

describe("getReadable", () => {
  test("存在しないキーでは KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

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

  test("410 応答のキーでは KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const goneFetch: IFetch = () =>
      Promise.resolve(
        new Response(null, {
          status: 410,
          statusText: "Gone",
        }),
      );
    const storage = new Http(baseUrl, { fetch: goneFetch });

    // 実行：
    const error = await captureRejection(
      storage.getReadable(
        createStreamContext("gone", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetReadableContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("保存値を読み切ったとき、write した値と byte-for-byte で一致する", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const data = new Uint8Array([0, 1, 2, 255]);
    await storage.write(
      createSetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    const stream = await storage.getReadable(
      createStreamContext("s1", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.GetReadableContext,
    );

    // 検証：
    expect(await readAll(stream)).toStrictEqual(data);
  });

  test("body が null のとき、空ストリームを返す", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const nullBodyFetch: IFetch = () =>
      Promise.resolve({
        ok: true,
        body: null,
        status: 200,
        statusText: "OK",
      } as unknown as Response);
    const storage = new Http(baseUrl, { fetch: nullBodyFetch });

    // 実行：
    const stream = await storage.getReadable(
      createStreamContext("s1", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.GetReadableContext,
    );

    // 検証：
    expect(await readAll(stream)).toStrictEqual(new Uint8Array(0));
  });

  test("返却後に abort してもストリームは自動 cancel されない", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    await storage.write(
      createSetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    const controller = new AbortController();
    const stream = await storage.getReadable(
      createStreamContext("s1", { signal: controller.signal }) as IStorage.GetReadableContext,
    );

    // 実行：
    controller.abort();

    const result = await readAll(stream);

    // 検証：
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("reader.cancel しても保存値は変わらない", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(
      createSetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );

    const stream = await storage.getReadable(
      createStreamContext("s1", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.GetReadableContext,
    );

    // 実行：
    await stream.getReader().cancel();

    // 検証：
    expect(
      await storage.read(
        createGetContext("s1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(data);
  });
});
