import type { IMiddleware } from "@unikvs/core";
import { describe, test } from "vitest";

import {
  DecodableStreamNotSupportedError,
  EncodableStreamNotSupportedError,
  PluginOperationAggregateError,
  MiddlewareIsNotOpenError,
} from "../src/errors.js";
import UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  FakeStorage,
  FakeStreamStorage,
  FakeStreamTransformer,
  FakeTransformer,
  streamOf,
} from "./_helpers.js";

/**
 * encode のたびに自身のタグを末尾へ付与し、decode で除去するトランスフォーマーです。
 * チェーンの適用順序を検証するために使用します。
 */
class TagTransformer extends FakeTransformer {
  readonly #tag: string;

  public constructor(tag: string) {
    super(`Tag(${tag})`);
    this.#tag = tag;
  }

  public override async encode(...args: Parameters<FakeTransformer["encode"]>): Promise<void> {
    const [c, next] = args;
    await this.record("encode", { data: c.source, c });
    c.destination = `${String(c.source)}${this.#tag}`;
    await next!();
  }

  public override async decode(...args: Parameters<FakeTransformer["decode"]>): Promise<void> {
    const [c, next] = args;
    await this.record("decode", { data: c.source, c });
    const data = String(c.source);
    c.destination = data.endsWith(this.#tag) ? data.slice(0, -this.#tag.length) : data;
    await next!();
  }
}

describe("UniKvs - トランスフォーマーのライフサイクル", () => {
  test("閉じたトランスフォーマーは open で開かれ、close で閉じられる", async ({ expect }) => {
    // 準備
    const transformer = new FakeTransformer();
    expect(transformer.isOpen).toBe(false);
    const kvs = UniKvs.config().connect(transformer).persist(new FakeStorage()).create();

    // 実行
    await kvs.open();

    // 検証
    expect(transformer.isOpen).toBe(true);
    expect(transformer.callsOf("open")).toHaveLength(1);

    // 実行
    await kvs.close();

    // 検証
    expect(transformer.isOpen).toBe(false);
    expect(transformer.callsOf("close")).toHaveLength(1);
  });

  test("既に開いているトランスフォーマーは open/close を呼ばれない", async ({ expect }) => {
    // 準備
    const transformer = new FakeTransformer();
    transformer.isOpen = true;
    const kvs = UniKvs.config().connect(transformer).persist(new FakeStorage()).create();

    // 実行
    await kvs.open();
    await kvs.close();

    // 検証
    expect(transformer.callsOf("open")).toHaveLength(0);
    expect(transformer.callsOf("close")).toHaveLength(0);
    expect(transformer.isOpen).toBe(true);
  });

  test("クローズドのミドルウェアでの set/get は集約経由で MiddlewareIsNotOpenError を投げる", async ({
    expect,
  }) => {
    // 準備
    const transformer = new FakeTransformer();
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(transformer)
      .persist(storage)
      .create();
    await kvs.open();
    transformer.isOpen = false;

    // 実行と検証: `use` の失敗は集約されて投げられる
    const setError = await kvs.set("foo", "value").catch((ex) => ex);
    expect(setError).toBeInstanceOf(PluginOperationAggregateError);
    expect((setError as PluginOperationAggregateError).meta.errors[0]?.reason).toBeInstanceOf(
      MiddlewareIsNotOpenError,
    );
    const getError = await kvs.get("foo").catch((ex) => ex);
    expect(getError).toBeInstanceOf(PluginOperationAggregateError);
    expect((getError as PluginOperationAggregateError).meta.errors[0]?.reason).toBeInstanceOf(
      MiddlewareIsNotOpenError,
    );

    // 後片付け
    transformer.isOpen = true;
    await kvs.close();
  });
});

describe("UniKvs - チェーンの順序", () => {
  test("3 つのトランスフォーマーは set で順方向、get で逆方向に適用される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const t1 = new TagTransformer("1");
    const t2 = new TagTransformer("2");
    const t3 = new TagTransformer("3");
    const decodeOrder: string[] = [];
    t1.hook = (call) => {
      if (call.method === "decode") decodeOrder.push("1");
    };
    t2.hook = (call) => {
      if (call.method === "decode") decodeOrder.push("2");
    };
    t3.hook = (call) => {
      if (call.method === "decode") decodeOrder.push("3");
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(t1)
      .connect(t2)
      .connect(t3)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証: encode は登録順
    expect(storage.map.get("foo")).toBe("x123");
    expect(await kvs.get("foo")).toBe("x");

    // 検証: decode は登録の逆順
    expect(decodeOrder).toStrictEqual(["3", "2", "1"]);

    // 後片付け
    await kvs.close();
  });

  test("ストレージごとに encode が独立に実行される", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const storage3 = new FakeStorage("storage3");
    const t1 = new TagTransformer("1");
    const t2 = new TagTransformer("2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(t1)
      .connect(t2)
      .persist(storage1)
      .persist(storage2)
      .persist(storage3)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(t1.callsOf("encode")).toHaveLength(1);
    expect(t2.callsOf("encode")).toHaveLength(1);
    expect(storage1.map.get("foo")).toBe("x12");
    expect(storage2.map.get("foo")).toBe("x12");
    expect(storage3.map.get("foo")).toBe("x12");

    // 後片付け
    await kvs.close();
  });

  test("vars はチェーンを流れ、後段のトランスフォーマーにも渡される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const t1 = new FakeTransformer("t1");
    const t2 = new FakeTransformer("t2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(t1)
      .connect(t2)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x", { vars: { request: "r" } });

    // 検証
    expect(t1.callsOf("encode")[0]?.vars?.get("request")).toBe("r");
    expect(t2.callsOf("encode")[0]?.vars?.get("request")).toBe("r");
    expect(t2.callsOf("encode")[0]?.data).toBe("x");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - ストリーム対応トランスフォーマー", () => {
  test("ストリーム書き込みではストレージごとに getEncodable が呼ばれる", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStreamStorage("storage1");
    const storage2 = new FakeStreamStorage("storage2");
    const t1 = new FakeStreamTransformer("t1");
    const t2 = new FakeStreamTransformer("t2");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(t1)
      .connect(t2)
      .persist(storage1)
      .persist(storage2)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証
    expect(t1.callsOf("getEncodable")).toHaveLength(1);
    expect(t2.callsOf("getEncodable")).toHaveLength(1);

    // 後片付け
    await kvs.close();
  });

  test("ストリーム読み取りでは getDecodable が逆順で呼ばれる", async ({ expect }) => {
    // 準備
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);
    const t1 = new FakeStreamTransformer("t1");
    const t2 = new FakeStreamTransformer("t2");
    const t3 = new FakeStreamTransformer("t3");
    const decodableOrder: string[] = [];
    t1.hook = (call) => {
      if (call.method === "getDecodable") decodableOrder.push("t1");
    };
    t2.hook = (call) => {
      if (call.method === "getDecodable") decodableOrder.push("t2");
    };
    t3.hook = (call) => {
      if (call.method === "getDecodable") decodableOrder.push("t3");
    };
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(t1)
      .connect(t2)
      .connect(t3)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const vs = await kvs.stream("logs");
    await vs.dispose();

    // 検証
    expect(t3.callsOf("getDecodable")).toHaveLength(1);
    expect(t2.callsOf("getDecodable")).toHaveLength(1);
    expect(t1.callsOf("getDecodable")).toHaveLength(1);
    expect(decodableOrder).toStrictEqual(["t3", "t2", "t1"]);

    // 後片付け
    await kvs.close();
  });

  test("ストリーム非対応のトランスフォーマーへのストリーム書き込みは EncodableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new FakeTransformer())
      .persist(new FakeStreamStorage())
      .create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.set("logs", streamOf([new Uint8Array([1])]))).rejects.toThrow(
      EncodableStreamNotSupportedError,
    );

    // 後片付け
    await kvs.close();
  });

