import { Memory } from "@unikvs/memory";
import { test, describe } from "vite-plus/test";

import { MissingStorageError } from "../src/errors.js";
import { Branch, Builder } from "../src/index.js";
import UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  collect,
  streamOf,
  FakeStorage,
  TagMiddleware,
  FakeMiddleware,
  FakeStreamStorage,
} from "./_helpers.js";

/**
 * 値が undefined でないことを表明して取り出します。
 */
function unwrap<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("想定外の undefined です。");
  }

  return value;
}

describe("Builder - ビルダーの構成", () => {
  test("schema なしでストレージを 1 つ追加して build できる", async ({ expect }) => {
    // 準備：
    await using storage = new FakeStorage();

    // 実行：
    await using kvs = new Builder<{ foo: PlainValue<string> }>().persist(storage).build();
    await kvs.open();
    await kvs.set("foo", "bar");

    // 検証：
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(storage.map.get("foo")).toBe("bar");
  });

  test("空のオプションオブジェクトでも build できる", async ({ expect }) => {
    // 準備：
    await using storage = new FakeStorage();

    // 実行：
    await using kvs = new Builder({}).persist(storage).build();
    await kvs.open();

    // 検証：
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(kvs.isOpen).toBe(true);
  });

  test("ストレージを登録せず build すると MissingStorageError を投げる", ({ expect }) => {
    // 準備：
    const builder = new Builder().use(new FakeMiddleware());

    // 実行と検証：
    // @ts-expect-error: persist なしでは型レベルで build できないが、実行時は動作します。
    expect(() => builder.build()).toThrow(MissingStorageError);
  });

  test("build を複数回呼ぶと独立したインスタンスが生成される", async ({ expect }) => {
    // 準備：
    const builder = new Builder<{ foo: PlainValue<string> }>().persist(new Memory());

    // 実行：
    await using kvs1 = builder.build();
    const kvs2 = builder.build();
    await kvs1.open();

    // 検証 : isOpen はインスタンスごとに独立している。
    expect(kvs1).not.toBe(kvs2);
    expect(kvs1.isOpen).toBe(true);
    expect(kvs2.isOpen).toBe(false);
  });

  test("同じ Middleware で transform を重ねた回数分だけ適用される", async ({ expect }) => {
    // 準備：
    await using storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("X"))
      .use(new TagMiddleware("X"))
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "a");

    // 検証：
    expect(storage.map.get("foo")).toBe("aXX");
  });

  test("同じ Storage を persist で複数回登録するとすべての登録先へ書き込まれる", async ({
    expect,
  }) => {
    // 準備：
    await using storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .persist(storage)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証：
    expect(storage.callsOf("write")).toHaveLength(2);
    expect(storage.map.get("foo")).toBe("value");
  });

  test("多数の Storage を persist で登録してもすべてに書き込まれる", async ({ expect }) => {
    // 準備：
    const storages = Array.from({ length: 25 }, (_, i) => new FakeStorage(`storage-${i}`));
    const [first, ...rest] = storages;
    const resolved = unwrap(first);

    const builder = new Builder<{ foo: PlainValue<string> }>().persist(resolved);
    await using kvs = rest.reduce((c, storage) => c.persist(storage), builder).build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証：
    for (const storage of storages) {
      expect(storage.map.get("foo")).toBe("value");
    }
  });
});

describe("Builder - ミドルウェアとストレージの捕捉", () => {
  test("persist では登録時点のパイプラインのスナップショットを捕捉する", async ({ expect }) => {
    // 準備：
    await using storage1 = new FakeStorage("storage1");
    await using storage2 = new FakeStorage("storage2");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .persist(storage1)
      .use(new TagMiddleware("2"))
      .persist(storage2)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(storage1.map.get("foo")).toBe("x1");
    expect(storage2.map.get("foo")).toBe("x12");
  });

  test("ストレージ登録後にミドルウェアを追加しても既存ストレージのチェーンは変わらない", async ({
    expect,
  }) => {
    // 準備：
    await using storage1 = new FakeStorage("storage1");
    await using storage2 = new FakeStorage("storage2");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .persist(storage1)
      .use(new TagMiddleware("1"))
      .persist(storage2)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(storage1.map.get("foo")).toBe("x");
    expect(storage2.map.get("foo")).toBe("x1");
  });

  test("get は書き込み時と同じストレージ別のチェーンでデコードする", async ({ expect }) => {
    // 準備：
    await using storage1 = new FakeStorage("storage1");
    await using storage2 = new FakeStorage("storage2");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .persist(storage1)
      .use(new TagMiddleware("2"))
      .persist(storage2)
      .build();
    await kvs.open();
    await kvs.set("foo", "x");
    storage1.map.delete("foo");

    // 実行：
    const value = await kvs.get("foo");

    // 検証：
    expect(value).toBe("x");
  });

  test("persist なし末尾 use は破棄され読み書きに影響しない", async ({ expect }) => {
    // 準備：
    await using storage = new FakeStorage();
    await using trailing = new TagMiddleware("Z");
    const kvs = new Builder<{ foo: PlainValue<string> }>().persist(storage).use(trailing).build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    const value = await kvs.get("foo");

    // 検証：
    expect(storage.map.get("foo")).toBe("x");
    expect(value).toBe("x");
    expect(trailing.callsOf("encode")).toHaveLength(0);
    expect(trailing.callsOf("open")).toHaveLength(0);

    // 後片付け。
    await kvs.close();
    expect(trailing.callsOf("close")).toHaveLength(0);
  });
});

