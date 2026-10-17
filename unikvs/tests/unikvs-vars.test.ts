import { describe, test } from "vitest";

import UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  FakeStorage,
  FakeStreamStorage,
  FakeMiddleware,
  Gate,
  collect,
  streamOf,
} from "./_helpers.js";

/**
 * 新方式では `unikvs:action`/`unikvs:key` などの予約変数は廃止され、操作種別とキーはコンテキストのプロパティー (`c.action`/`c.key`) で伝達されます。
 * 実行時変数 (`vars`) はカスタム変数の伝達専用であり、操作ごとに複写されます。
 * ここでは、カスタム変数の伝播と、操作種別・キーがコンテキスト経由で正しく伝わることを検証します。
 */
describe("UniKvs - vars の伝播", () => {
  test("set/get/has/delete/stream の操作種別とキーはコンテキストで伝わる", async ({ expect }) => {
    // 準備
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string>; logs: StreamValue<Uint8Array> }>()
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

    // 検証: ストレージ呼び出しのキーと操作が正しい
    expect(storage.callsOf("write")[0]?.key).toBe("foo");
    expect(storage.callsOf("write")[0]?.action).toBe("set");
    expect(storage.callsOf("read")[0]?.key).toBe("foo");
    expect(storage.callsOf("read")[0]?.action).toBe("get");
    expect(storage.callsOf("exists").some((call) => call.key === "foo")).toBe(true);
    expect(storage.callsOf("delete")[0]?.key).toBe("foo");
    expect(storage.callsOf("delete")[0]?.action).toBe("delete");
    expect(storage.callsOf("getWritable")[0]?.key).toBe("logs");
    expect(storage.callsOf("getReadable")[0]?.key).toBe("logs");
  });

  test("clear の操作種別はコンテキストで伝わる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.clear();

    // 検証
    expect(storage.callsOf("clear")).toHaveLength(1);
    expect(storage.callsOf("clear")[0]?.action).toBe("clear");
  });

  test("操作ごとの vars はストレージへ渡される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: { tag: "t1" } });

    // 検証
    expect(storage.callsOf("write")[0]?.vars?.get("tag")).toBe("t1");
  });

  test("操作ごとの vars をエントリー配列形式でも指定できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: [["tag", "t2"]] });

    // 検証
    expect(storage.callsOf("write")[0]?.vars?.get("tag")).toBe("t2");
  });

  test("操作ごとの vars に Map を指定できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: new Map([["tag", "t3"]]) });

    // 検証
    expect(storage.callsOf("write")[0]?.vars?.get("tag")).toBe("t3");
  });

  test("open と close にも操作ごとの vars を渡せる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();

    // 実行
    await kvs.open({ vars: { phase: "open" } });
    await kvs.close({ vars: { phase: "close" } });

    // 検証
    expect(storage.callsOf("open")[0]?.vars?.get("phase")).toBe("open");
    expect(storage.callsOf("close")[0]?.vars?.get("phase")).toBe("close");
  });

  test("vars は middleware にも渡される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware("probe");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(middleware)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: { tag: "t4" } });

    // 検証
    expect(middleware.callsOf("encode")[0]?.vars?.get("tag")).toBe("t4");
    expect(storage.callsOf("write")[0]?.vars?.get("tag")).toBe("t4");
  });

  test("open/close の vars 変異は並列プラグイン間で分離される", async ({ expect }) => {
    // 準備: open をゲートで保留し、並列プラグイン間の分離を確認する
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const gate = new Gate();
    const bEntered = new Gate();
    let bSawA = false;
    a.hook = async () => {
      await gate.wait();
    };
    b.hook = (call) => {
      // b の open がゲート待機中の a と並列に進んだことを記録する
      if (call.method === "open") {
        bEntered.open();
      }
      // a が設定した変数が b に見えないことを確認する (分離)
      if ((call.vars?.get("fromA") as unknown) === true) {
        bSawA = true;
      }
    };
    // a の open で変異させるため、open をオーバーライドする
    const origOpenA = a.open.bind(a);
    a.open = async (c) => {
      (c as { set: (k: string, v: unknown) => void }).set("fromA", true);
      await origOpenA(c);
    };
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(a).persist(b).create();

    // 実行: open を並列開始し、b が先に進んでも a の変異が見えないことを確認する
    const openPromise = kvs.open();
    // b の open がゲート待機中の a と並列に進むのを待つ
    await bEntered.wait();
    gate.open();
    await openPromise;

    // 検証
    expect(bSawA).toBe(false);
  });
});
