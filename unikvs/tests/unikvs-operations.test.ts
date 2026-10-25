import { test, describe } from "vite-plus/test";

import {
  KeyNotFoundError,
  InvalidInputError,
  PluginOperationAggregateError,
} from "../src/errors.js";
import { Builder } from "../src/index.js";
import type UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import { streamOf, FakeStorage } from "./_helpers.js";

/**
 * 動的キーを受け付ける schema なしの KVS を生成します。
 */
function createDynamicKvs(storage = new FakeStorage()): {
  kvs: UniKvs<Record<string, PlainValue<string>>>;
  storage: FakeStorage;
} {
  const kvs = new Builder<Record<string, PlainValue<string>>>().persist(storage).build();

  return {
    kvs,
    storage,
  };
}

describe("UniKvs - 引数形式の等価性", () => {
  test("set は位置引数形式とオプションオブジェクト形式で同じ結果になる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = createDynamicKvs(storage).kvs;
    await kvs.open();

    // 実行：
    await kvs.set("a", "value-a");
    await kvs.set({
      key: "b",
      value: "value-b",
    });

    // 検証：
    expect(storage.map.get("a")).toBe("value-a");
    expect(storage.map.get("b")).toBe("value-b");
    await expect(kvs.get("a")).resolves.toBe("value-a");
    await expect(kvs.get({ key: "b" })).resolves.toBe("value-b");
  });

  test("has と delete も両形式で同じ結果になる", async ({ expect }) => {
    // 準備：
    await using kvs = createDynamicKvs().kvs;
    await kvs.open();
    await kvs.set("a", "value-a");
    await kvs.set("b", "value-b");

    // 実行と検証：
    await expect(kvs.has("a")).resolves.toBe(true);
    await expect(kvs.has({ key: "a" })).resolves.toBe(true);
    await kvs.delete("a");
    await kvs.delete({ key: "b" });
    await expect(kvs.has("a")).resolves.toBe(false);
    await expect(kvs.has("b")).resolves.toBe(false);
  });

  test("位置引数形式のオプション引数で vars と signal を渡せる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = createDynamicKvs(storage).kvs;
    await kvs.open();

    const signal = new AbortController().signal;

    // 実行：
    await kvs.set("a", "value", {
      vars: { via: "positional" },
      signal,
    });

    await kvs.get("a", { vars: { via: "get" } });
    await kvs.has("a", { vars: { via: "has" } });
    await kvs.delete("a", { vars: { via: "delete" } });

    // 検証：
    expect(storage.callsOf("write")[0]?.vars?.get("via")).toBe("positional");
    expect(storage.callsOf("write")[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(storage.callsOf("read")[0]?.vars?.get("via")).toBe("get");
    expect(
      storage
        .callsOf("exists")
        .find((call) => call.vars?.get("via") === "has")
        ?.vars?.get("via"),
    ).toBe("has");
  });
});

describe("UniKvs - 引数の検証", () => {
  test.for([
    {
      op: (kvs: UniKvs): Promise<unknown> =>
        (kvs.set as unknown as (...args: unknown[]) => Promise<void>)(),
      name: "set の引数なし",
    },
    {
      op: (kvs: UniKvs): Promise<unknown> => kvs.set({ key: "a" } as never),
      name: "set のオブジェクト形式で value 欠落",
    },
    {
      op: (kvs: UniKvs): Promise<unknown> =>
        (kvs.get as unknown as (...args: unknown[]) => Promise<unknown>)(),
      name: "get の引数なし",
    },
    {
      op: (kvs: UniKvs): Promise<unknown> => kvs.get(42 as never),
      name: "get のキーが数値",
    },
    {
      op: (kvs: UniKvs): Promise<unknown> => kvs.get("a", null as never),
      name: "get の options が null",
    },
    {
      op: (kvs: UniKvs): Promise<unknown> => kvs.has(null as never),
      name: "has のキーが null",
    },
    {
      op: (kvs: UniKvs): Promise<unknown> => kvs.delete({} as never),
      name: "delete のキーがオブジェクト",
    },
    {
      op: (kvs: UniKvs): Promise<unknown> => kvs.stream(undefined as never),
      name: "stream のキーが undefined",
    },
    {
      op: (kvs: UniKvs): Promise<unknown> => kvs.clear("all" as never),
      name: "clear の引数が文字列",
    },
  ])("$name は InvalidInputError を投げる", async ({ op }, { expect }) => {
    // 準備：
    await using kvs = createDynamicKvs().kvs;
    await kvs.open();

    // 実行と検証：
    await expect(op(kvs)).rejects.toThrow(InvalidInputError);
  });

  test("無効な引数でも KVS は壊れず次の操作が成功する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = createDynamicKvs(storage).kvs;
    await kvs.open();

    // 実行：
    await expect(kvs.set(undefined as never)).rejects.toThrow(InvalidInputError);

    // 検証：
    await kvs.set("a", "value");
    expect(storage.map.get("a")).toBe("value");
  });
});

