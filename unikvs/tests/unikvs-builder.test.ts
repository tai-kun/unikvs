import { Memory } from "@unikvs/memory";
import { describe, test } from "vitest";

import { MissingStorageError } from "../src/errors.js";
import UniKvsConfig from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  FakeMiddleware,
  FakeStorage,
  FakeStreamStorage,
  TagMiddleware,
  collect,
  streamOf,
} from "./_helpers.js";

describe("UniKvsConfig - ビルダーの構成", () => {
  test("schema なしでストレージを 1 つ追加して create できる", async ({ expect }) => {
    // 準備
    await using storage = new FakeStorage();

    // 実行
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
    await kvs.open();
    await kvs.set("foo", "bar");

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(storage.map.get("foo")).toBe("bar");
  });

  test("空のオプションオブジェクトでも config できる", async ({ expect }) => {
    // 準備
    await using storage = new FakeStorage();

    // 実行
    await using kvs = UniKvs.config({}).persist(storage).create();
    await kvs.open();

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(kvs.isOpen).toBe(true);
  });

  test("ストレージを登録せず create すると MissingStorageError を投げる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs).use(new FakeMiddleware());

    // 実行と検証
    expect(() => config.create()).toThrow(MissingStorageError);
  });

  test("create を複数回呼ぶと独立したインスタンスが生成される", async ({ expect }) => {
    // 準備
    const config = UniKvs.config<{ foo: PlainValue<string> }>().persist(new Memory());

    // 実行
    await using kvs1 = config.create();
    const kvs2 = config.create();
    await kvs1.open();

    // 検証: isOpen はインスタンスごとに独立している
    expect(kvs1).not.toBe(kvs2);
    expect(kvs1.isOpen).toBe(true);
    expect(kvs2.isOpen).toBe(false);
  });

  test("同じ Middleware で transform を重ねた回数分だけ適用される", async ({ expect }) => {
    // 準備
    await using storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("X"))
      .use(new TagMiddleware("X"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "a");

    // 検証
    expect(storage.map.get("foo")).toBe("aXX");
  });

  test("同じ Storage を persist で複数回登録するとすべての登録先へ書き込まれる", async ({
    expect,
  }) => {
    // 準備
    await using storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(storage)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    expect(storage.callsOf("write")).toHaveLength(2);
    expect(storage.map.get("foo")).toBe("value");
  });

  test("多数の Storage を persist で登録してもすべてに書き込まれる", async ({ expect }) => {
    // 準備
    const storages = Array.from({ length: 25 }, (_, i) => new FakeStorage(`storage-${i}`));
    const [first, ...rest] = storages;
    const config = UniKvs.config<{ foo: PlainValue<string> }>().persist(first!);
    await using kvs = rest.reduce((c, storage) => c.persist(storage), config).create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    for (const storage of storages) {
      expect(storage.map.get("foo")).toBe("value");
    }
  });
});

describe("UniKvsConfig - ミドルウェアとストレージの捕捉", () => {
  test("persist では登録時点のパイプラインのスナップショットを捕捉する", async ({ expect }) => {
    // 準備
    await using storage1 = new FakeStorage("storage1");
    await using storage2 = new FakeStorage("storage2");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .persist(storage1)
      .use(new TagMiddleware("2"))
      .persist(storage2)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storage1.map.get("foo")).toBe("x1");
    expect(storage2.map.get("foo")).toBe("x12");
  });

  test("ストレージ登録後にミドルウェアを追加しても既存ストレージのチェーンは変わらない", async ({
    expect,
  }) => {
    // 準備
    await using storage1 = new FakeStorage("storage1");
    await using storage2 = new FakeStorage("storage2");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(storage1)
      .use(new TagMiddleware("1"))
      .persist(storage2)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storage1.map.get("foo")).toBe("x");
    expect(storage2.map.get("foo")).toBe("x1");
  });

  test("get は書き込み時と同じストレージ別のチェーンでデコードする", async ({ expect }) => {
    // 準備
    await using storage1 = new FakeStorage("storage1");
    await using storage2 = new FakeStorage("storage2");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .persist(storage1)
      .use(new TagMiddleware("2"))
      .persist(storage2)
      .create();
    await kvs.open();
    await kvs.set("foo", "x");
    storage1.map.delete("foo");

    // 実行
    const value = await kvs.get("foo");

    // 検証
    expect(value).toBe("x");
  });

  test("persist なし末尾 use は破棄され読み書きに影響しない", async ({ expect }) => {
    // 準備
    await using storage = new FakeStorage();
    await using trailing = new TagMiddleware("Z");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(storage)
      .use(trailing)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");
    const value = await kvs.get("foo");

    // 検証
    expect(storage.map.get("foo")).toBe("x");
    expect(value).toBe("x");
    expect(trailing.callsOf("encode")).toHaveLength(0);
    expect(trailing.callsOf("open")).toHaveLength(0);

    // 後片付け
    await kvs.close();
    expect(trailing.callsOf("close")).toHaveLength(0);
  });
});

