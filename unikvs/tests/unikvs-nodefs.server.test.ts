import { rmSync, readdirSync } from "node:fs";

import { NodeFs } from "@unikvs/fs.node";
import { test, describe, afterEach } from "vite-plus/test";

import { PluginOperationAggregateError } from "../src/errors.js";
import UniKvs from "../src/unikvs.js";
import type { Value } from "../src/value-schemas.js";

const roots: string[] = [];

/**
 * 一時ディレクトリーをルートとするパスを作成します。
 * 生成したルートディレクトリーは afterEach で削除されます。
 */
function createRoot(rootSuffix = ""): string {
  const root = `.tmp-unikvs-nodefs-${Date.now()}${rootSuffix}`;
  roots.push(root);

  return root;
}

describe("UniKvs + NodeFs", () => {
  afterEach(() => {
    // テストの成否に関わらず、生成したルートディレクトリーを削除する。
    for (const root of roots.splice(0)) {
      rmSync(root, {
        force: true,
        recursive: true,
      });
    }
  });

  test("通常のキーで set / get / clear / has が動作する", async ({ expect }) => {
    // 準備：
    await using kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .persist(new NodeFs(createRoot()))
      .create();
    await kvs.open();

    // 実行：
    await kvs.set("foo", new Uint8Array([1]));

    // 検証：
    expect([...(await kvs.get("foo"))]).toEqual([1]);
    await kvs.clear();
    await expect(kvs.has("foo")).resolves.toBe(false);
  });

  test("パストラバーサル系のキーは拒否される", async ({ expect }) => {
    // 準備：
    await using kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .persist(new NodeFs(createRoot()))
      .create();
    await kvs.open();

    // 実行と検証：
    for (const key of ["", ".", "..", "../evil", "a/b", "a\\b"]) {
      await expect(
        kvs.set({
          key: key as never,
          value: new Uint8Array([1]) as never,
        }),
        `key=${JSON.stringify(key)}`,
      ).rejects.toThrow(PluginOperationAggregateError);
    }
  });

  test("ストリーム書き込み中断時、既存データは無傷で一時ファイルも残らない", async ({ expect }) => {
    // 準備：
    const root = createRoot("-abort");
    await using kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .persist(new NodeFs(root))
      .create();
    await kvs.open();
    await kvs.set("foo", new Uint8Array([1, 1, 1]));

    let pulls = 0;
    const slow = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller): void {
        pulls++;
        controller.enqueue(new Uint8Array([9, 9, 9]));
      },
    });
    const ac = new AbortController();

    // 実行 : 書き込み処理が始まるまで待ってから中断する (NodeFs 内部の書き込み開始は外部から観測できないため、実時間の待機を使用する)。
    const p = kvs.set("foo", slow, { signal: ac.signal });

    await new Promise((resolve) => setTimeout(resolve, 30));
    ac.abort(new Error("stop"));

    // 検証：
    expect(pulls).toBeGreaterThan(0);
    await expect(p).rejects.toThrow(PluginOperationAggregateError);
    expect([...(await kvs.get("foo"))]).toEqual([1, 1, 1]);
    expect(readdirSync(root).filter((file) => file.endsWith(".tmp"))).toEqual([]);
  }, 15_000);

  test("同一キーへの並行書き込みでも破損しない", async ({ expect }) => {
    // 準備：
    await using kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .persist(new NodeFs(createRoot("-race")))
      .create();
    await kvs.open();

    // 実行：
    await Promise.all([
      kvs.set("foo", new Uint8Array([1, 1, 1, 1])),
      kvs.set("foo", new Uint8Array([2, 2, 2, 2])),
    ]);

    // 検証 : どちらか一方の値で一貫している。
    const value = await kvs.get("foo");
    expect(value).toHaveLength(4);
    expect(new Set(value.values()).size).toBe(1);
  });
});
