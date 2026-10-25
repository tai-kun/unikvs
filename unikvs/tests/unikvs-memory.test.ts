import { Memory } from "@unikvs/memory";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import { Builder } from "../src/index.js";
import type { PlainValue } from "../src/value-schemas.js";

describe("UniKvs + Memory", () => {
  test("set した値は複製される (ミューテーションが反映されない)", async ({ expect }) => {
    // 準備：
    await using kvs = new Builder<{ foo: PlainValue<Uint8Array> }>().persist(new Memory()).build();
    await kvs.open();

    // 実行：
    const arr = new Uint8Array([1, 2, 3]);
    await kvs.set("foo", arr);
    arr[0] = 99;

    const got = await kvs.get("foo");

    // 検証 : Memory は structuredClone で複製するため 1 のまま。
    expect(got[0]).toBe(1);
  });

  test("存在しないキーへの操作", async ({ expect }) => {
    // 準備：
    await using kvs = new Builder<{ foo: PlainValue<string> }>().persist(new Memory()).build();
    await kvs.open();

    // 実行と検証：
    await expect(kvs.has("foo")).resolves.toBe(false);
    await expect(kvs.get("foo")).rejects.toThrow(KeyNotFoundError);
    await expect(kvs.stream("foo" as never)).rejects.toThrow(KeyNotFoundError);
    // delete は存在確認つきなので静かに成功する。
    await expect(kvs.delete("foo")).resolves.toBeUndefined();
  });
});
