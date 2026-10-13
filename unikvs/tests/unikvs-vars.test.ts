import { ReadonlyVariableError, Variables } from "@unikvs/core";
import { describe, test } from "vitest";

import type { PlainValue, StreamValue } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import {
  FakeStorage,
  FakeStreamStorage,
  FakeTransformer,
  Gate,
  collect,
  streamOf,
} from "./_helpers.js";

describe("UniKvs - vars の自動付与", () => {
  test("set/get/has/delete/stream は unikvs:action と unikvs:key を付与する", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStreamStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string>; logs: StreamValue<Uint8Array> }>()
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");
    await kvs.get("foo");
    await kvs.has("foo");
    await kvs.delete("foo");
    await kvs.set("logs", streamOf([new Uint8Array([1])]));
    const vs = await kvs.stream("logs");
    await collect(vs);
    await vs.dispose();

    // 検証
    const writeVars = storage.callsOf("write").map((call) => call.vars?.toJSON());
    expect(writeVars[0]).toMatchObject({ "unikvs:action": "set", "unikvs:key": "foo" });
    expect(storage.callsOf("read")[0]?.vars?.toJSON()).toMatchObject({
      "unikvs:action": "get",
      "unikvs:key": "foo",
    });
    expect(
      storage
        .callsOf("exists")
        .find((call) => call.vars?.get("unikvs:action") === "has")
        ?.vars?.toJSON(),
    ).toMatchObject({
      "unikvs:action": "has",
      "unikvs:key": "foo",
    });
    expect(storage.callsOf("delete")[0]?.vars?.toJSON()).toMatchObject({
      "unikvs:action": "delete",
      "unikvs:key": "foo",
    });
    expect(storage.callsOf("getReadable")[0]?.vars?.toJSON()).toMatchObject({
      "unikvs:action": "stream",
      "unikvs:key": "logs",
    });

    // 後片付け
    await kvs.close();
  });

  test("clear は unikvs:action のみを付与する", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.clear();

    // 検証
    const vars = storage.callsOf("clear")[0]?.vars;
    expect(vars?.get("unikvs:action")).toBe("clear");
    expect(vars?.has("unikvs:key")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("open と close も unikvs:action を付与する", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config().persist(storage).create();

    // 実行
    await kvs.open();
    await kvs.close();

    // 検証
    expect(storage.callsOf("open")[0]?.vars?.get("unikvs:action")).toBe("open");
    expect(storage.callsOf("close")[0]?.vars?.get("unikvs:action")).toBe("close");
  });

  test("呼び出し側が指定した unikvs:action と unikvs:key は上書きされる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.set({
      key: "foo",
      value: "value",
      vars: { "unikvs:action": "fake", "unikvs:key": "fake" },
    });

    // 検証
    const vars = storage.callsOf("write")[0]?.vars;
    expect(vars?.get("unikvs:action")).toBe("set");
    expect(vars?.get("unikvs:key")).toBe("foo");

    // 後片付け
    await kvs.close();
  });

  test("unikvs:action と unikvs:key は readonly で上書きできない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    let seen: Variables | undefined;
    storage.hook = (call) => {
      if (call.method === "write") {
        seen = call.vars;
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();
    await kvs.set("foo", "value");

    // 実行と検証
    expect(seen?.isReadonly("unikvs:action")).toBe(true);
    expect(seen?.isReadonly("unikvs:key")).toBe(true);
    expect(() => seen?.set("unikvs:action", "fake")).toThrow(ReadonlyVariableError);
    expect(() => seen?.set("unikvs:key", "fake")).toThrow(ReadonlyVariableError);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - vars のマージ", () => {
  test("操作ごとの vars はストレージへ渡される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: { region: "osaka", request: "req-1" } });

    // 検証
    const vars = storage.callsOf("write")[0]?.vars;
    expect(vars?.toJSON()).toMatchObject({ region: "osaka", request: "req-1" });
    expect(vars?.toJSON()).toMatchObject({ "unikvs:action": "set", "unikvs:key": "foo" });

    // 後片付け
    await kvs.close();
  });

  test("操作ごとの vars をエントリー配列形式でも指定できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.has("foo", {
      vars: [
        ["region", "osaka"],
        ["request", "req-2"],
      ],
    });

    // 検証
    const vars = storage.callsOf("exists")[0]?.vars;
    expect(vars?.toJSON()).toMatchObject({ region: "osaka", request: "req-2" });

    // 後片付け
    await kvs.close();
  });

  test("操作ごとの vars に Map と Variables を指定できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "a", { vars: new Map([["via", "map"]]) });
    await kvs.set("foo", "b", { vars: new Variables({ via: "variables" }) });

    // 検証
    expect(storage.callsOf("write")[0]?.vars?.get("via")).toBe("map");
    expect(storage.callsOf("write")[1]?.vars?.get("via")).toBe("variables");

    // 後片付け
    await kvs.close();
  });

  test("open と close にも操作ごとの vars を渡せる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config().persist(storage).create();

    // 実行
    await kvs.open({ vars: { phase: "open" } });
    await kvs.close({ vars: { phase: "close" } });

    // 検証
    expect(storage.callsOf("open")[0]?.vars?.toJSON()).toMatchObject({ phase: "open" });
    expect(storage.callsOf("close")[0]?.vars?.toJSON()).toMatchObject({ phase: "close" });
  });

  test("vars は transformer にも渡される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const transformer = new FakeTransformer();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(transformer)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: { request: "req-3" } });
    await kvs.get("foo", { vars: { request: "req-4" } });

    // 検証
    expect(transformer.callsOf("encode")[0]?.vars?.toJSON()).toMatchObject({
      request: "req-3",
      "unikvs:action": "set",
      "unikvs:key": "foo",
    });
    expect(transformer.callsOf("decode")[0]?.vars?.toJSON()).toMatchObject({
      request: "req-4",
      "unikvs:action": "get",
      "unikvs:key": "foo",
    });

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - vars の分離", () => {
  test("同時に実行した読み取り操作の vars が混ざらない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const enteredA = new Gate();
    const releaseA = new Gate();
    storage.hook = async (call) => {
      if (call.method === "exists" && call.key === "a") {
        enteredA.open();
        await releaseA.wait();
      }
    };
    const kvs = UniKvs.config<{ a: PlainValue<string>; b: PlainValue<string> }>()
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const pendingA = kvs.has("a", { vars: { request: "req-a" } });
    await enteredA.wait();
    const pendingB = kvs.has("b", { vars: { request: "req-b" } });
    await pendingB;
    releaseA.open();
    await pendingA;

    // 検証
    const existsCalls = storage.callsOf("exists");
    expect(existsCalls.find((call) => call.key === "a")?.vars?.get("request")).toBe("req-a");
    expect(existsCalls.find((call) => call.key === "b")?.vars?.get("request")).toBe("req-b");

    // 後片付け
    await kvs.close();
  });

  test("ストレージが vars を変更しても次の操作に漏れない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    let injected = false;
    storage.hook = (call) => {
      if (call.method === "write" && !injected) {
        injected = true;
        call.vars?.set("injected", true);
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "first");
    await kvs.set("foo", "second");

    // 検証
    expect(storage.callsOf("write")[1]?.vars?.has("injected")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("操作ごとの vars オブジェクトは変更されない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();
    const opVars = { request: "req" };

    // 実行
    await kvs.set("foo", "value", { vars: opVars });

    // 検証
    expect(opVars).toStrictEqual({ request: "req" });

    // 後片付け
    await kvs.close();
  });

  test("Variables インスタンスを渡しても参照を奪わない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();
    const source = new Variables({ request: "req" });

    // 実行
    await kvs.set("foo", "value", { vars: source });
    source.set("mutated", true);

    // 検証
    expect(storage.callsOf("write")[0]?.vars?.has("mutated")).toBe(false);
    expect(source.get("request")).toBe("req");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - vars の参照安定性", () => {
  test("同一操作内で transformer が set した値は下流 storage に見える", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const transformer = new FakeTransformer("injector");
    transformer.hook = (call) => {
      if (call.method === "encode") {
        call.vars?.set("injected", "yes");
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(transformer)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証: 同一参照のため transformer の mutate が storage に見える
    expect(transformer.callsOf("encode")[0]?.vars).toBe(storage.callsOf("write")[0]?.vars);
    expect(storage.callsOf("write")[0]?.vars?.get("injected")).toBe("yes");

    // 後片付け
    await kvs.close();
  });

  test("別ストレージ分岐では独立している", async ({ expect }) => {
    // 準備
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(a).persist(b).create();
    await kvs.open();
    a.hook = (call) => {
      if (call.method === "write") {
        call.vars?.set("branch", "a");
      }
    };

    // 実行
    await kvs.set("foo", "value");

    // 検証: 分岐ごとに別参照で片方の set が他方に見えない
    const varsA = a.callsOf("write")[0]?.vars;
    const varsB = b.callsOf("write")[0]?.vars;
    expect(varsA).not.toBe(varsB);
    expect(varsA?.get("branch")).toBe("a");
    expect(varsB?.has("branch")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("prefix の set 変異は複数宛先に継承される", async ({ expect }) => {
    // 準備: 共有 prefix が mutate した値は両 storage に見える
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const prefix = new FakeTransformer("prefix");
    prefix.hook = (call) => {
      if (call.method === "encode") {
        call.vars?.set("prefixTag", "shared");
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(prefix)
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    expect(a.callsOf("write")[0]?.vars?.get("prefixTag")).toBe("shared");
    expect(b.callsOf("write")[0]?.vars?.get("prefixTag")).toBe("shared");

    // 後片付け
    await kvs.close();
  });

  test("prefix の onClear 変異は両 storage に継承される", async ({ expect }) => {
    // 準備: onClear で inject した値は両 storage の clear vars に見える
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    class InjectOnClear extends FakeTransformer {
      public constructor() {
        super("injector");
      }

      public async onClear(args: { readonly vars: Variables }): Promise<void> {
        args.vars.set("clearedBy", "prefix");
      }
    }
    const injector = new InjectOnClear();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(injector)
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    await kvs.clear();

    // 検証: clearVars から分岐した両宛先に prefix の mutate が引き継がれる
    expect(a.callsOf("clear")[0]?.vars?.get("clearedBy")).toBe("prefix");
    expect(b.callsOf("clear")[0]?.vars?.get("clearedBy")).toBe("prefix");

    // 後片付け
    await kvs.close();
  });

  test("vars に Variables を渡しても unikvs 予約キーで汚染されない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();
    const source = new Variables({ request: "req" });

    // 実行
    await kvs.set("foo", "value", { vars: source });

    // 検証: 入力インスタンスに action/key/storageNames が付与されない
    expect(source.has("unikvs:action")).toBe(false);
    expect(source.has("unikvs:key")).toBe(false);
    expect(source.has("unikvs:storageNames")).toBe(false);
    expect(source.toJSON()).toStrictEqual({ request: "req" });

    // 後片付け
    await kvs.close();
  });

  test("呼び出し側の readonly 予約キーがあると ReadonlyVariableError で拒否される", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();
    const source = new Variables();
    source.setReadonly("unikvs:action", "fake");
    source.set("request", "req");

    // 実行と検証: 予約キーの密封は維持されるため、内部の付与が失敗する
    await expect(kvs.set("foo", "value", { vars: source })).rejects.toThrow(ReadonlyVariableError);
    expect(storage.callsOf("write")).toHaveLength(0);
    expect(source.get("unikvs:action")).toBe("fake");

    // 後片付け
    await kvs.close();
  });

  describe("open/close の vars 変異は並列プラグイン間で分離される", () => {
    for (const lifecycle of ["open", "close"] as const) {
      test(`${lifecycle} では並列プラグイン間で分離される`, async ({ expect }) => {
        // 準備
        const a = new FakeStorage("a");
        const b = new FakeStorage("b");
        const entered = new Gate();
        const release = new Gate();
        a.hook = async (call) => {
          if (call.method === lifecycle) {
            call.vars?.set("fromA", true);
            entered.open();
            await release.wait();
          }
        };
        b.hook = async (call) => {
          if (call.method === lifecycle) {
            await entered.wait();
            // a の mutate が見えたら非決定的共有の証拠になる
            expect(call.vars?.has("fromA")).toBe(false);
          }
        };
        const kvs = UniKvs.config().persist(a).persist(b).create();
        if (lifecycle === "close") {
          await kvs.open();
        }

        // 実行: lifecycle を並列開始し、a の保留中に b の分離を確認する
        const pending = lifecycle === "open" ? kvs.open() : kvs.close();
        await entered.wait();
        // b の処理が entered 待ちで進行するため、少し譲ってから解放する
        await new Promise((resolve) => setTimeout(resolve, 10));
        release.open();
        await pending;

        // 後片付け
        if (lifecycle === "open") {
          await kvs.close();
        }
      });
    }
  });
});
