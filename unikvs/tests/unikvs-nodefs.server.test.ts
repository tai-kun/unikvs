import { NodeFs } from "@unikvs/fs.node";
import { describe, test } from "vitest";

import { PluginOperationAggregateError } from "../src/errors.js";
import type { Value } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";

describe("UniKvs + NodeFs", () => {
  test("特殊なキーの受容/拒否と基本動作", async ({ expect }) => {
    const root = `.tmp-unikvs-nodefs-${Date.now()}`;
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();
    await kvs.set("foo", new Uint8Array([1]));
    expect([...(await kvs.get("foo"))]).toEqual([1]);
    // パストラバーサル系は拒否されるべき
    for (const key of ["", ".", "..", "../evil", "a/b", "a\\b"]) {
      await expect(
        kvs.set({ key: key as never, value: new Uint8Array([1]) as never }),
        `key=${JSON.stringify(key)}`,
      ).rejects.toThrow(PluginOperationAggregateError);
    }
    await kvs.clear();
    expect(await kvs.has("foo")).toBe(false);
    await kvs.close();
    const { rmSync } = await import("node:fs");
    rmSync(root, { recursive: true, force: true });
  });

  test("ストリーム書き込み中断時、既存データは無傷で一時ファイルも残らない", async ({ expect }) => {
    const root = `.tmp-unikvs-nodefs-${Date.now()}-abort`;
    const { readdirSync } = await import("node:fs");
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(new NodeFs(root))
      .create();
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
    const p = kvs.set("foo", slow, { signal: ac.signal });
    await new Promise((r) => setTimeout(r, 30));
    expect(pulls).toBeGreaterThan(0);
    ac.abort(new Error("stop"));
    await expect(p).rejects.toThrow(PluginOperationAggregateError);

    // 既存データは無傷
    expect([...(await kvs.get("foo"))]).toEqual([1, 1, 1]);
    // 一時ファイルが残っていないこと
    expect(readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    await kvs.close();
    const { rmSync } = await import("node:fs");
    rmSync(root, { recursive: true, force: true });
  }, 15000);

  test("同一キーへの並行書き込みでも破損しない", async ({ expect }) => {
    const root = `.tmp-unikvs-nodefs-${Date.now()}-race`;
    const kvs = UniKvs.config<{ foo: Value<Uint8Array<ArrayBuffer>> }>()
      .appendStorage(new NodeFs(root))
      .create();
    await kvs.open();
    await Promise.all([
      kvs.set("foo", new Uint8Array([1, 1, 1, 1])),
      kvs.set("foo", new Uint8Array([2, 2, 2, 2])),
    ]);
    const v = await kvs.get("foo");
    expect(v.length).toBe(4);
    expect(new Set(v.values()).size).toBe(1); // どちらか一方の値で一貫している
    await kvs.close();
    const { rmSync } = await import("node:fs");
    rmSync(root, { recursive: true, force: true });
  });
});