  test("ストリーム非対応のトランスフォーマーからのストリーム読み取りは DecodableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new FakeTransformer())
      .persist(storage)
      .create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.stream("logs")).rejects.toThrow(DecodableStreamNotSupportedError);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - トランスフォーマーのエラー伝播", () => {
  test("decode のエラーはそのまま伝播する", async ({ expect }) => {
    // 準備
    const transformer = new FakeTransformer();
    transformer.errors["decode"] = new Error("decode boom");
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(transformer)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.get("foo")).rejects.toThrow("decode boom");

    // 後片付け
    await kvs.close();
  });

  test("encode のエラー後も KVS は壊れず、失敗したキーは保存されない", async ({ expect }) => {
    // 準備
    const transformer = new FakeTransformer();
    transformer.errors["encode"] = new Error("encode boom");
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(transformer)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行と検証
    await expect(kvs.set("foo", "value")).rejects.toThrow("encode boom");
    expect(storage.map.has("foo")).toBe(false);

    // 実行
    delete transformer.errors["encode"];
    await kvs.set("foo", "value");

    // 検証
    expect(await kvs.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - トランスフォーマーフック", () => {
  test("has は onExists をキー付きで呼び、vars 変異は storage に引き継がれる", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    const keys: string[] = [];
    class ExistsHook extends FakeTransformer {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        if (c.action === "has") {
          keys.push(c.key);
          c.set("checkedBy", "hook");
        }
        await next();
      }
    }
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new ExistsHook())
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const result = await kvs.has("foo");

    // 検証
    expect(result).toBe(true);
    expect(keys).toStrictEqual(["foo"]);
    expect(storage.callsOf("exists")[0]?.vars?.get("checkedBy")).toBe("hook");

    // 後片付け
    await kvs.close();
  });

  test("delete は onDelete を呼び、共有トランスフォーマーでも1回だけ実行される", async ({
    expect,
  }) => {
    // 準備
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    a.map.set("foo", "stored");
    b.map.set("foo", "stored");
    const keys: string[] = [];
    class DeleteHook extends FakeTransformer {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        if (c.action === "delete") {
          keys.push(c.key);
          c.set("deletedBy", "hook");
        }
        await next();
      }
    }
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new DeleteHook())
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    await kvs.delete("foo");

    // 検証: 宛先が2件でもフックは1回、両宛先に vars 変異が引き継がれる
    expect(keys).toStrictEqual(["foo"]);
    expect(a.callsOf("delete")[0]?.vars?.get("deletedBy")).toBe("hook");
    expect(b.callsOf("delete")[0]?.vars?.get("deletedBy")).toBe("hook");

    // 後片付け
    await kvs.close();
  });

  test("onExists の失敗は取りまとめられて has から投げられ、storage には触れない", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    class DenyExists extends FakeTransformer {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        if (c.action === "has") {
          throw new Error("exists denied");
        }
        await next();
      }
    }
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new DenyExists())
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.has("foo").catch((ex) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.plugin).toBe("middleware");
    expect(aggregate.meta.action).toBe("read");
    expect(aggregate.meta.errors.map((e) => (e.reason as Error).message)).toStrictEqual([
      "exists denied",
    ]);
    expect(storage.callsOf("exists")).toHaveLength(0);

    // 後片付け
    await kvs.close();
  });

  test("onDelete の失敗は取りまとめられて delete から投げられ、storage から削除されない", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    class DenyDelete extends FakeTransformer {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        if (c.action === "delete") {
          throw new Error("delete denied");
        }
        await next();
      }
    }
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new DenyDelete())
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.delete("foo").catch((ex) => ex);

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.plugin).toBe("middleware");
    expect(aggregate.meta.action).toBe("delete");
    expect(aggregate.meta.errors.map((e) => (e.reason as Error).message)).toStrictEqual([
      "delete denied",
    ]);
    expect(storage.callsOf("delete")).toHaveLength(0);
    expect(storage.map.has("foo")).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("複数の use の失敗は fail-fast で1件目が報告される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    class BoomDelete extends FakeTransformer {
      readonly #message: string;

      public constructor(name: string, message: string) {
        super(name);
        this.#message = message;
      }

      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        if (c.action === "delete") {
          throw new Error(this.#message);
        }
        await next();
      }
    }
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new BoomDelete("boom1", "first"))
      .connect(new BoomDelete("boom2", "second"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.delete("foo").catch((ex) => ex);

    // 検証: オニオン実行では先頭の失敗で即時確定し、後段は実行されない
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.plugin).toBe("middleware");
    expect(aggregate.meta.action).toBe("delete");
    expect(aggregate.meta.errors.map((e) => (e.reason as Error).message)).toStrictEqual(["first"]);
    expect(aggregate.meta.errors.map((e) => [e.name, e.index])).toStrictEqual([["boom1", 0]]);
    expect(storage.callsOf("delete")).toHaveLength(0);

    // 後片付け
    await kvs.close();
  });
});
