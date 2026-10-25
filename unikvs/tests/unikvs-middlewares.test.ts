import type { IMiddleware } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import {
  MiddlewareIsNotOpenError,
  MiddlewareNextNotCalledError,
  MiddlewareNextNotAwaitedError,
  PluginOperationAggregateError,
  StreamDecodingNotSupportedError,
  StreamEncodingNotSupportedError,
  MiddlewareDestinationFrozenError,
  MiddlewareNextCalledMultipleTimesError,
} from "../src/errors.js";
import { Builder } from "../src/index.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  Gate,
  streamOf,
  FakeStorage,
  TagMiddleware,
  FakeMiddleware,
  FakeStreamStorage,
  FakeStreamMiddleware,
} from "./_helpers.js";

describe("UniKvs - ミドルウェアのライフサイクル", () => {
  test("閉じたミドルウェアは open で開かれ、close で閉じられる", async ({ expect }) => {
    // 準備：
    const middleware = new FakeMiddleware();
    expect(middleware.isOpen).toBe(false);

    const kvs = new Builder().use(middleware).persist(new FakeStorage()).build();

    // 実行：
    await kvs.open();

    // 検証：
    expect(middleware.isOpen).toBe(true);
    expect(middleware.callsOf("open")).toHaveLength(1);

    // 実行：
    await kvs.close();

    // 検証：
    expect(middleware.isOpen).toBe(false);
    expect(middleware.callsOf("close")).toHaveLength(1);
  });

  test("既に開いているミドルウェアは open/close を呼ばれない", async ({ expect }) => {
    // 準備：
    const middleware = new FakeMiddleware();
    middleware.isOpen = true;

    const kvs = new Builder().use(middleware).persist(new FakeStorage()).build();

    // 実行：
    await kvs.open();
    await kvs.close();

    // 検証：
    expect(middleware.callsOf("open")).toHaveLength(0);
    expect(middleware.callsOf("close")).toHaveLength(0);
    expect(middleware.isOpen).toBe(true);
  });

  test("クローズドのミドルウェアでの set/get は集約経由で MiddlewareIsNotOpenError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const middleware = new FakeMiddleware();
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    const kvs = new Builder<{ foo: PlainValue<string> }>().use(middleware).persist(storage).build();
    await kvs.open();

    middleware.isOpen = false;

    // 実行と検証 : `use` の失敗は集約されて投げられる。
    const setting = kvs.set("foo", "value");
    await expect(setting).rejects.toThrow(PluginOperationAggregateError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [expect.objectContaining({ reason: expect.any(MiddlewareIsNotOpenError) })],
        }),
      }),
    );

    const getting = kvs.get("foo");
    await expect(getting).rejects.toThrow(PluginOperationAggregateError);
    await expect(getting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [expect.objectContaining({ reason: expect.any(MiddlewareIsNotOpenError) })],
        }),
      }),
    );

    // 後片付け。
    middleware.isOpen = true;
    await kvs.close();
  });
});

describe("UniKvs - チェーンの順序", () => {
  test("3 つのミドルウェアは set で順方向、get で逆方向に適用される", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const t1 = new TagMiddleware("1");
    const t2 = new TagMiddleware("2");
    const t3 = new TagMiddleware("3");
    const decodeOrder: string[] = [];
    t1.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "decode") {
        decodeOrder.push("1");
      }
    };
    t2.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "decode") {
        decodeOrder.push("2");
      }
    };
    t3.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "decode") {
        decodeOrder.push("3");
      }
    };

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(t1)
      .use(t2)
      .use(t3)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証 : encode ハンドラは登録順。
    expect(storage.map.get("foo")).toBe("x123");
    await expect(kvs.get("foo")).resolves.toBe("x");

    // 検証 : decode ハンドラは登録の逆順。
    expect(decodeOrder).toStrictEqual(["3", "2", "1"]);
  });

  test("ストレージごとに encode ハンドラが独立に実行される", async ({ expect }) => {
    // 準備：
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const storage3 = new FakeStorage("storage3");
    const t1 = new TagMiddleware("1");
    const t2 = new TagMiddleware("2");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(t1)
      .use(t2)
      .persist(storage1)
      .persist(storage2)
      .persist(storage3)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(t1.callsOf("encode")).toHaveLength(1);
    expect(t2.callsOf("encode")).toHaveLength(1);
    expect(storage1.map.get("foo")).toBe("x12");
    expect(storage2.map.get("foo")).toBe("x12");
    expect(storage3.map.get("foo")).toBe("x12");
  });

  test("vars はチェーンを流れ、後段のミドルウェアにも渡される", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const t1 = new FakeMiddleware("t1");
    const t2 = new FakeMiddleware("t2");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(t1)
      .use(t2)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x", { vars: { request: "r" } });

    // 検証：
    expect(t1.callsOf("encode")[0]?.vars?.get("request")).toBe("r");
    expect(t2.callsOf("encode")[0]?.vars?.get("request")).toBe("r");
    expect(t2.callsOf("encode")[0]?.data).toBe("x");
  });
});

