import { AllowRepair } from "@unikvs/allow-repair";
import { RepairNotAllowedError } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import { describe, test } from "vitest";

import type { PlainValue, StreamValue } from "../src/_value-schemas.js";
import { PluginOperationAggregateError } from "../src/errors.js";
import UniKvs from "../src/unikvs.js";
import {
  FakeStorage,
  FakeStreamStorage,
  FakeStreamTransformer,
  FakeTransformer,
  collect,
  streamOf,
} from "./_helpers.js";

describe("UniKvs - unikvs:storageNames の付与", () => {
  test("set は宛先ごとに単一要素を渡す", async ({ expect }) => {
    // 準備
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const probe = new FakeTransformer("probe");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(probe)
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    expect(a.callsOf("write")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["a"]);
    expect(b.callsOf("write")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["b"]);
    expect(Object.isFrozen(a.callsOf("write")[0]?.vars?.get("unikvs:storageNames"))).toBe(true);
    expect(
      probe.callsOf("encode").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["a", "b"]]);
    expect(Object.isFrozen(probe.callsOf("encode")[0]?.vars?.get("unikvs:storageNames"))).toBe(
      true,
    );

    // 後片付け
    await kvs.close();
  });

  test("get は読取元の単一要素を渡す", async ({ expect }) => {
    // 準備
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const probe = new FakeTransformer("probe");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(probe)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    await kvs.get("foo");

    // 検証
    expect(server.callsOf("read")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["server"]);
    expect(probe.callsOf("decode")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["server"]);

    // 後片付け
    await kvs.close();
  });

  test("get の書き戻しは読取元と書戻先を区別する", async ({ expect }) => {
    // 準備
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const probe = new FakeTransformer("probe");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .connect(probe)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    await kvs.get("foo", { repair: true });

    // 検証
    expect(probe.callsOf("decode")[0]?.vars?.toJSON()).toMatchObject({
      "unikvs:storageNames": ["server"],
    });
    expect(probe.callsOf("decode")[0]?.vars?.has("unikvs:repair")).toBe(false);
    expect(probe.callsOf("encode")[0]?.vars?.toJSON()).toMatchObject({
      "unikvs:repair": true,
      "unikvs:storageNames": ["cache"],
    });
    expect(cache.callsOf("write")[0]?.vars?.toJSON()).toMatchObject({
      "unikvs:repair": true,
      "unikvs:storageNames": ["cache"],
    });

    // 後片付け
    await kvs.close();
  });

  test("has と delete と clear は宛先ごとに単一要素を渡す", async ({ expect }) => {
    // 準備
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(a).persist(b).create();
    await kvs.open();
    await kvs.set("foo", "value");

    // 実行
    // @ts-expect-error
    await kvs.has("missing");
    await kvs.delete("foo");
    await kvs.clear();

    // 検証
    const existsLists = [...a.callsOf("exists"), ...b.callsOf("exists")]
      .filter((call) => call.vars?.get("unikvs:action") === "has")
      .map((call) => call.vars?.get("unikvs:storageNames"));
    expect(existsLists).toContainEqual(["a"]);
    expect(existsLists).toContainEqual(["b"]);
    expect(a.callsOf("delete")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["a"]);
    expect(b.callsOf("delete")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["b"]);
    expect(a.callsOf("clear")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["a"]);
    expect(b.callsOf("clear")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["b"]);

    // 後片付け
    await kvs.close();
  });

  test("stream は読取元と書戻先を区別する", async ({ expect }) => {
    // 準備
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    await collect(vs);

    // 検証
    expect(server.callsOf("getReadable")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual([
      "server",
    ]);
    expect(cache.callsOf("getWritable")[0]?.vars?.toJSON()).toMatchObject({
      "unikvs:repair": true,
      "unikvs:storageNames": ["cache"],
    });

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });

  test("stream の set は宛先ごとに単一要素を渡す", async ({ expect }) => {
    // 準備
    const a = new FakeStreamStorage("a");
    const b = new FakeStreamStorage("b");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(a).persist(b).create();
    await kvs.open();

    // 実行
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証
    expect(a.callsOf("getWritable")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["a"]);
    expect(b.callsOf("getWritable")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["b"]);

    // 後片付け
    await kvs.close();
  });

  test("fork の共通 prefix は宛先ごとに単一要素を渡す (plain の set/get)", async ({ expect }) => {
    // 準備: 親の connect が fork 先の各宛先に prefix として複製される
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const probe = new FakeTransformer("probe");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(probe)
      .fork(UniKvs.branch().persist(a).persist(b))
      .persist(new Memory())
      .create();
    await kvs.open();

    // 実行: 書き込み時は共通 prefix を共有実行する
    await kvs.set("foo", "value");

    // 検証: 共有1回実行のため複数名で1回が正しい
    expect(
      probe.callsOf("encode").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["a", "b", "Memory"]]);
    expect(Object.isFrozen(probe.callsOf("encode")[0]?.vars?.get("unikvs:storageNames"))).toBe(
      true,
    );

    // 実行: 読み取り時は単一読取元に由来する
    probe.calls.length = 0;
    await kvs.get("foo");

    // 検証
    expect(
      probe.callsOf("decode").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["a"]]);

    // 後片付け
    await kvs.close();
  });

  test("stream の set は共通チェーンを宛先ごとに単一要素で構築する", async ({ expect }) => {
    // 準備
    const a = new FakeStreamStorage("a");
    const b = new FakeStreamStorage("b");
    const probe = new FakeStreamTransformer<Uint8Array>("probe");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(probe)
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証: getEncodable は複数名で1回実行される
    expect(
      probe.callsOf("getEncodable").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["a", "b"]]);
    expect(
      Object.isFrozen(probe.callsOf("getEncodable")[0]?.vars?.get("unikvs:storageNames")),
    ).toBe(true);
    expect(a.callsOf("getWritable")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["a"]);
    expect(b.callsOf("getWritable")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual(["b"]);

    // 後片付け
    await kvs.close();
  });

  test("stream の get/repair は読取元単一と宛先別単一を区別する", async ({ expect }) => {
    // 準備
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const probe = new FakeStreamTransformer<Uint8Array>("probe");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .connect(probe)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    await collect(vs);

    // 検証: decode は単一読取元、repair の再 encode は宛先別単一
    expect(
      probe.callsOf("getDecodable").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["server"]]);
    expect(probe.callsOf("getDecodable")[0]?.vars?.has("unikvs:repair")).toBe(false);
    expect(
      probe.callsOf("getEncodable").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["cache"]]);
    expect(probe.callsOf("getEncodable")[0]?.vars?.toJSON()).toMatchObject({
      "unikvs:repair": true,
    });
    expect(server.callsOf("getReadable")[0]?.vars?.get("unikvs:storageNames")).toStrictEqual([
      "server",
    ]);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });

  test("拒否時はストレージ名を含むメッセージになる", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");
    gate.disable();

    try {
      // 実行
      const error = await kvs.get("foo", { repair: true, throwOnRepairDenied: true }).then(
        () => null,
        (ex) => ex as RepairNotAllowedError,
      );

      // 検証
      expect(error).toBeInstanceOf(RepairNotAllowedError);
      expect(error?.meta).toStrictEqual({ names: ["cache"] });
      expect(error?.message).toContain("cache");
      expect(error?.cause).toBeInstanceOf(RepairNotAllowedError);
      expect((error!.cause as RepairNotAllowedError).meta).toStrictEqual({ names: ["cache"] });
      expect((error!.cause as RepairNotAllowedError).message).toContain("cache");
    } finally {
      await kvs.close();
    }
  });

  test("set の共有 prefix は1回だけ実行され両宛先に分配される", async ({ expect }) => {
    // 準備
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const probe = new FakeTransformer("probe");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(probe)
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    expect(probe.callsOf("encode")).toHaveLength(1);
    expect(a.map.get("foo")).toBe("value");
    expect(b.map.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });

  test("修復 prefix は missing 順名簿で共有実行される", async ({ expect }) => {
    // 準備
    const cacheA = new FakeStorage("cacheA");
    const cacheB = new FakeStorage("cacheB");
    const server = new FakeStorage("server");
    const probe = new FakeTransformer("probe");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .connect(probe)
      .persist(cacheA)
      .persist(cacheB)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    await kvs.get("foo", { repair: true });

    // 検証
    expect(
      probe.callsOf("encode").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["cacheA", "cacheB"]]);
    expect(Object.isFrozen(probe.callsOf("encode")[0]?.vars?.get("unikvs:storageNames"))).toBe(
      true,
    );
    expect(cacheA.map.get("foo")).toBe("value");
    expect(cacheB.map.get("foo")).toBe("value");
    expect(server.callsOf("write")).toHaveLength(0);

    // 後片付け
    await kvs.close();
  });

  test("P=0 構成では prefix 用 vars を生成せず宛先別に実行する", async ({ expect }) => {
    // 準備
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const probeA = new FakeTransformer("probeA");
    const probeB = new FakeTransformer("probeB");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .fork(UniKvs.branch().connect(probeA).persist(a))
      .fork(UniKvs.branch().connect(probeB).persist(b))
      .persist(new Memory())
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    expect(
      probeA.callsOf("encode").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["a"]]);
    expect(
      probeB.callsOf("encode").map((call) => call.vars?.get("unikvs:storageNames")),
    ).toStrictEqual([["b"]]);

    // 後片付け
    await kvs.close();
  });

  test("set の stream の駆動時 prefix 失敗は同一理由で宛先別に集約される", async ({ expect }) => {
    // 準備
    class FailingPrefix extends FakeStreamTransformer<Uint8Array> {
      public readonly reason = new Error("prefix failed");

      public constructor() {
        super("failing-prefix");
      }

      public override async getEncodable(
        args: Parameters<FakeStreamTransformer["getEncodable"]>[0],
      ): Promise<TransformStream<Uint8Array, Uint8Array>> {
        await super.getEncodable(args);
        const reason = this.reason;

        return new TransformStream<Uint8Array, Uint8Array>({
          transform() {
            throw reason;
          },
        });
      }
    }
    const a = new FakeStreamStorage("a");
    const b = new FakeStreamStorage("b");
    const prefix = new FailingPrefix();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(prefix)
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.set("logs", streamOf([new Uint8Array([1])])).then(
      () => null,
      (ex) => ex as PluginOperationAggregateError,
    );

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect(error?.meta.action).toBe("write");
    expect(error?.meta.errors).toHaveLength(2);
    expect(error?.meta.errors.map((entry) => entry.name)).toStrictEqual(["a", "b"]);
    expect(error?.meta.errors.map((entry) => entry.index)).toStrictEqual([0, 1]);
    expect(error?.meta.errors[0]?.reason).toBe(prefix.reason);
    expect(error?.meta.errors[1]?.reason).toBe(prefix.reason);
    expect(a.callsOf("onOtherWriteError")).toHaveLength(0);
    expect(b.callsOf("onOtherWriteError")).toHaveLength(0);
    expect(a.otherWriteErrors).toHaveLength(0);
    expect(b.otherWriteErrors).toHaveLength(0);

    // 後片付け
    await kvs.close();
  });
});