describe("UniKvsConfig - fork", () => {
  test("fork の分岐先ごとに異なるパイプライン出力が保持される", async ({ expect }) => {
    // 準備
    await using storageA = new FakeStorage("storageA");
    await using storageB = new FakeStorage("storageB");
    await using storageC = new FakeStorage("storageC");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .fork(UniKvs.branch().use(new TagMiddleware("A")).persist(storageA))
      .use(new TagMiddleware("2"))
      .fork(UniKvs.branch().use(new TagMiddleware("B")).persist(storageB))
      .use(new TagMiddleware("3"))
      .persist(storageC)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storageA.map.get("foo")).toBe("x1A");
    expect(storageB.map.get("foo")).toBe("x12B");
    expect(storageC.map.get("foo")).toBe("x123");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("fork 内の追加は分岐先に閉じ、後のメインの use は漏れない", async ({ expect }) => {
    // 準備
    await using storage1 = new FakeStorage("storage1");
    await using storage2 = new FakeStorage("storage2");
    await using storage3 = new FakeStorage("storage3");
    await using storageMain = new FakeStorage("storageMain");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .fork(
        UniKvs.branch()
          .use(new TagMiddleware("A"))
          .persist(storage1)
          .persist(storage2)
          .fork(UniKvs.branch().use(new TagMiddleware("N")).persist(storage3)),
      )
      .use(new TagMiddleware("2"))
      .persist(storageMain)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storage1.map.get("foo")).toBe("x1A");
    expect(storage2.map.get("foo")).toBe("x1A");
    expect(storage3.map.get("foo")).toBe("x1AN");
    expect(storageMain.map.get("foo")).toBe("x12");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("use 後に fork 先で追加したストレージも create 対象になる", async ({ expect }) => {
    // 準備
    await using storage = new FakeStorage();
    // UniKvs.config() からは fork のみでは型レベルで create できないため直接構築します。
    await using kvs = new UniKvsConfig(UniKvs)
      .use(new TagMiddleware("1"))
      .fork(UniKvs.branch().persist(storage))
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storage.map.get("foo")).toBe("x1");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("fork 先のストレージへストリーム書き込みできる", async ({ expect }) => {
    // 準備
    await using storageA = new FakeStreamStorage("storageA");
    await using storageB = new FakeStreamStorage("storageB");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .fork(UniKvs.branch().persist(storageA))
      .persist(storageB)
      .create();
    await kvs.open();
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行
    await kvs.set("logs", streamOf(chunks));

    // 検証
    expect(storageA.map.get("logs")).toStrictEqual(chunks);
    expect(storageB.map.get("logs")).toStrictEqual(chunks);
    const valueStream = await kvs.stream("logs");
    await expect(collect(valueStream)).resolves.toStrictEqual(chunks);

    // 後片付け
    await valueStream.dispose();
  });

  test("空の branch を fork してもストレージは増えず読み書きできる", async ({ expect }) => {
    // 準備
    await using storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(storage)
      .fork(UniKvs.branch())
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");
    const value = await kvs.get("foo");

    // 検証
    expect(value).toBe("x");
    expect(storage.map.get("foo")).toBe("x");
    expect(storage.callsOf("write")).toHaveLength(1);
  });
});