describe("UniKvs - ストリーム対応ミドルウェア", () => {
  test("ストリーム書き込みではストレージごとに encodeStream が呼ばれる", async ({ expect }) => {
    // 準備：
    const storage1 = new FakeStreamStorage("storage1");
    const storage2 = new FakeStreamStorage("storage2");
    const t1 = new FakeStreamMiddleware("t1");
    const t2 = new FakeStreamMiddleware("t2");
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(t1)
      .use(t2)
      .persist(storage1)
      .persist(storage2)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証：
    expect(t1.callsOf("encodeStream")).toHaveLength(1);
    expect(t2.callsOf("encodeStream")).toHaveLength(1);
  });

  test("ストリーム読み取りでは decodeStream が逆順で呼ばれる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);

    const t1 = new FakeStreamMiddleware("t1");
    const t2 = new FakeStreamMiddleware("t2");
    const t3 = new FakeStreamMiddleware("t3");
    const decodeStreamOrder: string[] = [];
    t1.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "decodeStream") {
        decodeStreamOrder.push("t1");
      }
    };
    t2.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "decodeStream") {
        decodeStreamOrder.push("t2");
      }
    };
    t3.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "decodeStream") {
        decodeStreamOrder.push("t3");
      }
    };

    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(t1)
      .use(t2)
      .use(t3)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    const vs = await kvs.stream("logs");
    await vs.dispose();

    // 検証：
    expect(t3.callsOf("decodeStream")).toHaveLength(1);
    expect(t2.callsOf("decodeStream")).toHaveLength(1);
    expect(t1.callsOf("decodeStream")).toHaveLength(1);
    expect(decodeStreamOrder).toStrictEqual(["t3", "t2", "t1"]);
  });

  test("ストリーム非対応のミドルウェアへのストリーム書き込みは StreamEncodingNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備：
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(new FakeMiddleware())
      .persist(new FakeStreamStorage())
      .build();
    await kvs.open();

    // 実行と検証：
    await expect(kvs.set("logs", streamOf([new Uint8Array([1])]))).rejects.toThrow(
      StreamEncodingNotSupportedError,
    );
  });

  test("ストリーム非対応のミドルウェアからのストリーム読み取りは StreamDecodingNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);

    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(new FakeMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    await expect(kvs.stream("logs")).rejects.toThrow(StreamDecodingNotSupportedError);
  });
});

describe("UniKvs - ミドルウェアのエラー伝播", () => {
  test("decode ハンドラのエラーはそのまま伝播する", async ({ expect }) => {
    // 準備：
    const middleware = new FakeMiddleware();
    middleware.errors["decode"] = new Error("decode boom");

    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(middleware)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    await expect(kvs.get("foo")).rejects.toThrow("decode boom");
  });

  test("encode ハンドラのエラー後も KVS は壊れず、失敗したキーは保存されない", async ({
    expect,
  }) => {
    // 準備：
    const middleware = new FakeMiddleware();
    middleware.errors["encode"] = new Error("encode boom");

    const storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(middleware)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    await expect(kvs.set("foo", "value")).rejects.toThrow("encode boom");
    expect(storage.map.has("foo")).toBe(false);

    // 実行：
    delete middleware.errors["encode"];
    await kvs.set("foo", "value");

    // 検証：
    await expect(kvs.get("foo")).resolves.toBe("value");
  });
});

