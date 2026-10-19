import { KeyNotFoundError, type IStorage } from "@unikvs/core";
import {
  abortedSignal,
  bytesEqual,
  captureRejection,
  captureThrown,
  collectBytes,
  createAllByteValues,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import CloudflareR2 from "../src/cloudflare-r2.js";
import { InvalidChunkTypeError, StorageAbortedError } from "../src/errors.js";
import { createFakeBucket } from "./_fake-bucket.js";

function createStorage(keyPrefix = ""): CloudflareR2 {
  const storage = new CloudflareR2({ bucket: createFakeBucket(), keyPrefix });
  storage.open(createOpenContext() as IStorage.OpenContext);

  return storage;
}

describe("基本データ操作 (CRUD)", () => {
  test("全 256 種類のバイト値を含むデータが byte-for-byte で往復する", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = createStorage();
    const key = "all-byte-values.bin";
    const data = createAllByteValues(1024);

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("0 バイトのデータが往復し、exists は true になる", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const key = "zero-length.bin";

    // 実行
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array(0),
    );

    // 検証
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("Unicode のテキストデータが byte-for-byte で往復する", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const key = "unicode-data.txt";
    const data = new TextEncoder().encode("こんにちは、世界! 🚀 Ω");

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(new TextDecoder().decode(result)).toBe("こんにちは、世界! 🚀 Ω");
  });

  test("上書きで全体が置き換わる", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const key = "overwrite.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      createAllByteValues(1024),
    );

    // 実行
    const shortData = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, shortData);

    // 検証
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(shortData);
  });

  test("存在しないキーの read は KeyNotFoundError で拒否される", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();

    // 実行と検証
    await expect(
      storage.read(createGetContext("missing.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("書き込み前に exists は false で、書き込み後に true になる", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const key = "existence.bin";

    // 実行
    const before = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const after = await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext);

    // 検証
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test("削除を 2 回行っても 2 回目はエラーにならない", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const key = "delete-twice.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 実行と検証
    await expect(
      storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext),
    ).resolves.toBeUndefined();
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("1 つのキーを削除しても他のキーは残る", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    await storage.write(
      createSetContext("keep-a.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("remove.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );
    await storage.write(
      createSetContext("keep-b.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );

    // 実行
    await storage.delete(createDeleteContext("remove.bin", { signal }) as IStorage.DeleteContext);

    // 検証
    expect(
      await storage.exists(createHasContext("keep-a.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(true);
    expect(
      await storage.exists(createHasContext("remove.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storage.exists(createHasContext("keep-b.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(true);
  });

  test("clear の後に同じバケットを引き続き使用できる", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    await storage.write(
      createSetContext("before-clear.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    await storage.write(
      createSetContext("after-clear.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );

    // 検証
    expect(
      await storage.exists(
        createHasContext("before-clear.bin", { signal }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
    expect(
      await storage.read(createGetContext("after-clear.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([3]));
  });

  test("1000 件を超えるオブジェクトでも clear は全ページを削除する", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const count = 1050;
    for (let index = 0; index < count; index++) {
      await storage.write(
        createSetContext(`bulk/${index}.bin`, { signal }) as IStorage.WriteContext,
        new Uint8Array([index % 256]),
      );
    }

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    for (const index of [0, 1, 999, 1000, count - 2, count - 1]) {
      expect(
        await storage.exists(
          createHasContext(`bulk/${index}.bin`, { signal }) as IStorage.ExistsContext,
        ),
      ).toBe(false);
    }
  });

  test("keyPrefix が異なるストレージは互いに干渉せず、clear も接頭辞内に限定される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const bucket = createFakeBucket();
    const storageA = new CloudflareR2({ bucket, keyPrefix: "a:" });
    const storageB = new CloudflareR2({ bucket, keyPrefix: "b:" });
    storageA.open(createOpenContext() as IStorage.OpenContext);
    storageB.open(createOpenContext() as IStorage.OpenContext);
    await storageA.write(
      createSetContext("same.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storageB.write(
      createSetContext("same.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storageA.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    expect(
      await storageA.exists(createHasContext("same.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storageB.read(createGetContext("same.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([2]));
    expect([...bucket.store.keys()]).toStrictEqual(["b:same.bin"]);
  });
});

describe("ライフサイクル", () => {
  test("open と close で isOpen が切り替わる", ({ expect }) => {
    // 準備
    const storage = new CloudflareR2({ bucket: createFakeBucket() });

    // 実行と検証
    expect(storage.isOpen).toBe(false);
    storage.open(createOpenContext() as IStorage.OpenContext);
    expect(storage.isOpen).toBe(true);
    storage.close(createCloseContext() as IStorage.CloseContext);
    expect(storage.isOpen).toBe(false);
  });

  test("中断済みシグナルの open と close は中断例外を投げる", ({ expect }) => {
    // 準備
    const storage = new CloudflareR2({ bucket: createFakeBucket() });
    const signal = abortedSignal();

    // 実行
    const openError = captureThrown(() =>
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    );
    const closeError = captureThrown(() =>
      storage.close(createCloseContext({ signal }) as IStorage.CloseContext),
    );

    // 検証
    expect(openError).toBeInstanceOf(DOMException);
    expect(closeError).toBeInstanceOf(DOMException);
  });
});

describe("ストリーム操作", () => {
  test("ストリーム書き込み・read・getReadable の結果が一致する", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const key = "three-way.bin";
    const expected = createAllByteValues(256 * 32);

    // 実行
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    for (let offset = 0; offset < expected.length; offset += 1000) {
      await writer.write(expected.subarray(offset, offset + 1000));
    }
    await writer.close();
    const direct = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    const streamed = await collectBytes(
      await storage.getReadable(
        createStreamContext(key, { signal }) as IStorage.GetReadableContext,
      ),
    );

    // 検証
    expect(bytesEqual(direct, expected)).toBe(true);
    expect(bytesEqual(streamed, expected)).toBe(true);
  });

  test("チャンクを 1 つも書かずに閉じたストリームは 0 バイトのオブジェクトになる", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = createStorage();
    const key = "empty-stream.bin";

    // 実行
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.close();

    // 検証
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
    expect(
      await collectBytes(
        await storage.getReadable(
          createStreamContext(key, { signal }) as IStorage.GetReadableContext,
        ),
      ),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("空のチャンクを挟んでもデータが欠落しない", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const key = "empty-chunks.bin";
    const expected = new TextEncoder().encode("part-1-part-2");

    // 実行
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array(0));
    await writer.write(expected.subarray(0, 6));
    await writer.write(new Uint8Array(0));
    await writer.write(expected.subarray(6));
    await writer.close();

    // 検証
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(expected);
  });

  test("存在しないキーの getReadable は KeyNotFoundError で拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = createStorage();

    // 実行と検証
    await expect(
      storage.getReadable(
        createStreamContext("missing-stream.bin", { signal }) as IStorage.GetReadableContext,
      ),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("中断済みシグナルの getWritable は StorageAbortedError を投げる", ({ expect }) => {
    // 準備
    const storage = createStorage();

    // 実行と検証
    expect(() =>
      storage.getWritable(
        createSetContext("aborted.bin", {
          signal: abortedSignal(),
        }) as IStorage.GetWritableContext,
      ),
    ).toThrow(StorageAbortedError);
  });

  test("Uint8Array 以外のチャンクは InvalidChunkTypeError になる", async ({ expect, signal }) => {
    // 準備
    const storage = createStorage();
    const writer = storage
      .getWritable(createSetContext("chunk-type.bin", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行と検証
    await expect(writer.write("not-bytes" as unknown as Uint8Array<ArrayBuffer>)).rejects.toThrow(
      InvalidChunkTypeError,
    );
    await writer.abort(new Error("中断"));
  });

  test("writer.abort 後はオブジェクトが残らず、以後の操作も成功する", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = createStorage();
    const key = "aborted-writer.bin";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行
    await writer.abort(new Error("中断"));

    // 検証
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    await storage.write(
      createSetContext("after-writer-abort.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    expect(
      await storage.exists(
        createHasContext("after-writer-abort.bin", { signal }) as IStorage.ExistsContext,
      ),
    ).toBe(true);
  });

  test("中断済みシグナルの read と getReadable は中断例外で拒否される", async ({ expect }) => {
    // 準備
    const storage = createStorage();
    const signal = abortedSignal();

    // 実行
    const readError = await captureRejection(
      storage.read(createGetContext("x.bin", { signal }) as IStorage.ReadContext),
    );
    const streamError = await captureRejection(
      storage.getReadable(createStreamContext("x.bin", { signal }) as IStorage.GetReadableContext),
    );

    // 検証
    expect(readError).toBeInstanceOf(DOMException);
    expect(streamError).toBeInstanceOf(DOMException);
  });
});
