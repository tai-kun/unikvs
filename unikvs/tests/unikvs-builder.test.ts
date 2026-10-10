import { Memory } from "@unikvs/memory";
import { describe, test } from "vitest";

import { MissingStorageError } from "../src/errors.js";
import type { PlainValue, StreamValue } from "../src/unikvs-config.js";
import UniKvsConfig from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import { FakeStorage, FakeStreamStorage, FakeTransformer, collect, streamOf } from "./_helpers.js";

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
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>().persist(storage).create();
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
    const kvs = UniKvs.config({}).persist(storage).create();
    await kvs.open();

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(kvs.isOpen).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("ストレージを登録せず create すると MissingStorageError を投げる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs).transform(new FakeTransformer());

    // 実行と検証
    expect(() => config.create()).toThrow(MissingStorageError);
  });

  test("create を複数回呼ぶと独立したインスタンスが生成される", async ({ expect }) => {
    // 準備
    const config = UniKvs.config<{ foo: PlainValue<string> }>().persist(new Memory());

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

  test("同じ Transformer で transform を重ねた回数分だけ適用される", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(new TagTransformer("X"))
      .transform(new TagTransformer("X"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "a");

    // 検証
    expect(storage.map.get("foo")).toBe("aXX");

    // 後片付け
    await kvs.close();
  });

  test("同じ Storage を persist で複数回登録するとすべての登録先へ書き込まれる", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(storage)
      .persist(storage)
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

  test("多数の Storage を persist で登録してもすべてに書き込まれる", async ({ expect }) => {
    // 準備
    const storages = Array.from({ length: 25 }, (_, i) => new FakeStorage(`storage-${i}`));
    const [first, ...rest] = storages;
    const config = UniKvs.config<{ foo: PlainValue<string> }>().persist(first!);
    const kvs = rest.reduce((c, storage) => c.persist(storage), config).create();
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
  test("persist では登録時点のパイプラインのスナップショットを捕捉する", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(new TagTransformer("1"))
      .persist(storage1)
      .transform(new TagTransformer("2"))
      .persist(storage2)
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

  test("ストレージ登録後にトランスフォーマーを追加しても既存ストレージのチェーンは変わらない", async ({
    expect,
  }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(storage1)
      .transform(new TagTransformer("1"))
      .persist(storage2)
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

  test("get は書き込み時と同じストレージ別のチェーンでデコードする", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(new TagTransformer("1"))
      .persist(storage1)
      .transform(new TagTransformer("2"))
      .persist(storage2)
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

  test("persist なし末尾 transform は破棄され読み書きに影響しない", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const trailing = new TagTransformer("Z");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(storage)
      .transform(trailing)
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
    const storageA = new FakeStorage("storageA");
    const storageB = new FakeStorage("storageB");
    const storageC = new FakeStorage("storageC");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(new TagTransformer("1"))
      .fork(UniKvs.branch().transform(new TagTransformer("A")).persist(storageA))
      .transform(new TagTransformer("2"))
      .fork(UniKvs.branch().transform(new TagTransformer("B")).persist(storageB))
      .transform(new TagTransformer("3"))
      .persist(storageC)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storageA.map.get("foo")).toBe("x1A");
    expect(storageB.map.get("foo")).toBe("x12B");
    expect(storageC.map.get("foo")).toBe("x123");
    expect(await kvs.get("foo")).toBe("x");

    // 後片付け
    await kvs.close();
  });

  test("fork 内の追加は分岐先に閉じ、後のメインの transform は漏れない", async ({ expect }) => {
    // 準備
    const storage1 = new FakeStorage("storage1");
    const storage2 = new FakeStorage("storage2");
    const storage3 = new FakeStorage("storage3");
    const storageMain = new FakeStorage("storageMain");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .transform(new TagTransformer("1"))
      .fork(
        UniKvs.branch()
          .transform(new TagTransformer("A"))
          .persist(storage1)
          .persist(storage2)
          .fork(UniKvs.branch().transform(new TagTransformer("N")).persist(storage3)),
      )
      .transform(new TagTransformer("2"))
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
    expect(await kvs.get("foo")).toBe("x");

    // 後片付け
    await kvs.close();
  });

  test("transform 後に fork 先で追加したストレージも create 対象になる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    // UniKvs.config() からは fork のみでは型レベルで create できないため直接構築します。
    const kvs = new UniKvsConfig(UniKvs)
      .transform(new TagTransformer("1"))
      .fork(UniKvs.branch().persist(storage))
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(storage.map.get("foo")).toBe("x1");
    expect(await kvs.get("foo")).toBe("x");

    // 後片付け
    await kvs.close();
  });

  test("fork 先のストレージへストリーム書き込みできる", async ({ expect }) => {
    // 準備
    const storageA = new FakeStreamStorage("storageA");
    const storageB = new FakeStreamStorage("storageB");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
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
    await kvs.close();
  });

  test("空の branch を fork してもストレージは増えず読み書きできる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
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

    // 後片付け
    await kvs.close();
  });
});