describe("Builder - fork", () => {
  test("fork の分岐先ごとに異なるパイプライン出力が保持される", async ({ expect }) => {
    // 準備：
    await using storageA = new FakeStorage("storageA");
    await using storageB = new FakeStorage("storageB");
    await using storageC = new FakeStorage("storageC");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .fork(new Branch().use(new TagMiddleware("A")).persist(storageA))
      .use(new TagMiddleware("2"))
      .fork(new Branch().use(new TagMiddleware("B")).persist(storageB))
      .use(new TagMiddleware("3"))
      .persist(storageC)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(storageA.map.get("foo")).toBe("x1A");
    expect(storageB.map.get("foo")).toBe("x12B");
    expect(storageC.map.get("foo")).toBe("x123");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("fork 内の追加は分岐先に閉じ、後のメインの use は漏れない", async ({ expect }) => {
    // 準備：
    await using storage1 = new FakeStorage("storage1");
    await using storage2 = new FakeStorage("storage2");
    await using storage3 = new FakeStorage("storage3");
    await using storageMain = new FakeStorage("storageMain");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .fork(
        new Branch()
          .use(new TagMiddleware("A"))
          .persist(storage1)
          .persist(storage2)
          .fork(new Branch().use(new TagMiddleware("N")).persist(storage3)),
      )
      .use(new TagMiddleware("2"))
      .persist(storageMain)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(storage1.map.get("foo")).toBe("x1A");
    expect(storage2.map.get("foo")).toBe("x1A");
    expect(storage3.map.get("foo")).toBe("x1AN");
    expect(storageMain.map.get("foo")).toBe("x12");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("use 後に fork 先で追加したストレージも build 対象になる", async ({ expect }) => {
    // 準備：
    await using storage = new FakeStorage();
    // new Builder() からは fork のみでは型レベルで build できないため直接構築します。
    await using kvs = new Builder()
      .use(new TagMiddleware("1"))
      .fork(new Branch().persist(storage))
      // @ts-expect-error: persist なしでは型レベルで build できないが、実行時は動作します。
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(storage.map.get("foo")).toBe("x1");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("fork 先のストレージへストリーム書き込みできる", async ({ expect }) => {
    // 準備：
    await using storageA = new FakeStreamStorage("storageA");
    await using storageB = new FakeStreamStorage("storageB");
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .fork(new Branch().persist(storageA))
      .persist(storageB)
      .build();
    await kvs.open();

    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行：
    await kvs.set("logs", streamOf(chunks));

    // 検証：
    expect(storageA.map.get("logs")).toStrictEqual(chunks);
    expect(storageB.map.get("logs")).toStrictEqual(chunks);

    const valueStream = await kvs.stream("logs");
    await expect(collect(valueStream)).resolves.toStrictEqual(chunks);

    // 後片付け。
    await valueStream.dispose();
  });

  test("空の branch を fork してもストレージは増えず読み書きできる", async ({ expect }) => {
    // 準備：
    await using storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .persist(storage)
      .fork(new Branch())
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    const value = await kvs.get("foo");

    // 検証：
    expect(value).toBe("x");

    expect(storage.map.get("foo")).toBe("x");
    expect(storage.callsOf("write")).toHaveLength(1);
  });
});

describe("Builder - build 時のミドルウェア", () => {
  test("beforeAll はメインとすべての分岐の先頭に挿入される", async ({ expect }) => {
    // 準備：
    await using storageMain = new FakeStorage("main");
    await using storageA = new FakeStorage("A");
    await using storageN = new FakeStorage("N");
    await using before = new TagMiddleware("0");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .fork(
        new Branch()
          .use(new TagMiddleware("A"))
          .persist(storageA)
          .fork(new Branch().use(new TagMiddleware("N")).persist(storageN)),
      )
      .persist(storageMain)
      .build({ beforeAll: [before] });
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(storageMain.map.get("foo")).toBe("x01");
    expect(storageA.map.get("foo")).toBe("x01A");
    expect(storageN.map.get("foo")).toBe("x01AN");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("beforeStorage はメインとすべての分岐のストレージ直前に挿入される", async ({ expect }) => {
    // 準備：
    await using storageMain = new FakeStorage("main");
    await using storageA = new FakeStorage("A");
    await using storageN = new FakeStorage("N");
    await using before = new TagMiddleware("Z");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .fork(
        new Branch()
          .use(new TagMiddleware("A"))
          .persist(storageA)
          .fork(new Branch().use(new TagMiddleware("N")).persist(storageN)),
      )
      .persist(storageMain)
      .build({ beforeStorage: [before] });
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(storageMain.map.get("foo")).toBe("x1Z");
    expect(storageA.map.get("foo")).toBe("x1AZ");
    expect(storageN.map.get("foo")).toBe("x1ANZ");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("beforeStorage は先頭から順に挿入される", async ({ expect }) => {
    // 準備：
    await using storage = new FakeStorage();
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new TagMiddleware("1"))
      .persist(storage)
      .build({ beforeStorage: [new TagMiddleware("X"), new TagMiddleware("Y")] });
    await kvs.open();

    // 実行：
    await kvs.set("foo", "a");

    // 検証：
    expect(storage.map.get("foo")).toBe("a1XY");
    await expect(kvs.get("foo")).resolves.toBe("a");
  });

  test("build 時のミドルウェアは build ごとに適用されビルダーを変更しない", async ({ expect }) => {
    // 準備：
    await using storage = new FakeStorage();
    const builder = new Builder<{ foo: PlainValue<string> }>().persist(storage);
    await using withTag = builder.build({
      beforeAll: [new TagMiddleware("A")],
      beforeStorage: [new TagMiddleware("Z")],
    });
    await withTag.open();

    // 実行：
    await withTag.set("foo", "x");
    expect(storage.map.get("foo")).toBe("xAZ");
    await withTag.close();

    await using plain = builder.build();
    await plain.open();
    await plain.set("foo", "y");

    // 検証：
    expect(storage.map.get("foo")).toBe("y");
    await expect(plain.get("foo")).resolves.toBe("y");
  });
});

describe("Builder - 状態の検証", () => {
  test("メインとすべての分岐にストレージがあるとき isValid は true を返す", ({ expect }) => {
    // 準備：
    const builder = new Builder()
      .persist(new FakeStorage())
      .fork(new Branch().persist(new FakeStorage()).fork(new Branch().persist(new FakeStorage())));

    // 実行：
    const isValid = builder.isValid();

    // 検証：
    expect(isValid).toBe(true);
  });

  test("分岐にのみストレージがある構成でも isValid は true を返す", ({ expect }) => {
    // 準備：
    const builder = new Builder().fork(new Branch().persist(new FakeStorage()));

    // 実行：
    const isValid = builder.isValid();

    // 検証：
    expect(isValid).toBe(true);
  });

  test("ストレージが 1 件もないとき isValid は false を返す", ({ expect }) => {
    // 準備：
    const builder = new Builder();

    // 実行：
    const isValid = builder.isValid();

    // 検証：
    expect(isValid).toBe(false);
  });

  test("ストレージのない分岐を fork すると isValid は false を返す", ({ expect }) => {
    // 準備：
    const builder = new Builder().persist(new FakeStorage()).fork(new Branch());

    // 実行：
    const isValid = builder.isValid();

    // 検証：
    expect(isValid).toBe(false);
  });

  test("分岐内のストレージのない分岐を fork すると isValid は false を返す", ({ expect }) => {
    // 準備：
    const builder = new Builder()
      .persist(new FakeStorage())
      .fork(new Branch().persist(new FakeStorage()).fork(new Branch()));

    // 実行：
    const isValid = builder.isValid();

    // 検証：
    expect(isValid).toBe(false);
  });

  test("fork 後に分岐を変更しても isValid は fork 時点の構成で判定する", ({ expect }) => {
    // 準備：
    const branch = new Branch();
    const builder = new Builder().persist(new FakeStorage()).fork(branch);

    // 実行：
    branch.persist(new FakeStorage());

    // 検証：
    expect(builder.isValid()).toBe(false);
  });
});
