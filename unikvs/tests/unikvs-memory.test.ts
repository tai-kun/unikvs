import { Memory } from "@unikvs/memory";
import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import type { PlainValue } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";

describe("UniKvs + Memory", () => {
  test("set した値は参照共有される (ミューテーションが反映される)", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<Uint8Array> }>()
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行
    const arr = new Uint8Array([1, 2, 3]);
    await kvs.set("foo", arr);
    arr[0] = 99;
    const got = await kvs.get("foo");

    // 検証: コピーなら 1 のまま
    expect(got[0]).toBe(99);

    // 後片付け
    await kvs.close();
  });

  test("存在しないキーへの操作", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory()).create();
    await kvs.open();

    // 実行と検証
    expect(await kvs.has("foo")).toBe(false);
    await expect(kvs.get("foo")).rejects.toThrow(KeyNotFoundError);
    await expect(kvs.stream("foo" as never)).rejects.toThrow(KeyNotFoundError);
    // delete は存在確認つきなので静かに成功する
    await expect(kvs.delete("foo")).resolves.toBeUndefined();

    // 後片付け
    await kvs.close();
  });
});