describe("UniKvs - ミドルウェアフック", () => {
  test("has は onExists をキー付きで呼び、vars 変異は storage に引き継がれる", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    const keys: string[] = [];

    class ExistsMiddleware extends FakeMiddleware {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (c.action === "has") {
          keys.push(c.key);
          c.set("checkedBy", "hook");
        }

        await next();
      }
    }

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new ExistsMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    const result = await kvs.has("foo");

    // 検証：
    expect(result).toBe(true);

    expect(keys).toStrictEqual(["foo"]);
    expect(storage.callsOf("exists")[0]?.vars?.get("checkedBy")).toBe("hook");
  });

  test("delete は onDelete を呼び、共有ミドルウェアでも1回だけ実行される", async ({ expect }) => {
    // 準備：
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    a.map.set("foo", "stored");
    b.map.set("foo", "stored");

    const keys: string[] = [];

    class DeleteMiddleware extends FakeMiddleware {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (c.action === "delete") {
          keys.push(c.key);
          c.set("deletedBy", "hook");
        }

        await next();
      }
    }

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new DeleteMiddleware())
      .persist(a)
      .persist(b)
      .build();
    await kvs.open();

    // 実行：
    await kvs.delete("foo");

    // 検証 : 宛先が 2 件でもフックは 1 回、両宛先に vars 変異が引き継がれる。
    expect(keys).toStrictEqual(["foo"]);
    expect(a.callsOf("delete")[0]?.vars?.get("deletedBy")).toBe("hook");
    expect(b.callsOf("delete")[0]?.vars?.get("deletedBy")).toBe("hook");
  });

  test("onExists の失敗は取りまとめられて has から投げられ、storage には触れない", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    class DenyExistsMiddleware extends FakeMiddleware {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (c.action === "has") {
          throw new Error("exists denied");
        }

        await next();
      }
    }

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new DenyExistsMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    const checking = kvs.has("foo");

    // 検証：
    await expect(checking).rejects.toThrow(PluginOperationAggregateError);
    await expect(checking).rejects.toMatchObject({
      meta: {
        action: "read",
        plugin: "middleware",
      },
    });
    await expect(checking).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [
            expect.objectContaining({
              reason: expect.objectContaining({ message: "exists denied" }),
            }),
          ],
        }),
      }),
    );

    expect(storage.callsOf("exists")).toHaveLength(0);
  });

  test("onDelete の失敗は取りまとめられて delete から投げられ、storage から削除されない", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    class DenyDeleteMiddleware extends FakeMiddleware {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (c.action === "delete") {
          throw new Error("delete denied");
        }

        await next();
      }
    }

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new DenyDeleteMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    const deleting = kvs.delete("foo");

    // 検証：
    await expect(deleting).rejects.toThrow(PluginOperationAggregateError);
    await expect(deleting).rejects.toMatchObject({
      meta: {
        action: "delete",
        plugin: "middleware",
      },
    });
    await expect(deleting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [
            expect.objectContaining({
              reason: expect.objectContaining({ message: "delete denied" }),
            }),
          ],
        }),
      }),
    );

    expect(storage.callsOf("delete")).toHaveLength(0);
    expect(storage.map.has("foo")).toBe(true);
  });

  test("複数の use の失敗は fail-fast で1件目が報告される", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    class BoomDeleteMiddleware extends FakeMiddleware {
      readonly #message: string;

      public constructor(name: string, message: string) {
        super(name);
        this.#message = message;
      }

      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (c.action === "delete") {
          throw new Error(this.#message);
        }

        await next();
      }
    }

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new BoomDeleteMiddleware("boom1", "first"))
      .use(new BoomDeleteMiddleware("boom2", "second"))
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    const deleting = kvs.delete("foo");

    // 検証 : オニオン実行では先頭の失敗で即時確定し、後段は実行されない。
    await expect(deleting).rejects.toThrow(PluginOperationAggregateError);
    await expect(deleting).rejects.toMatchObject({
      meta: {
        action: "delete",
        plugin: "middleware",
      },
    });
    await expect(deleting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [
            expect.objectContaining({
              reason: expect.objectContaining({ message: "first" }),
            }),
          ],
        }),
      }),
    );
    await expect(deleting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [
            expect.objectContaining({
              name: "boom1",
              index: 0,
            }),
          ],
        }),
      }),
    );

    expect(storage.callsOf("delete")).toHaveLength(0);
  });
});

describe("UniKvs - destination の凍結", () => {
  test("encode で next() の実行後に destination を設定すると MiddlewareDestinationFrozenError を投げる", async ({
    expect,
  }) => {
    // 準備：
    class EvilMiddleware extends FakeMiddleware {
      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        c.destination = c.source;
      }
    }

    const storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new EvilMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    const setting = kvs.set("foo", "value");
    await expect(setting).rejects.toThrow(MiddlewareDestinationFrozenError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: {
          key: "foo",
          action: "set",
        },
      }),
    );

    expect(storage.map.has("foo")).toBe(false);
  });

  test("decode で next() の実行後に destination を設定すると MiddlewareDestinationFrozenError を投げる", async ({
    expect,
  }) => {
    // 準備：
    class EvilMiddleware extends FakeMiddleware {
      public override async decode(
        c: IMiddleware.DecodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        c.destination = c.source;
      }
    }

    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new EvilMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    const getting = kvs.get("foo");
    await expect(getting).rejects.toThrow(MiddlewareDestinationFrozenError);
    await expect(getting).rejects.toEqual(
      expect.objectContaining({
        meta: {
          key: "foo",
          action: "get",
        },
      }),
    );
  });

  test("next() の実行後も destination の読み取りはできる", async ({ expect }) => {
    // 準備：
    class ReadAfterNextMiddleware extends FakeMiddleware {
      public readonly readValues: unknown[] = [];

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = `${String(c.source)}!`;
        await next();
        this.readValues.push(c.destination);
      }
    }

    const middleware = new ReadAfterNextMiddleware();
    const storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(middleware)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(middleware.readValues).toStrictEqual(["x!"]);
    await expect(kvs.get("foo")).resolves.toBe("x!");
  });
});

