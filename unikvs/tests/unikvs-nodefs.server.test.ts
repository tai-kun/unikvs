import { readdirSync, rmSync } from "node:fs";

import { NodeFs } from "@unikvs/fs.node";
import { afterEach, describe, test } from "vitest";

import { PluginOperationAggregateError } from "../src/errors.js";
import type { Value } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";

const roots: string[] = [];

afterEach(() => {
  // テストの成否に関わらず、生成したルートディレクトリーを削除する。
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * 一時ディレクトリーをルートとする NodeFs ストレージを持つ UniKvs を生成します。
 * 生成したルートディレクトリーは afterEach で削除されます。
 */
function createKvs(rootSuffix = "") {
  const root = `.tmp-unikvs-nodefs-${Date.now()}${rootSuffix}`;
  roots.push(root);
  const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
    .appendStorage(new NodeFs(root))
    .create();
  return { kvs, root };
}

describe("UniKvs + NodeFs", () => {
  test("通常のキーで set / get / clear / has が動作する", async ({ expect }) => {
    // 準備
    const { kvs } = createKvs();
    await kvs.open();

    // 実行
    await kvs.set("foo", new Uint8Array([1]));

    // 検証
    expect([...(await kvs.get("foo"))]).toEqual([1]);
    await kvs.clear();
    expect(await kvs.has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("パストラバーサル系のキーは拒否される", async ({ expect }) => {
    // 準備
    const { kvs } = createKvs();
    await kvs.open();

    // 実行と検証
    for (const key of ["", ".", "..", "../evil", "a/b", "a\\b"]) {
      await expect(
        kvs.set({ key: key as never, value: new Uint8Array([1]) as never }),
        `key=${JSON.stringify(key)}`,
      ).rejects.toThrow(PluginOperationAggregateError);
    }

    // 後片付け
    await kvs.close();
  });

  test("ストリーム書き込み中断時、既存データは無傷で一時ファイルも残らない", async ({ expect }) => {
    // 準備
    const { kvs, root } = createKvs("-abort");
    await kvs.open();
    await kvs.set("foo", new Uint8Array([1, 1, 1]));

    let pulls = 0;
    const slow = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array([9, 9, 9]));
      },
    });
    const ac = new AbortController();

    // 実行
    const p = kvs.set("foo", slow, { signal: ac.signal });
    await new Promise((resolve) => setTimeout(resolve, 30));
    ac.abort(new Error("stop"));

    // 検証
    expect(pulls).toBeGreaterThan(0);
    await expect(p).rejects.toThrow(PluginOperationAggregateError);
    expect([...(await kvs.get("foo"))]).toEqual([1, 1, 1]);
    expect(readdirSync(root).filter((file) => file.endsWith(".tmp"))).toEqual([]);

    // 後片付け
    await kvs.close();
  }, 15000);

  test("同一キーへの並行書き込みでも破損しない", async ({ expect }) => {
    // 準備
    const { kvs } = createKvs("-race");
    await kvs.open();

    // 実行
    await Promise.all([
      kvs.set("foo", new Uint8Array([1, 1, 1, 1])),
      kvs.set("foo", new Uint8Array([2, 2, 2, 2])),
    ]);

    // 検証: どちらか一方の値で一貫している
    const value = await kvs.get("foo");
    expect(value.length).toBe(4);
    expect(new Set(value.values()).size).toBe(1);

    // 後片付け
    await kvs.close();
  });
});
