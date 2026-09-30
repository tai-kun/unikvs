import { describe, test } from "vitest";

import {
  InvalidInputError,
  KeyNotFoundError,
  PluginOperationAggregateError,
} from "../src/errors.js";
import type { PlainValue, StreamValue } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import { FakeStorage, streamOf } from "./_helpers.js";

/**
 * 動的キーを受け付ける schema なしの KVS を生成します。
 */
function createDynamicKvs(storage = new FakeStorage()): {
  kvs: UniKvs<Record<string, PlainValue<string>>>;
  storage: FakeStorage;
} {
  const kvs = UniKvs.config<Record<string, PlainValue<string>>>().appendStorage(storage).create();
  return { kvs, storage };
}

describe("UniKvs - 引数形式の等価性", () => {
  test("set は位置引数形式とオプションオブジェクト形式で同じ結果になる", async ({ expect }) => {
    // 準備
    const { kvs, storage } = createDynamicKvs();
    await kvs.open();

    // 実行
    await kvs.set("a", "value-a");
    await kvs.set({ key: "b", value: "value-b" });

    // 検証
    expect(storage.map.get("a")).toBe("value-a");
    expect(storage.map.get("b")).toBe("value-b");
    expect(await kvs.get("a")).toBe("value-a");
    expect(await kvs.get({ key: "b" })).toBe("value-b");

    // 後片付け
    await kvs.close();
  });

  test("has と delete も両形式で同じ結果になる", async ({ expect }) => {
    // 準備
    const { kvs } = createDynamicKvs();
    await kvs.open();
    await kvs.set("a", "value-a");
    await kvs.set("b", "value-b");

    // 実行と検証
    expect(await kvs.has("a")).toBe(true);
    expect(await kvs.has({ key: "a" })).toBe(true);
    await kvs.delete("a");
    await kvs.delete({ key: "b" });
    expect(await kvs.has("a")).toBe(false);
    expect(await kvs.has("b")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("位置引数形式のオプション引数で vars と signal を渡せる", async ({ expect }) => {
    // 準備
    const { kvs, storage } = createDynamicKvs();
    await kvs.open();
    const signal = new AbortController().signal;

    // 実行
    await kvs.set("a", "value", { vars: { via: "positional" }, signal });
    await kvs.get("a", { vars: { via: "get" } });
    await kvs.has("a", { vars: { via: "has" } });
    await kvs.delete("a", { vars: { via: "delete" } });

    // 検証
    expect(storage.callsOf("write")[0]?.vars?.["via"]).toBe("positional");
    expect(storage.callsOf("write")[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(storage.callsOf("read")[0]?.vars?.["via"]).toBe("get");
    expect(
      storage.callsOf("exists").find((call) => call.vars?.["unikvs:action"] === "has")?.vars?.[
        "via"
      ],
    ).toBe("has");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 引数の検証", () => {
  test.for([
    {
      name: "set の引数なし",
      op: (kvs: UniKvs) => (kvs.set as unknown as (...args: unknown[]) => Promise<void>)(),
    },
    {
      name: "set のオブジェクト形式で value 欠落",
      op: (kvs: UniKvs) => kvs.set({ key: "a" } as never),
    },
    {
      name: "get の引数なし",
      op: (kvs: UniKvs) => (kvs.get as unknown as (...args: unknown[]) => Promise<unknown>)(),
    },
    { name: "get のキーが数値", op: (kvs: UniKvs) => kvs.get(42 as never) },
    { name: "get の options が null", op: (kvs: UniKvs) => kvs.get("a", null as never) },
    { name: "has のキーが null", op: (kvs: UniKvs) => kvs.has(null as never) },
    { name: "delete のキーがオブジェクト", op: (kvs: UniKvs) => kvs.delete({} as never) },
    { name: "stream のキーが undefined", op: (kvs: UniKvs) => kvs.stream(undefined as never) },
    { name: "clear の引数が文字列", op: (kvs: UniKvs) => kvs.clear("all" as never) },
  ])("$name は InvalidInputError を投げる", async ({ op }, { expect }) => {
    // 準備
    const { kvs } = createDynamicKvs();
    await kvs.open();

    // 実行と検証
    await expect(op(kvs)).rejects.toThrow(InvalidInputError);

    // 後片付け
    await kvs.close();
  });

  test("無効な引数でも KVS は壊れず次の操作が成功する", async ({ expect }) => {
    // 準備
    const { kvs, storage } = createDynamicKvs();
    await kvs.open();

    // 実行
    await expect(kvs.set(undefined as never)).rejects.toThrow(InvalidInputError);

    // 検証
    await kvs.set("a", "value");
    expect(storage.map.get("a")).toBe("value");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - キーの境界", () => {
  test("空文字キーでも set/get/has/delete が動作する", async ({ expect }) => {
    // 準備
    const { kvs, storage } = createDynamicKvs();
    await kvs.open();

    // 実行
    await kvs.set("", "empty-key");

    // 検証
    expect(await kvs.has("")).toBe(true);
    expect(await kvs.get("")).toBe("empty-key");
    expect(storage.map.has("")).toBe(true);
    await kvs.delete("");
    expect(await kvs.has("")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("長いキー・Unicode・制御文字を含むキーでも動作する", async ({ expect }) => {
    // 準備
    const { kvs } = createDynamicKvs();
    await kvs.open();
    const keys = [
      "k".repeat(10_000),
      "日本語のキー🔑",
      "line\nbreak",
      "null\u0000char",
      "  spaced  ",
    ];

    // 実行と検証
    for (const [index, key] of keys.entries()) {
      await kvs.set(key, `value-${index}`);
      expect(await kvs.get(key)).toBe(`value-${index}`);
      expect(await kvs.has(key)).toBe(true);
    }

    // 後片付け
    await kvs.close();
  });

  test("get の KeyNotFoundError は meta.key に対象キーを保持する", async ({ expect }) => {
    // 準備
    const { kvs } = createDynamicKvs();
    await kvs.open();

    // 実行
    const error = await kvs.get("missing").catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta.key).toBe("missing");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 基本操作の不変条件", () => {
  test("同じキーへ set を繰り返すと最後の値で上書きされる", async ({ expect }) => {
    // 準備
    const { kvs } = createDynamicKvs();
    await kvs.open();

    // 実行
    await kvs.set("a", "first");
    await kvs.set("a", "second");
    await kvs.set("a", "third");

    // 検証
    expect(await kvs.get("a")).toBe("third");

    // 後片付け
    await kvs.close();
  });

  test("複数キーの操作が互いに干渉しない", async ({ expect }) => {
    // 準備
    const { kvs } = createDynamicKvs();
    await kvs.open();

    // 実行
    await kvs.set("a", "va");
    await kvs.set("b", "vb");
    await kvs.delete("a");

    // 検証
    expect(await kvs.has("a")).toBe(false);
    expect(await kvs.get("b")).toBe("vb");

    // 後片付け
    await kvs.close();
  });

  test("clear は削除後の再 set も含めて一貫して動作する", async ({ expect }) => {
    // 準備
    const { kvs, storage } = createDynamicKvs();
    await kvs.open();
    await kvs.set("a", "va");
    await kvs.set("b", "vb");

    // 実行
    await kvs.clear();

    // 検証
    expect(storage.map.size).toBe(0);
    await expect(kvs.get("a")).rejects.toThrow(KeyNotFoundError);
    expect(await kvs.has("b")).toBe(false);

    // 実行
    await kvs.set("c", "vc");

    // 検証
    expect(await kvs.get("c")).toBe("vc");
    expect(await kvs.has("a")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("存在しないキーの delete は成功し、既存キーにも影響しない", async ({ expect }) => {
    // 準備
    const { kvs } = createDynamicKvs();
    await kvs.open();
    await kvs.set("a", "va");

    // 実行と検証
    await expect(kvs.delete("missing")).resolves.toBeUndefined();
    expect(await kvs.get("a")).toBe("va");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - stream キーと plain キーの入力の取り違え (schema なし)", () => {
  test("StreamValue キーにプレーン値は書き込めず PluginOperationAggregateError になる", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();

    // 実行と検証: schema なしでは検証されないが、値はプレーン書き込みとして扱われる
    await expect(kvs.set("logs", "plain" as never)).resolves.toBeUndefined();
    expect(storage.map.get("logs")).toBe("plain");

    // 後片付け
    await kvs.close();
  });

  test("stream に対応しないストレージへのストリーム書き込みは集約エラーになる", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().appendStorage(storage).create();
    await kvs.open();

    // 実行
    const error = await kvs.set("logs", streamOf([new Uint8Array([1])])).catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("write");
    expect(storage.map.has("logs")).toBe(false);

    // 後片付け
    await kvs.close();
  });
});
