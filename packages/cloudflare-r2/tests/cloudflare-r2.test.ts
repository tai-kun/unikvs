import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import {
  bytesEqual,
  collectBytes,
  abortedSignal,
  captureThrown,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createAllByteValues,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import CloudflareR2 from "../src/cloudflare-r2.js";
import { StorageAbortedError, InvalidChunkTypeError } from "../src/errors.js";
import { createFakeBucket } from "./_fake-bucket.js";

function createStorage(keyPrefix = ""): CloudflareR2 {
  const storage = new CloudflareR2({
    bucket: createFakeBucket(),
    keyPrefix,
  });
  storage.open(createOpenContext() as IStorage.OpenContext);

  return storage;
}

describe("設定", () => {
  test("name とコンストラクターで渡した bucket / keyPrefix を公開する", ({ expect }) => {
    // 準備：
    const bucket = createFakeBucket();

    // 実行：
    const storage = new CloudflareR2({ bucket });
    const prefixed = new CloudflareR2({
      bucket,
      keyPrefix: "app/",
    });

    // 検証：
    expect(storage.name).toBe("CloudflareR2");
    expect(storage.bucket).toBe(bucket);
    expect(storage.keyPrefix).toBe("");
    expect(prefixed.keyPrefix).toBe("app/");
  });
});

describe("基本データ操作 (CRUD)", () => {
  test("全 256 種類のバイト値を含むデータが byte-for-byte で往復する", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = createStorage();
    const key = "all-byte-values.bin";
    const data = createAllByteValues(1024);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("0 バイトのデータが往復し、exists は true になる", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    const key = "zero-length.bin";

    // 実行：
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array(0),
    );

    // 検証：
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("上書きで全体が置き換わる", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    const key = "overwrite.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      createAllByteValues(1024),
    );

    // 実行：
    const shortData = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, shortData);

    // 検証：
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(shortData);
  });

  test("存在しないキーの read は論理キーを持つ KeyNotFoundError で拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = createStorage("app/");

    // 実行：
    const error = await captureRejection(
      storage.read(createGetContext("missing.bin", { signal }) as IStorage.ReadContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "missing.bin" });
  });

  test("書き込み前に exists は false で、書き込み後に true になる", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    const key = "existence.bin";

    // 実行：
    const before = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    const after = await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext);

    // 検証：
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test("削除を 2 回行っても 2 回目はエラーにならない", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    const key = "delete-twice.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext),
    ).resolves.toBeUndefined();
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("1 つのキーを削除しても他のキーは残る", async ({ expect, signal }) => {
    // 準備：
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

    // 実行：
    await storage.delete(createDeleteContext("remove.bin", { signal }) as IStorage.DeleteContext);

    // 検証：
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

  test("ビューを書き込んだとき、その範囲だけがコピーされて保存される", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = createStorage();
    const key = "view.bin";
    const source = createAllByteValues(8);
    const view = source.subarray(2, 5);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, view);
    source.fill(9);

    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(result).toStrictEqual(new Uint8Array([2, 3, 4]));
  });

  test("読み取った結果を変更しても保存値は変わらない", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    const key = "read-isolation.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    const first = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    first[0] = 99;

    const second = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(second).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("clear の後に同じバケットを引き続き使用できる", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    await storage.write(
      createSetContext("before-clear.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    await storage.write(
      createSetContext("after-clear.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );

    // 検証：
    expect(
      await storage.exists(
        createHasContext("before-clear.bin", { signal }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
    expect(
      await storage.read(createGetContext("after-clear.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([3]));
  });

  test("空のストレージを clear してもエラーにならない", async ({ expect, signal }) => {
    // 準備：
    const bucket = createFakeBucket();
    const storage = new CloudflareR2({ bucket });
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).resolves.toBeUndefined();
    expect(bucket.store.size).toBe(0);
  });

  test("1000 件を超えるオブジェクトでも clear は全ページを削除する", async ({ expect, signal }) => {
    // 準備：
    const bucket = createFakeBucket();
    const storage = new CloudflareR2({ bucket });
    storage.open(createOpenContext() as IStorage.OpenContext);

    const count = 1050;

    for (let index = 0; index < count; index++) {
      await storage.write(
        createSetContext(`bulk/${index}.bin`, { signal }) as IStorage.WriteContext,
        new Uint8Array([index % 256]),
      );
    }

    expect(bucket.store.size).toBe(count);

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(bucket.store.size).toBe(0);
  });

  test("keyPrefix は write / read / exists / delete のキーに適用される", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const bucket = createFakeBucket();
    const storageA = new CloudflareR2({
      bucket,
      keyPrefix: "a:",
    });
    const storageB = new CloudflareR2({
      bucket,
      keyPrefix: "b:",
    });
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
    await storageB.write(
      createSetContext("only-b.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );

    // 実行：
    await storageA.delete(createDeleteContext("same.bin", { signal }) as IStorage.DeleteContext);

    // 検証：
    expect(
      await storageA.exists(createHasContext("same.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storageA.exists(createHasContext("only-b.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storageB.exists(createHasContext("only-b.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(true);
    expect(
      await storageB.read(createGetContext("same.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([2]));
    expect(
      await storageB.read(createGetContext("only-b.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([3]));
    expect([...bucket.store.keys()]).toStrictEqual(["b:same.bin", "b:only-b.bin"]);
  });

  test("clear は同じ接頭辞のキーだけを消去する", async ({ expect, signal }) => {
    // 準備：
    const bucket = createFakeBucket();
    const storageA = new CloudflareR2({
      bucket,
      keyPrefix: "a:",
    });
    const storageB = new CloudflareR2({
      bucket,
      keyPrefix: "b:",
    });
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

    // 実行：
    await storageA.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
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
    // 準備：
    const storage = new CloudflareR2({ bucket: createFakeBucket() });

    // 実行と検証：
    expect(storage.isOpen).toBe(false);
    storage.open(createOpenContext() as IStorage.OpenContext);
    storage.open(createOpenContext() as IStorage.OpenContext);
    expect(storage.isOpen).toBe(true);
    storage.close(createCloseContext() as IStorage.CloseContext);
    storage.close(createCloseContext() as IStorage.CloseContext);
    expect(storage.isOpen).toBe(false);
  });
});

describe("中断処理", () => {
  test("中断済みシグナルの open と close は中断理由を投げ、状態を変更しない", ({ expect }) => {
    // 準備：
    const storage = new CloudflareR2({ bucket: createFakeBucket() });
    const reason = new Error("独自の中断理由");
    const signal = abortedSignal(reason);

    // 実行と検証：
    const openError = captureThrown(() => {
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    });
    expect(openError).toBe(reason);
    expect(storage.isOpen).toBe(false);
    storage.open(createOpenContext() as IStorage.OpenContext);
    expect(storage.isOpen).toBe(true);

    const closeError = captureThrown(() => {
      storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    });
    expect(closeError).toBe(reason);

    expect(storage.isOpen).toBe(true);
  });

  test("中断済みシグナルの各操作は操作を開始せず中断理由で拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const bucket = createFakeBucket();
    const storage = new CloudflareR2({ bucket });
    storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("keep.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([7]),
    );

    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);
    const cases: [string, () => Promise<unknown>][] = [
      [
        "write",
        () =>
          storage.write(
            createSetContext("aborted.bin", { signal: aborted }) as IStorage.WriteContext,
            new Uint8Array([1]),
          ),
      ],
      [
        "read",
        () =>
          storage.read(createGetContext("keep.bin", { signal: aborted }) as IStorage.ReadContext),
      ],
      [
        "exists",
        () =>
          storage.exists(
            createHasContext("keep.bin", { signal: aborted }) as IStorage.ExistsContext,
          ),
      ],
      [
        "delete",
        () =>
          storage.delete(
            createDeleteContext("keep.bin", { signal: aborted }) as IStorage.DeleteContext,
          ),
      ],
      [
        "clear",
        () => storage.clear(createClearContext("", { signal: aborted }) as IStorage.ClearContext),
      ],
      [
        "getReadable",
        () =>
          storage.getReadable(
            createStreamContext("keep.bin", { signal: aborted }) as IStorage.GetReadableContext,
          ),
      ],
    ];

    // 実行と検証：
    for (const [label, run] of cases) {
      const error = await captureRejection(run());
      expect(error, label).toBe(reason);

      expect([...bucket.store.keys()], label).toStrictEqual(["keep.bin"]);
      expect(bucket.store.get("keep.bin"), label).toStrictEqual(new Uint8Array([7]));
    }
  });

  test("中断済みシグナルの getWritable は StorageAbortedError を投げる", ({ expect }) => {
    // 準備：
    const storage = createStorage("app/");

    // 実行：
    const error = captureThrown(() =>
      storage.getWritable(
        createSetContext("aborted.bin", {
          signal: abortedSignal(),
        }) as IStorage.GetWritableContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(StorageAbortedError);
    expect((error as StorageAbortedError).meta).toStrictEqual({ key: "aborted.bin" });
  });

  test("getWritable 取得後に中断したとき、close は中断理由で拒否され値は保存されない", async ({
    expect,
  }) => {
    // 準備：
    const bucket = createFakeBucket();
    const storage = new CloudflareR2({ bucket });
    storage.open(createOpenContext() as IStorage.OpenContext);

    const controller = new AbortController();
    const key = "close-aborted.bin";
    const writer = storage
      .getWritable(
        createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    const reason = new Error("独自の中断理由");

    // 実行：
    controller.abort(reason);

    const error = await captureRejection(writer.close());

    // 検証：
    expect(error).toBe(reason);

    expect(bucket.store.size).toBe(0);
  });
});

describe("ストリーム操作", () => {
  test("ストリーム書き込み・read・getReadable の結果が一致する", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    const key = "three-way.bin";
    const expected = createAllByteValues(256 * 32);

    // 実行：
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

    // 検証：
    expect(bytesEqual(direct, expected)).toBe(true);
    expect(bytesEqual(streamed, expected)).toBe(true);
  });

  test("keyPrefix は getWritable / getReadable のキーに適用される", async ({ expect, signal }) => {
    // 準備：
    const bucket = createFakeBucket();
    const storageA = new CloudflareR2({
      bucket,
      keyPrefix: "a:",
    });
    const storageB = new CloudflareR2({
      bucket,
      keyPrefix: "b:",
    });
    storageA.open(createOpenContext() as IStorage.OpenContext);
    storageB.open(createOpenContext() as IStorage.OpenContext);

    const key = "stream.bin";
    const expected = new Uint8Array([1, 2, 3]);

    // 実行：
    const writer = storageA
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(expected);
    await writer.close();

    const direct = await storageA.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    const streamed = await collectBytes(
      await storageA.getReadable(
        createStreamContext(key, { signal }) as IStorage.GetReadableContext,
      ),
    );
    const visibleFromB = await storageB.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );
    const missingFromB = await captureRejection(
      storageB.getReadable(createStreamContext(key, { signal }) as IStorage.GetReadableContext),
    );

    // 検証：
    expect([...bucket.store.keys()]).toStrictEqual(["a:stream.bin"]);
    expect(bytesEqual(direct, expected)).toBe(true);
    expect(bytesEqual(streamed, expected)).toBe(true);
    expect(visibleFromB).toBe(false);
    expect(missingFromB).toBeInstanceOf(KeyNotFoundError);
    expect((missingFromB as KeyNotFoundError).meta).toStrictEqual({ key });
  });

  test("チャンクを 1 つも書かずに閉じたストリームは 0 バイトのオブジェクトになる", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = createStorage();
    const key = "empty-stream.bin";

    // 実行：
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.close();

    // 検証：
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
    // 準備：
    const storage = createStorage();
    const key = "empty-chunks.bin";
    const expected = new TextEncoder().encode("part-1-part-2");

    // 実行：
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array(0));
    await writer.write(expected.subarray(0, 6));
    await writer.write(new Uint8Array(0));
    await writer.write(expected.subarray(6));
    await writer.close();

    // 検証：
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(expected);
  });

  test("存在しないキーの getReadable は論理キーを持つ KeyNotFoundError で拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = createStorage("app/");

    // 実行：
    const error = await captureRejection(
      storage.getReadable(
        createStreamContext("missing-stream.bin", { signal }) as IStorage.GetReadableContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "missing-stream.bin" });
  });

  test("Uint8Array 以外のチャンクは InvalidChunkTypeError になり、値は保存されない", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const bucket = createFakeBucket();
    const storage = new CloudflareR2({
      bucket,
      keyPrefix: "app/",
    });
    storage.open(createOpenContext() as IStorage.OpenContext);

    const key = "chunk-type.bin";
    const chunk = "not-bytes" as unknown as Uint8Array<ArrayBuffer>;
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    const error = await captureRejection(writer.write(chunk));

    // 検証：
    expect(error).toBeInstanceOf(InvalidChunkTypeError);

    const invalidChunkError = error as InvalidChunkTypeError;
    expect(invalidChunkError.name).toBe("CloudflareR2InvalidChunkTypeError");
    expect(invalidChunkError.meta).toStrictEqual({
      key,
      chunk,
      chunkType: "string",
    });
    expect(invalidChunkError.message).toBe(
      'Expected chunk for key "chunk-type.bin" is Uint8Array<ArrayBuffer>, but got string',
    );

    expect(bucket.store.size).toBe(0);
  });

  test("writer.abort したとき、書きかけの値は保存されず既存の値は残る", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = createStorage();
    const key = "aborted-writer.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行：
    await writer.abort(new Error("中断"));

    // 検証：
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([9]));
  });

  test("close するまでオブジェクトは保存されない", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    const key = "save-on-close.bin";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2, 3]));

    const existsBeforeClose = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    await writer.close();
    const existsAfterClose = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(existsBeforeClose).toBe(false);
    expect(existsAfterClose).toBe(true);
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("writer に渡したチャンクを後から変更しても保存値は変わらない", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = createStorage();
    const key = "chunk-copy.bin";
    const chunk = new Uint8Array([1, 2, 3]);
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(chunk);
    chunk.fill(9);
    await writer.close();

    // 検証：
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("同時に開いた writer のチャンクは互いに混ざらない", async ({ expect, signal }) => {
    // 準備：
    const storage = createStorage();
    const writerA = storage
      .getWritable(createSetContext("concurrent-a.bin", { signal }) as IStorage.GetWritableContext)
      .getWriter();
    const writerB = storage
      .getWritable(createSetContext("concurrent-b.bin", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writerA.write(new Uint8Array([1, 1]));
    await writerB.write(new Uint8Array([2, 2]));
    await writerA.close();
    await writerB.close();

    // 検証：
    expect(
      await storage.read(createGetContext("concurrent-a.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 1]));
    expect(
      await storage.read(createGetContext("concurrent-b.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([2, 2]));
  });
});