describe("UniKvs - キーの境界", () => {
  test("空文字キーでも set/get/has/delete が動作する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = createDynamicKvs(storage).kvs;
    await kvs.open();

    // 実行：
    await kvs.set("", "empty-key");

    // 検証：
    await expect(kvs.has("")).resolves.toBe(true);
    await expect(kvs.get("")).resolves.toBe("empty-key");
    expect(storage.map.has("")).toBe(true);
    await kvs.delete("");
    await expect(kvs.has("")).resolves.toBe(false);
  });

  test("長いキー・Unicode・制御文字を含むキーでも動作する", async ({ expect }) => {
    // 準備：
    await using kvs = createDynamicKvs().kvs;
    await kvs.open();

    const keys = [
      "k".repeat(10_000),
      "日本語のキー🔑",
      "line\nbreak",
      "null\u0000char",
      "  spaced  ",
    ];

    // 実行と検証：
    for (const [index, key] of keys.entries()) {
      await kvs.set(key, `value-${index}`);
      await expect(kvs.get(key)).resolves.toBe(`value-${index}`);
      await expect(kvs.has(key)).resolves.toBe(true);
    }
  });

  test("get の KeyNotFoundError は meta.key に対象キーを保持する", async ({ expect }) => {
    // 準備：
    await using kvs = createDynamicKvs().kvs;
    await kvs.open();

    // 実行：
    const getting = kvs.get("missing");

    // 検証：
    await expect(getting).rejects.toThrow(KeyNotFoundError);
    await expect(getting).rejects.toMatchObject({ meta: { key: "missing" } });
  });
});

describe("UniKvs - 基本操作の不変条件", () => {
  test("同じキーへ set を繰り返すと最後の値で上書きされる", async ({ expect }) => {
    // 準備：
    await using kvs = createDynamicKvs().kvs;
    await kvs.open();

    // 実行：
    await kvs.set("a", "first");
    await kvs.set("a", "second");
    await kvs.set("a", "third");

    // 検証：
    await expect(kvs.get("a")).resolves.toBe("third");
  });

  test("複数キーの操作が互いに干渉しない", async ({ expect }) => {
    // 準備：
    await using kvs = createDynamicKvs().kvs;
    await kvs.open();

    // 実行：
    await kvs.set("a", "va");
    await kvs.set("b", "vb");
    await kvs.delete("a");

    // 検証：
    await expect(kvs.has("a")).resolves.toBe(false);
    await expect(kvs.get("b")).resolves.toBe("vb");
  });

  test("clear は削除後の再 set も含めて一貫して動作する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = createDynamicKvs(storage).kvs;
    await kvs.open();
    await kvs.set("a", "va");
    await kvs.set("b", "vb");

    // 実行：
    await kvs.clear();

    // 検証：
    expect(storage.map.size).toBe(0);
    await expect(kvs.get("a")).rejects.toThrow(KeyNotFoundError);
    await expect(kvs.has("b")).resolves.toBe(false);

    // 実行：
    await kvs.set("c", "vc");

    // 検証：
    await expect(kvs.get("c")).resolves.toBe("vc");
    await expect(kvs.has("a")).resolves.toBe(false);
  });

  test("存在しないキーの delete は成功し、既存キーにも影響しない", async ({ expect }) => {
    // 準備：
    await using kvs = createDynamicKvs().kvs;
    await kvs.open();
    await kvs.set("a", "va");

    // 実行と検証：
    await expect(kvs.delete("missing")).resolves.toBeUndefined();
    await expect(kvs.get("a")).resolves.toBe("va");
  });
});

describe("UniKvs - stream キーと plain キーの入力の取り違え (schema なし)", () => {
  test("StreamValue キーにプレーン値は書き込めず PluginOperationAggregateError になる", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>().persist(storage).build();
    await kvs.open();

    // 実行と検証 : schema なしでは検証されないが、値はプレーン書き込みとして扱われる。
    await expect(kvs.set("logs", "plain" as never)).resolves.toBeUndefined();
    expect(storage.map.get("logs")).toBe("plain");
  });

  test("stream に対応しないストレージへのストリーム書き込みは集約エラーになる", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>().persist(storage).build();
    await kvs.open();

    // 実行：
    const setting = kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証：
    await expect(setting).rejects.toThrow(PluginOperationAggregateError);
    await expect(setting).rejects.toMatchObject({ meta: { action: "write" } });

    expect(storage.map.has("logs")).toBe(false);
  });
});