describe("UniKvs - next の呼び出し規約", () => {
  test("encode で next() を呼ばないと MiddlewareNextNotCalledError を投げる", async ({
    expect,
  }) => {
    // 準備：
    class SilentMiddleware extends FakeMiddleware {
      public constructor() {
        super("Silent");
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        _next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
      }
    }

    const storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new SilentMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    const setting = kvs.set("foo", "value");
    await expect(setting).rejects.toThrow(MiddlewareNextNotCalledError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: {
          name: "Silent",
          operation: "encode",
        },
      }),
    );

    expect(storage.map.has("foo")).toBe(false);
  });

  test("decode で next() を呼ばないと MiddlewareNextNotCalledError を投げる", async ({
    expect,
  }) => {
    // 準備：
    class SilentMiddleware extends FakeMiddleware {
      public constructor() {
        super("Silent");
      }

      public override async decode(
        c: IMiddleware.DecodeContext,
        _next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
      }
    }

    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new SilentMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    const getting = kvs.get("foo");
    await expect(getting).rejects.toThrow(MiddlewareNextNotCalledError);
    await expect(getting).rejects.toEqual(
      expect.objectContaining({
        meta: {
          name: "Silent",
          operation: "decode",
        },
      }),
    );
  });

  test("decodeStream で next() を呼ばないと MiddlewareNextNotCalledError を投げる", async ({
    expect,
  }) => {
    // 準備：
    class SilentMiddleware extends FakeStreamMiddleware {
      public constructor() {
        super("Silent");
      }

      public override async decodeStream(
        c: IMiddleware.DecodeStreamContext,
        _next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
      }
    }

    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);

    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(new SilentMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    const streaming = kvs.stream("logs");
    await expect(streaming).rejects.toThrow(MiddlewareNextNotCalledError);
    await expect(streaming).rejects.toEqual(
      expect.objectContaining({
        meta: {
          name: "Silent",
          operation: "decode",
        },
      }),
    );
  });

  test("encode で next() を複数回呼ぶと MiddlewareNextCalledMultipleTimesError を投げる", async ({
    expect,
  }) => {
    // 準備：
    class TwiceMiddleware extends FakeMiddleware {
      public constructor() {
        super("Twice");
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        await next();
      }
    }

    const storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TwiceMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    const setting = kvs.set("foo", "value");
    await expect(setting).rejects.toThrow(MiddlewareNextCalledMultipleTimesError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: {
          name: "Twice",
          operation: "encode",
        },
      }),
    );

    expect(storage.map.has("foo")).toBe(false);
  });

  test("encode で next() を await しなかったとき MiddlewareNextNotAwaitedError を投げる", async ({
    expect,
  }) => {
    // 準備：
    class FireAndForgetMiddleware extends FakeMiddleware {
      public detached: Promise<void> | undefined;

      public constructor() {
        super("FireAndForget");
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        // 切り離した next() はテスト側で完了を待ち、close 後の未処理拒否を防ぎます。
        this.detached = next();
      }
    }

    class SlowMiddleware extends FakeMiddleware {
      public readonly gate = new Gate();

      public constructor() {
        super("Slow");
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await this.gate.wait();
        await next();
      }
    }

    const storage = new FakeStorage();
    const fireAndForget = new FireAndForgetMiddleware();
    const slow = new SlowMiddleware();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(fireAndForget)
      .use(slow)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    const setting = kvs.set("foo", "value");
    await expect(setting).rejects.toThrow(MiddlewareNextNotAwaitedError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: {
          name: "FireAndForget",
          operation: "encode",
        },
      }),
    );

    expect(storage.map.has("foo")).toBe(false);

    // 後片付け : 切り離した next() の完了を待ってから閉じる。
    slow.gate.open();
    await fireAndForget.detached;
  });
});
