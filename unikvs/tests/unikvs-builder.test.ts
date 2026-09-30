import { Memory } from "@unikvs/memory";
import { describe, test } from "vitest";

import { MissingStorageError } from "../src/errors.js";
import type { PlainValue } from "../src/unikvs-config.js";
import UniKvsConfig from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import { FakeStorage, FakeTransformer } from "./_helpers.js";

/**
 * encode のたびに自身のタグを末尾へ付与し、decode で除去するトランスフォーマーです。
 * 前段パイプラインの適用順序とストレージごとの分岐を検証するために使用します。
 */
class TagTransformer extends FakeTransformer {
  readonly #tag: string;

  public constructor(tag: string) {
    super(`Tag(${tag})`);
    this.#tag = tag;
  }

  public override async encode(args: Parameters<FakeTransformer["encode"]>[0]): Promise<string> {
    const data = await super.encode(args);
    return `${String(data)}${this.#tag}`;
  }

  public override async decode(args: Parameters<FakeTransformer["decode"]>[0]): Promise<string> {
    const data = String(await super.decode(args));
    return data.endsWith(this.#tag) ? data.slice(0, -this.#tag.length) : data;
  }
}

describe("UniKvsConfig - ビルダーの構成", () => {
  test("schema なしでストレージを 1 つ追加して create できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();

    // 実行
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();
    await kvs.set("foo", "bar");

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(storage.map.get("foo")).toBe("bar");

    // 後片付け
    await kvs.close();
  });

  test("空のオプションオブジェクトでも config できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();

    // 実行
    const kvs = UniKvs.config({}).appendStorage(storage).create();
    await kvs.open();

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(kvs.isOpen).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("ストレージを登録せず create すると MissingStorageError を投げる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs).appendTransformer(new FakeTransformer());

    // 実行と検証
    expect(() => config.create()).toThrow(MissingStorageError);
  });

  test("create を複数回呼ぶと独立したインスタンスが生成される", async ({ expect }) => {
    // 準備
    const config = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(new Memory());

    // 実行
    const kvs1 = config.create();
    const kvs2 = config.create();
    await kvs1.open();

    // 検証: isOpen はインスタンスごとに独立している
    expect(kvs1).not.toBe(kvs2);
    expect(kvs1.isOpen).toBe(true);
    expect(kvs2.isOpen).toBe(false);

    // 後片付け
    await kvs1.close();
  });

  test("同じ Transformer を複数回 append するとその回数だけ適用される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendTransformer(new TagTransformer("X"))
      .appendTransformer(new TagTransformer("X"))
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "a");

    // 検証
    expect(storage.map.get("foo")).toBe("aXX");

    // 後片付け
    await kvs.close();
  });

  test("同じ Storage を複数回 append するとすべての登録先へ書き込まれる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage)
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    expect(storage.callsOf("write")).toHaveLength(2);
    expect(storage.map.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });

  test("多数の Storage を append してもすべてに書き込まれる", async ({ expect }) => {
    // 準備
    const storages = Array.from({ length: 25 }, (_, i) => new FakeStorage(`storage-${i}`));
    const [first, ...rest] = storages;
    const config = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(first!);
    const kvs = rest.reduce((c, storage) => c.appendStorage(storage), config).create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    for (const storage of storages) {
      expect(storage.map.get("foo")).toBe("value");
    }

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvsConfig - トランスフォーマーとストレージの捕捉", () => {
  test("appendStorage はその時点のトランスフォーマー数を捕捉する", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendTransformer(new TagTransformer("1"))
      .appendStorage(storage1)
      .appendTransformer(new TagTransformer("2"))
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storage1.map.get("foo")).toBe("x1");
    expect(storage2.map.get("foo")).toBe("x12");

    // 後片付け
    await kvs.close();
  });

  test("ストレージ登録後にトランスフォーマーを追加しても既存ストレージの前段は変わらない", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(storage1)
      .appendTransformer(new TagTransformer("1"))
      .appendStorage(storage2)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storage1.map.get("foo")).toBe("x");
    expect(storage2.map.get("foo")).toBe("x1");

    // 後片付け
    await kvs.close();
  });

  test("get は書き込み時と同じストレージ別チェーンでデコードする", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendTransformer(new TagTransformer("1"))
      .appendStorage(storage1)
      .appendTransformer(new TagTransformer("2"))
      .appendStorage(storage2)
      .create();
    await kvs.open();
    await kvs.set("foo", "x");
    storage1.map.delete("foo");

    // 実行
    const value = await kvs.get("foo");

    // 検証
    expect(value).toBe("x");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvsConfig - setVariables", () => {
  test("オブジェクト形式の変数はすべての操作へ渡される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables({ app: "builder", region: "tokyo" })
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    const vars = storage.callsOf("write")[0]?.vars;
    expect(vars?.["app"]).toBe("builder");
    expect(vars?.["region"]).toBe("tokyo");

    // 後片付け
    await kvs.close();
  });

  test("エントリー配列形式の変数もオブジェクト形式と同じように渡される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables([
        ["app", "builder"],
        ["attempt", 3],
      ])
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    const vars = storage.callsOf("write")[0]?.vars;
    expect(vars?.["app"]).toBe("builder");
    expect(vars?.["attempt"]).toBe(3);

    // 後片付け
    await kvs.close();
  });

  test("setVariables を再び呼ぶと以前の変数は置換される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables({ a: 1, b: 2 })
      .setVariables({ b: 3 })
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    const vars = storage.callsOf("write")[0]?.vars;
    expect(vars).not.toHaveProperty("a");
    expect(vars?.["b"]).toBe(3);

    // 後片付け
    await kvs.close();
  });

  test("空オブジェクトを setVariables すると変数は空になる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables({ a: 1 })
      .setVariables({})
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storage.callsOf("write")[0]?.vars).not.toHaveProperty("a");

    // 後片付け
    await kvs.close();
  });

  test("setVariables に渡した元オブジェクトを変更しても生成済みクライアントに影響しない", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const vars = { a: "before" };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables(vars)
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    vars.a = "after";
    await kvs.set("foo", "x");

    // 検証
    expect(storage.callsOf("write")[0]?.vars?.["a"]).toBe("before");

    // 後片付け
    await kvs.close();
  });

  test("create 前に setVariables の元オブジェクトを変更しても影響しない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const vars = { a: "before" };
    const config = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables(vars)
      .appendStorage(storage);

    // 実行
    vars.a = "after";
    const kvs = config.create();
    await kvs.open();
    await kvs.set("foo", "x");

    // 検証
    expect(storage.callsOf("write")[0]?.vars?.["a"]).toBe("before");

    // 後片付け
    await kvs.close();
  });
});
