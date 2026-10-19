import { ChecksumMismatchError, ChecksumSha256 } from "@unikvs/checksum";
import { Compression } from "@unikvs/compression";
import { Memory } from "@unikvs/memory";
import { describe, test } from "vitest";

import UniKvs from "../src/unikvs.js";
import type { Value } from "../src/value-schemas.js";
import { collectBytes, isGzip, mapOf, sha256Hex, streamOf } from "./_helpers.js";

describe("UniKvs - Compression + Checksum + Memory", () => {
  test("書き込み時に検証・圧縮され、読み取り時に検証・解凍される", async ({ expect }) => {
    // 準備
    const memory = new Memory();
    await using kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .use(new ChecksumSha256())
      .use(new Compression("gzip"))
      .persist(memory)
      .create();
    const data = Uint8Array.from({ length: 256 }, (_, i) => i % 251);
    const sum = await sha256Hex(data);
    const vars = { "@unikvs/checksum:sha256": sum };
    await kvs.open();

    // 実行
    await kvs.set("foo", data, { vars });

    // 検証: ストレージには圧縮後のデータが保存される
    const stored = mapOf(memory).get("foo") as Uint8Array;
    expect(isGzip(stored)).toBe(true);

    // 検証: 読み取り時に検証と解凍が行われる
    const got = await kvs.get("foo", { vars });
    expect([...got]).toEqual([...data]);
  });

  test("チェックサム不一致の読み取りは ChecksumMismatchError になる", async ({ expect }) => {
    // 準備
    await using kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .use(new ChecksumSha256())
      .use(new Compression("gzip"))
      .persist(new Memory())
      .create();
    const data = new Uint8Array([1, 2, 3]);
    const sum = await sha256Hex(data);
    const wrongSum = await sha256Hex(new Uint8Array([9, 9]));
    await kvs.open();
    await kvs.set("foo", data, { vars: { "@unikvs/checksum:sha256": sum } });

    // 実行と検証
    await expect(kvs.get("foo", { vars: { "@unikvs/checksum:sha256": wrongSum } })).rejects.toThrow(
      ChecksumMismatchError,
    );
  });

  test("ストリーム書き込みとストリーム読み取りでも圧縮と検証が機能する", async ({ expect }) => {
    // 準備
    const memory = new Memory();
    await using kvs = UniKvs.config<{ logs: Value<Uint8Array<ArrayBuffer>> }>()
      .use(new ChecksumSha256())
      .use(new Compression("gzip"))
      .persist(memory)
      .create();
    const data = Uint8Array.from({ length: 1024 }, (_, i) => i % 253);
    const sum = await sha256Hex(data);
    const vars = { "@unikvs/checksum:sha256": sum };
    await kvs.open();

    // 実行
    await kvs.set("logs", streamOf([data.subarray(0, 100), data.subarray(100)]), { vars });

    // 検証
    expect(isGzip(mapOf(memory).get("logs") as Uint8Array)).toBe(true);
    const vs = await kvs.stream("logs", { vars });
    expect([...(await collectBytes(vs))]).toEqual([...data]);

    // 後片付け
    await vs.dispose();
  });

  test("チェックサム未指定でも既定では検証をスキップして往復できる", async ({ expect }) => {
    // 準備
    await using kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .use(new ChecksumSha256())
      .use(new Compression("deflate"))
      .persist(new Memory())
      .create();
    const data = new Uint8Array([4, 5, 6]);
    await kvs.open();

    // 実行
    await kvs.set("foo", data);

    // 検証
    expect([...(await kvs.get("foo"))]).toEqual([4, 5, 6]);
  });
});

describe("UniKvs - 複数ミドルウェアと複数ストレージ", () => {
  test("ストレージごとに異なる圧縮形式のチェーンで往復できる", async ({ expect }) => {
    // 準備
    const storage1 = new Memory();
    const storage2 = new Memory();
    await using kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .use(new Compression("gzip"))
      .persist(storage1)
      .use(new Compression("deflate"))
      .persist(storage2)
      .create();
    const data = Uint8Array.from({ length: 64 }, (_, i) => i);
    await kvs.open();

    // 実行
    await kvs.set("foo", data);

    // 検証: storage2 は gzip と deflate の二重圧縮、storage1 は gzip のみ
    const stored1 = mapOf(storage1).get("foo") as Uint8Array;
    const stored2 = mapOf(storage2).get("foo") as Uint8Array;
    expect(isGzip(stored1)).toBe(true);
    expect(stored2.byteLength).not.toBe(stored1.byteLength);

    // 検証: 先に登録した storage1 のチェーンでデコードされる
    expect([...(await kvs.get("foo"))]).toEqual([...data]);
    mapOf(storage1).delete("foo");

    // 検証: フォールバックした storage2 のチェーンでもデコードされる
    expect([...(await kvs.get("foo"))]).toEqual([...data]);
  });
});
