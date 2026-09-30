import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChecksumMismatchError, ChecksumSha256 } from "@unikvs/checksum";
import { Compression } from "@unikvs/compression";
import { NodeFs } from "@unikvs/fs.node";
import { Memory } from "@unikvs/memory";
import { afterEach, describe, test } from "vitest";

import type { Value } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import { collectBytes, streamOf } from "./_helpers.js";

const roots: string[] = [];

afterEach(() => {
  // テストの成否に関わらず、生成した一時ディレクトリーを削除する。
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * 一時ディレクトリーをルートとする NodeFs 用のルートパスを作成します。
 */
function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "unikvs-integration-"));
  roots.push(root);

  return root;
}

/**
 * Memory ストレージ内部の Map をテストから参照するためのアクセサーです。
 */
function mapOf(storage: Memory): Map<string, unknown> {
  return (storage as unknown as { map: Map<string, unknown> }).map;
}

/**
 * gzip のマジックナンバー (0x1f 0x8b) で始まるかを確認します。
 */
function isGzip(data: Uint8Array): boolean {
  return data[0] === 0x1f && data[1] === 0x8b;
}

describe("UniKvs + Memory + NodeFs", () => {
  test("set は両方に書き込まれ、Memory が優先して読み出される", async ({ expect }) => {
    // 準備
    const root = createRoot();
    const memory = new Memory();
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(memory)
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", new Uint8Array([1, 2, 3]));

    // 検証
    expect([...(mapOf(memory).get("foo") as Uint8Array)]).toEqual([1, 2, 3]);
    expect([...readFileSync(join(root, "foo"))]).toEqual([1, 2, 3]);
    expect([...(await kvs.get("foo"))]).toEqual([1, 2, 3]);

    // 後片付け
    await kvs.close();
  });

  test("Memory から消えても NodeFs へフォールバックして読み出せる", async ({ expect }) => {
    // 準備
    const root = createRoot();
    const memory = new Memory();
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(memory)
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();
    await kvs.set("foo", new Uint8Array([4, 5, 6]));
    mapOf(memory).delete("foo");

    // 実行
    const value = await kvs.get("foo");

    // 検証
    expect([...value]).toEqual([4, 5, 6]);

    // 後片付け
    await kvs.close();
  });

  test("delete と clear は両方のストレージに届く", async ({ expect }) => {
    // 準備
    const root = createRoot();
    const memory = new Memory();
    const kvs = UniKvs.config<{
      foo: Value<Uint8Array<ArrayBuffer>>;
      bar: Value<Uint8Array<ArrayBuffer>>;
    }>()
      .appendStorage(memory)
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();
    await kvs.set("foo", new Uint8Array([1]));
    await kvs.set("bar", new Uint8Array([2]));

    // 実行
    await kvs.delete("foo");

    // 検証
    expect(mapOf(memory).has("foo")).toBe(false);
    expect(existsSync(join(root, "foo"))).toBe(false);

    // 実行
    await kvs.clear();

    // 検証
    expect(mapOf(memory).size).toBe(0);
    expect(readdirSync(root)).toEqual([]);

    // 後片付け
    await kvs.close();
  });

  test("ストリーム書き込みも両方に保存され、フォールバックして読み出せる", async ({ expect }) => {
    // 準備
    const root = createRoot();
    const memory = new Memory();
    const kvs = UniKvs.config<{ logs: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(memory)
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();

    // 実行
    await kvs.set(
      "logs",
      streamOf([new Uint8Array([1]), new Uint8Array([2, 3]), new Uint8Array([4])]),
    );

    // 検証
    expect([...(mapOf(memory).get("logs") as Uint8Array)]).toEqual([1, 2, 3, 4]);
    expect([...readFileSync(join(root, "logs"))]).toEqual([1, 2, 3, 4]);

    // 実行: Memory を消して NodeFs から読む
    mapOf(memory).delete("logs");
    const vs = await kvs.stream("logs");

    // 検証
    expect([...(await collectBytes(vs))]).toEqual([1, 2, 3, 4]);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });

  test("Compression + Checksum + NodeFs で検証付きの圧縮往復ができる", async ({ expect }) => {
    // 準備
    const root = createRoot();
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendTransformer(new ChecksumSha256())
      .appendTransformer(new Compression("gzip"))
      .appendStorage(new NodeFs(root))
      .create();
    const data = Uint8Array.from({ length: 256 }, (_, i) => i % 251);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const sum = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const vars = { "@unikvs/checksum:sha256": sum };
    await kvs.open();

    // 実行
    await kvs.set("foo", data, { vars });

    // 検証: ファイルには圧縮後のデータが保存される
    expect(isGzip(readFileSync(join(root, "foo")))).toBe(true);
    expect([...(await kvs.get("foo", { vars }))]).toEqual([...data]);

    // 後片付け
    await kvs.close();
  });

  test("チェックサム不一致の読み取りは ChecksumMismatchError になる", async ({ expect }) => {
    // 準備
    const root = createRoot();
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendTransformer(new ChecksumSha256())
      .appendTransformer(new Compression("gzip"))
      .appendStorage(new NodeFs(root))
      .create();
    const data = new Uint8Array([7, 8, 9]);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const sum = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const wrongSum = "0".repeat(64);
    await kvs.open();
    await kvs.set("foo", data, { vars: { "@unikvs/checksum:sha256": sum } });

    // 実行と検証
    await expect(kvs.get("foo", { vars: { "@unikvs/checksum:sha256": wrongSum } })).rejects.toThrow(
      ChecksumMismatchError,
    );

    // 後片付け
    await kvs.close();
  });
});
