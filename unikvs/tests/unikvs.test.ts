import { Compression } from "@unikvs/compression";
import { NodeFs } from "@unikvs/fs.node";
import { Opfs } from "@unikvs/opfs";
import { describe, test } from "vitest";

import { KeyNotFoundError, UniKvsIsNotOpenError, UniKvsIsOpenError } from "../src/errors.js";
import type { PlainValue, StreamValue, Value } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";

describe("ライフサイクル (open / close)", () => {
  test("正常に open と close ができること", async ({ expect, signal }) => {
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    const kvs = UniKvs.config().appendTransformer(tf).appendStorage(fs).create();

    expect(tf.isOpen).toBe(true);
    expect(fs.isOpen).toBe(false);
    expect(kvs.isOpen).toBe(false);

    await kvs.open({ signal });

    expect(tf.isOpen).toBe(true);
    expect(fs.isOpen).toBe(true);
    expect(kvs.isOpen).toBe(true);

    await kvs.close({ signal });

    expect(tf.isOpen).toBe(true);
    expect(fs.isOpen).toBe(true);
    expect(kvs.isOpen).toBe(false);
  });

  test("すでに open されている状態で open を呼ぶとエラーになること", async ({ expect, signal }) => {
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config().appendTransformer(tf).appendStorage(fs).create();

    await kvs.open({ signal });

    await expect(kvs.open({ signal })).rejects.toThrow(UniKvsIsOpenError);
  });

  test("open 前に操作しようとするとエラーになること", async ({ expect, signal }) => {
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config().appendTransformer(tf).appendStorage(fs).create();

    await expect(kvs.set("key", "value", { signal })).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.get("key", { signal })).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.close({ signal })).rejects.toThrow(UniKvsIsNotOpenError);
  });
});

describe("プレーンな値の操作 (set / get / has / delete / clear)", () => {
  test("値を保存し、取得できること", async ({ expect, signal }) => {
    type Kvs = {
      foo: PlainValue<Uint8Array<ArrayBuffer>>;
    };
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config<Kvs>().appendTransformer(tf).appendStorage(fs).create();
    await kvs.open({ signal });

    await kvs.set("foo", Uint8Array.from([0, 1, 2]), { signal });
    const value = await kvs.get("foo", { signal });

    expect(Array.from(value)).toStrictEqual([0, 1, 2]);

    await kvs.clear({ signal });
  });

  test("存在しないキーを取得しようとすると KeyNotFoundError を投げること", async ({
    expect,
    signal,
  }) => {
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config().appendTransformer(tf).appendStorage(fs).create();
    await kvs.open({ signal });

    await expect(kvs.get("unknown-key", { signal })).rejects.toThrow(KeyNotFoundError);
  });

  test("キーの存在確認 (has) ができること", async ({ expect, signal }) => {
    type Kvs = {
      foo: PlainValue<Uint8Array<ArrayBuffer>>;
    };
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config<Kvs>().appendTransformer(tf).appendStorage(fs).create();
    await kvs.open({ signal });
    await kvs.set("foo", Uint8Array.from([0, 1, 2]), { signal });

    await expect(fs.exists({ key: "foo" })).resolves.toBe(true);
    await expect(kvs.has("foo", { signal })).resolves.toBe(true);

    await kvs.clear({ signal });
  });

  test("キーを削除 (delete) できること", async ({ expect, signal }) => {
    type Kvs = {
      foo: PlainValue<Uint8Array<ArrayBuffer>>;
    };
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config<Kvs>().appendTransformer(tf).appendStorage(fs).create();
    await kvs.open({ signal });
    await kvs.set("foo", Uint8Array.from([0, 1, 2]), { signal });
    await kvs.delete("foo", { signal });

    await expect(kvs.has("foo", { signal })).resolves.toBe(false);

    await kvs.clear({ signal });
  });

  test("すべてのデータを削除 (clear) できること", async ({ expect, signal }) => {
    type Kvs = {
      key1: PlainValue<Uint8Array<ArrayBuffer>>;
      key2: PlainValue<Uint8Array<ArrayBuffer>>;
    };
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config<Kvs>().appendTransformer(tf).appendStorage(fs).create();
    await kvs.open({ signal });
    await kvs.set("key1", Uint8Array.from([0, 1, 2]), { signal });
    await kvs.set("key2", Uint8Array.from([0, 1, 2]), { signal });
    await kvs.clear({ signal });

    await expect(kvs.has("key1", { signal })).resolves.toBe(false);
    await expect(kvs.has("key2", { signal })).resolves.toBe(false);

    await kvs.clear({ signal });
  });
});

describe("ストリーム値の操作 (set / stream)", () => {
  test("ReadableStreamを保存し、取得できること", async ({ expect, signal }) => {
    type Kvs = {
      foo: StreamValue<Uint8Array<ArrayBuffer>>;
    };
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config<Kvs>().appendTransformer(tf).appendStorage(fs).create();
    await kvs.open({ signal });
    const encoder = new TextEncoder();
    const chunks = [encoder.encode("hello"), encoder.encode("world")];
    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    });
    await kvs.set("foo", stream, { signal });

    await expect(kvs.has("foo", { signal })).resolves.toBe(true);

    await using value = await kvs.stream("foo", { signal });
    const reader = value.getReader();
    const readChunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      readChunks.push(value);
    }

    expect(readChunks.flatMap((chunk) => [...chunk])).toStrictEqual(
      chunks.flatMap((chunk) => [...chunk]),
    );

    await kvs.clear({ signal });
  });

  test("ストリーミング中は書き込み不可", async ({ expect, signal }) => {
    type Kvs = {
      foo: Value<Uint8Array<ArrayBuffer>>;
    };
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config<Kvs>().appendTransformer(tf).appendStorage(fs).create();
    await kvs.open({ signal });
    await kvs.set("foo", Uint8Array.from([0, 1, 2]), { signal });

    {
      const stream = await kvs.stream("foo", { signal });

      // ストリーム中は書き込めない
      await expect(
        kvs.set("foo", Uint8Array.from([3, 4, 5]), {
          signal: AbortSignal.timeout(500),
        }),
      ).rejects.toThrow(DOMException);

      await Array.fromAsync(stream);
    }

    await expect(kvs.get("foo", { signal })).resolves.toStrictEqual(Uint8Array.from([0, 1, 2]));

    // 全データを読み出し終えたので書き込める
    await kvs.set("foo", Uint8Array.from([3, 4, 5]), { signal });

    // {
    //   const stream = await kvs.stream("foo", { signal });
    //   await stream.cancel();
    // }

    // // ストリーミングを中断したので書き込める
    // await kvs.set("foo", Uint8Array.from([6, 7, 8]), { signal });

    {
      await using _ = await kvs.stream("foo", { signal });
    }

    // ストリーミングを破棄したので書き込める
    await kvs.set("foo", Uint8Array.from([9, 10, 11]), { signal });

    await kvs.clear({ signal });
  });

  test("存在しないストリームを取得しようとすると KeyNotFoundError を投げること", async ({
    expect,
    signal,
  }) => {
    const tf = new Compression("gzip");
    const fs = __CLIENT__ ? new Opfs("test") : new NodeFs("tests/.temp");
    await using kvs = UniKvs.config().appendTransformer(tf).appendStorage(fs).create();
    await kvs.open({ signal });

    await expect(kvs.stream("unknown-stream")).rejects.toThrow(KeyNotFoundError);
  });
});
