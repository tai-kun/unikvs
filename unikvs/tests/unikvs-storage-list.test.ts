import { describe, test } from "vitest";

import UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import { FakeStorage, FakeStreamStorage, FakeMiddleware, streamOf } from "./_helpers.js";

/**
 * 新方式では `unikvs:storageNames` 変数は廃止され、実行時変数は操作全体で共有されます。
 * ストレージ名の区別は `repair.targets` やエラーの `name`/`index` で行います。
 * ここでは、カスタム変数が全宛先へ均一に伝播し、キーとデータのルーティングが正しいことを検証します。
 */
describe("UniKvs - 変数の伝播とルーティング", () => {
  test("set は全宛先へ同じカスタム変数とキー・データを渡す", async ({ expect }) => {
    // 準備
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const probe = new FakeMiddleware("probe");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(probe)
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value", { vars: { tag: "t1" } });

    // 検証: 両宛先に同じキー・データ・カスタム変数が渡される
    expect(a.callsOf("write")[0]?.key).toBe("foo");
    expect(b.callsOf("write")[0]?.key).toBe("foo");
    expect(a.callsOf("write")[0]?.data).toBe("value");
    expect(b.callsOf("write")[0]?.data).toBe("value");
    expect(a.callsOf("write")[0]?.vars?.get("tag")).toBe("t1");
    expect(b.callsOf("write")[0]?.vars?.get("tag")).toBe("t1");
    // ミドルウェアの encode も同じ変数を見る
    expect(probe.callsOf("encode")).toHaveLength(1);
    expect(probe.callsOf("encode")[0]?.vars?.get("tag")).toBe("t1");
    expect(probe.callsOf("encode")[0]?.key).toBe("foo");

    // 後片付け
    await kvs.close();
  });

  test("get は読取元からデコードして返す", async ({ expect }) => {
    // 準備
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const probe = new FakeMiddleware("probe");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(probe)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const value = await kvs.get("foo", { vars: { tag: "t2" } });

    // 検証
    expect(value).toBe("value");
    expect(server.callsOf("read")[0]?.vars?.get("tag")).toBe("t2");
    expect(probe.callsOf("decode")).toHaveLength(1);

    // 後片付け
    await kvs.close();
  });

  test("has と delete と clear は全宛先で実行される", async ({ expect }) => {
    // 準備
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    a.map.set("foo", "value");
    b.map.set("foo", "value");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(a).persist(b).create();
    await kvs.open();

    // 実行と検証: has
    expect(await kvs.has("foo")).toBe(true);
    // 実行と検証: delete
    await kvs.delete("foo");
    expect(a.map.has("foo")).toBe(false);
    expect(b.map.has("foo")).toBe(false);

    // 実行と検証: clear
    a.map.set("foo", "value");
    b.map.set("foo", "value");
    await kvs.clear();
    expect(a.map.has("foo")).toBe(false);
    expect(b.map.has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("stream の set/get はストリームで往復する", async ({ expect }) => {
    // 準備
    const storage = new FakeStreamStorage("s");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    // 実行: 書き込み
    await kvs.set("logs", streamOf([new Uint8Array([1, 2])]));

    // 実行: 読み取り
    const vs = await kvs.stream("logs");
    const chunks: Uint8Array[] = [];
    for await (const chunk of vs) {
      chunks.push(chunk as Uint8Array);
    }
    await vs.dispose();

    // 検証
    expect(chunks).toHaveLength(1);

    // 後片付け
    await kvs.close();
  });

  test("fork の分岐先ごとに異なるストレージへ書き込まれる", async ({ expect }) => {
    // 準備
    const mainStorage = new FakeStorage("main");
    const branchStorage = new FakeStorage("branch");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(mainStorage)
      .fork(UniKvs.branch().persist(branchStorage))
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    expect(mainStorage.map.get("foo")).toBe("value");
    expect(branchStorage.map.get("foo")).toBe("value");
    expect(await kvs.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });
});
