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
      .appendStorage(storage)
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
    const writeVars = storage.callsOf("write").map((call) => call.vars);
    expect(writeVars[0]).toMatchObject({ "unikvs:action": "set", "unikvs:key": "foo" });
    expect(storage.callsOf("read")[0]?.vars).toMatchObject({
      "unikvs:action": "get",
      "unikvs:key": "foo",
    });
    expect(
      storage.callsOf("exists").find((call) => call.vars?.["unikvs:action"] === "has")?.vars,
    ).toMatchObject({
      "unikvs:action": "has",
      "unikvs:key": "foo",
    });
    expect(storage.callsOf("delete")[0]?.vars).toMatchObject({
      "unikvs:action": "delete",
      "unikvs:key": "foo",
    });
    expect(storage.callsOf("getReadable")[0]?.vars).toMatchObject({
      "unikvs:action": "stream",
      "unikvs:key": "logs",
    });

    // 後片付け
    await kvs.close();
  });

  test("clear は unikvs:action のみを付与する", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();

    // 実行
    await kvs.clear();

    // 検証
    const vars = storage.callsOf("clear")[0]?.vars;
    expect(vars?.["unikvs:action"]).toBe("clear");
    expect(vars).not.toHaveProperty("unikvs:key");

    // 後片付け
    await kvs.close();
  });

  test("open と close も unikvs:action を付与する", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config().appendStorage(storage).create();

    // 実行
    await kvs.open();
    await kvs.close();

    // 検証
    expect(storage.callsOf("open")[0]?.vars?.["unikvs:action"]).toBe("open");
    expect(storage.callsOf("close")[0]?.vars?.["unikvs:action"]).toBe("close");
  });

  test("呼び出し側が指定した unikvs:action と unikvs:key は上書きされる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();

    // 実行
    await kvs.set({
      key: "foo",
      value: "value",
      vars: { "unikvs:action": "fake", "unikvs:key": "fake" },
    });

    // 検証
    const vars = storage.callsOf("write")[0]?.vars;
    expect(vars?.["unikvs:action"]).toBe("set");
    expect(vars?.["unikvs:key"]).toBe("foo");

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - vars のマージ", () => {
  test("操作ごとの vars はビルダーの vars にマージされ、同じキーは操作側が優先される", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables({ region: "tokyo", app: "builder" })
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: { region: "osaka", request: "req-1" } });

    // 検証
    const vars = storage.callsOf("write")[0]?.vars;
    expect(vars).toMatchObject({ region: "osaka", app: "builder", request: "req-1" });

    // 後片付け
    await kvs.close();
  });

  test("操作ごとの vars をエントリー配列形式でも指定できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables([["region", "tokyo"]])
      .appendStorage(storage)
      .create();
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
    expect(vars).toMatchObject({ region: "osaka", request: "req-2" });

    // 後片付け
    await kvs.close();
  });

  test("open と close にも操作ごとの vars を渡せる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config().setVariables({ base: "b" }).appendStorage(storage).create();

    // 実行
    await kvs.open({ vars: { phase: "open" } });
    await kvs.close({ vars: { phase: "close" } });

    // 検証
    expect(storage.callsOf("open")[0]?.vars).toMatchObject({ base: "b", phase: "open" });
    expect(storage.callsOf("close")[0]?.vars).toMatchObject({ base: "b", phase: "close" });
  });

  test("vars は transformer にも渡される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const transformer = new FakeTransformer();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables({ app: "builder" })
      .appendTransformer(transformer)
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: { request: "req-3" } });
    await kvs.get("foo", { vars: { request: "req-4" } });

    // 検証
    expect(transformer.callsOf("encode")[0]?.vars).toMatchObject({
      app: "builder",
      request: "req-3",
      "unikvs:action": "set",
      "unikvs:key": "foo",
    });
    expect(transformer.callsOf("decode")[0]?.vars).toMatchObject({
      app: "builder",
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
      .appendStorage(storage)
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
    expect(existsCalls.find((call) => call.key === "a")?.vars?.["request"]).toBe("req-a");
    expect(existsCalls.find((call) => call.key === "b")?.vars?.["request"]).toBe("req-b");

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
        call.vars!["injected"] = true;
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables({ base: "b" })
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "first");
    await kvs.set("foo", "second");

    // 検証
    expect(storage.callsOf("write")[1]?.vars).not.toHaveProperty("injected");

    // 後片付け
    await kvs.close();
  });

  test("操作ごとの vars オブジェクトは変更されない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage).create();
    await kvs.open();
    const opVars = { request: "req" };

    // 実行
    await kvs.set("foo", "value", { vars: opVars });

    // 検証
    expect(opVars).toStrictEqual({ request: "req" });

    // 後片付け
    await kvs.close();
  });

  test("ビルダーの vars オブジェクトも操作で変更されない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const builderVars = { base: "b" };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .setVariables(builderVars)
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: { extra: "e" } });

    // 検証
    expect(builderVars).toStrictEqual({ base: "b" });

    // 後片付け
    await kvs.close();
  });
});
