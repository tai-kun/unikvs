import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { InvalidChunkTypeError, KeyNotFoundError } from "../src/errors.js";
import { BlobOperationError } from "../src/errors.js";
import VercelBlob, { type IFetch } from "../src/vercel-blob.js";
import { createFakeClient, createFakeDownload } from "./_helpers.js";

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

    if (value) {
      chunks.push(value);
    }
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function setup(): { storage: VercelBlob } {
  const client = createFakeClient();
  const { fetch } = createFakeDownload(client.store);
  const storage = new VercelBlob({ client, fetch });

  return { storage };
}

describe("getWritable", () => {
  test("複数のチャンクを順番どおり結合して保存する", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4]));
    await writer.write(new Uint8Array([5, 6]));
    await writer.close();

    // 検証
    expect(
      await storage.read(
        createGetContext("s1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  test("書き込み後に元のチャンクを変更しても保存値は変わらない", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const chunk = new Uint8Array([1, 2, 3]);
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行
    await writer.write(chunk);
    chunk[0] = 99;
    await writer.close();

    // 検証
    expect(
      await storage.read(
        createGetContext("s1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("Uint8Array でないチャンクは InvalidChunkTypeError を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行
    const error = await captureRejection(
      writer.write("nope" as unknown as Uint8Array<ArrayBuffer>),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    await writer.abort();
  });

  test("abort したとき、何も保存されない", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.GetWritableContext,
      )
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.abort();

    // 検証
    expect(
      await storage.exists(
        createHasContext("s1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("蓄積後に中断した close は中断例外を投げ、何も保存しない", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const controller = new AbortController();
    const writer = storage
      .getWritable(
        createSetContext("s1", {
          signal: controller.signal,
        }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行
    controller.abort();
    const error = await captureRejection(writer.close());

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
    expect(
      await storage.exists(
        createHasContext("s1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("中断済みシグナルでの getWritable は中断例外を投げる", ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行と検証
    expect(() =>
      storage.getWritable(
        createSetContext("s1", { signal: abortedSignal() }) as IStorage.GetWritableContext,
      ),
    ).toThrowError(DOMException);
  });
});

describe("getReadable", () => {
  test("保存した値をストリームで読み取れる", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    await storage.write(
      createSetContext("s1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3, 4, 5, 6]),
    );

    // 実行
    const stream = await storage.getReadable(
      createStreamContext("s1", {
        signal: AbortSignal.timeout(5_000),
      }) as IStorage.GetReadableContext,
    );

    // 検証
    expect(await readAll(stream)).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  test("存在しないキーの getReadable は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const error = await captureRejection(
      storage.getReadable(
        createStreamContext("unknown", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.GetReadableContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("head の失敗時の getReadable は BlobOperationError を投げる", async ({ expect }) => {
    // 準備
    const client = createFakeClient({ failOn: "head" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });

    // 実行
    const error = await captureRejection(
      storage.getReadable(
        createStreamContext("s1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.GetReadableContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobOperationError);
  });

  test("ボディなし応答の getReadable は空ストリームを返す", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    client.store.set("s1", new Uint8Array([1, 2, 3]));
    const bodyNullFetch: IFetch = async () =>
      ({ ok: true, status: 200, statusText: "OK", body: null }) as unknown as Response;
    const storage = new VercelBlob({ client, fetch: bodyNullFetch });

    // 実行
    const stream = await storage.getReadable(
      createStreamContext("s1", {
        signal: AbortSignal.timeout(5_000),
      }) as IStorage.GetReadableContext,
    );

    // 検証
    expect(await readAll(stream)).toStrictEqual(new Uint8Array(0));
  });

  test("中断済みシグナルでの getReadable は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const error = await captureRejection(
      storage.getReadable(
        createStreamContext("s1", { signal: abortedSignal() }) as IStorage.GetReadableContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
