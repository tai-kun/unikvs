import { AllowRepair } from "@unikvs/allow-repair";
import { type IStorage, type ITransformer, RepairNotAllowedError } from "@unikvs/core";
import { describe, test, vi } from "vitest";

import UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  FakeStorage,
  FakeStreamStorage,
  FakeStreamTransformer,
  FakeTransformer,
  Gate,
  collect,
  streamOf,
  withTimeout,
} from "./_helpers.js";

/**
 * clear の呼び出し回数を記録するトランスフォーマーです。
 * 同一インスタンスが複数の節に現れてもライフサイクルが 1 回だけ実行されることを検証します。
 */
class CountingOnClearTransformer extends FakeTransformer {
  public clearCallCount = 0;

  public async onClear(): Promise<void> {
    this.clearCallCount++;
  }
}

/**
 * mapKey の呼び出し回数を記録するトランスフォーマーです。
 * 共有節のキー写像が操作内で 1 回だけ実行されることを検証します。
 */
class CountingMapKeyTransformer extends FakeTransformer {
  public mapKeyCallCount = 0;

  public async mapKey(args: ITransformer.MapKeyArgs): Promise<string> {
    this.mapKeyCallCount++;
    return args.key;
  }
}

/**
 * 書き戻しマーカー付きの write で RepairNotAllowedError を投げるストレージです。
 * 書き込み時に判明する拒否が応答のない他の対象を待たないことの検証に使用します。
 */
class DenyOnRepairWriteStorage extends FakeStorage {
  public override async write(args: IStorage.WriteArgs): Promise<void> {
    if (args.vars?.get("unikvs:repair") === true) {
      throw new RepairNotAllowedError({ names: [this.name] });
    }

    await super.write(args);
  }
}

/**
 * 読み取りストリームのキャンセルと getWritable の呼び出しを観測できるストレージモックです。
 * スキップされた修復部分木がソースを保持したままにならないかの検証に使用します。
 */
class CancelObservableStorage implements IStorage {
  public readonly name: string;
  public isOpen = true;
  public sourceCancelled = false;
  public getWritableCallCount = 0;
  public readonly entries = new Map<string, Uint8Array[]>();

  public constructor(name: string) {
    this.name = name;
  }

  public write(_args: IStorage.WriteArgs): void {}

  public read(_args: IStorage.ReadArgs): unknown {
    return undefined;
  }

  public exists(args: IStorage.ExistsArgs): boolean {
    return this.entries.has(args.key);
  }

  public delete(args: IStorage.DeleteArgs): void {
    this.entries.delete(args.key);
  }

  public clear(): void {
    this.entries.clear();
  }

  public getWritable(args: Pick<IStorage.GetWritableArgs, "key">): WritableStream<Uint8Array> {
    this.getWritableCallCount++;
    const chunks: Uint8Array[] = [];
    return new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
      close: () => {
        this.entries.set(args.key, chunks);
      },
    });
  }

  public getReadable(args: Pick<IStorage.GetReadableArgs, "key">): ReadableStream<Uint8Array> {
    const chunks = this.entries.get(args.key) ?? [];
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
      },
      cancel: () => {
        this.sourceCancelled = true;
      },
    });
  }
}

/**
 * グローバル prefix の後に A/B を共有するグラフを構築します。
 *
 * 宛先の登録順は c1, c2, server となり、server がヒットしたときに c1 と c2 が書き戻し対象になります。A と B は c1 と c2 でのみ共有されます。
 */
function createMiddleSharedKvs(
  ar: AllowRepair,
  a: FakeTransformer,
  b: FakeTransformer,
  c: FakeTransformer,
  c1: FakeStorage,
  c2: FakeStorage,
  server: FakeStorage,
): UniKvs<{ foo: PlainValue<string> }> {
  return UniKvs.config<{ foo: PlainValue<string> }>()
    .connect(ar)
    .fork(UniKvs.branch().connect(a).connect(b).persist(c1).connect(c).persist(c2))
    .persist(server)
    .create();
}

describe("UniKvs - パイプライングラフの中間共有", () => {
  test("plain set ではグローバル prefix 後の中間共有ノードを 1 回だけエンコードする", async ({
    expect,
  }) => {
    // 準備
    const ar = new AllowRepair();
    const a = new FakeTransformer("A");
    const b = new FakeTransformer("B");
    const c = new FakeTransformer("C");
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const kvs = createMiddleSharedKvs(ar, a, b, c, c1, c2, server);
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証: 共有ノードは 1 回だけ、宛先にはエンコード結果が分配される
    expect(a.callsOf("encode")).toHaveLength(1);
    expect(b.callsOf("encode")).toHaveLength(1);
    expect(c.callsOf("encode")).toHaveLength(1);
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");
    expect(server.map.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });

  test("stream set ではグローバル prefix 後の中間共有ノードの getEncodable を 1 回だけ呼ぶ", async ({
    expect,
  }) => {
    // 準備
    const ar = new AllowRepair();
    const a = new FakeStreamTransformer<Uint8Array>("A");
    const b = new FakeStreamTransformer<Uint8Array>("B");
    const c = new FakeStreamTransformer<Uint8Array>("C");
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(ar)
      .fork(UniKvs.branch().connect(a).connect(b).persist(c1).connect(c).persist(c2))
      .persist(server)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("logs", streamOf(chunks));

    // 検証
    expect(a.callsOf("getEncodable")).toHaveLength(1);
    expect(b.callsOf("getEncodable")).toHaveLength(1);
    expect(c.callsOf("getEncodable")).toHaveLength(1);
    expect(c1.map.get("logs")).toStrictEqual(chunks);
    expect(c2.map.get("logs")).toStrictEqual(chunks);
    expect(server.map.get("logs")).toStrictEqual(chunks);

    // 後片付け
    await kvs.close();
  });

  test("plain repair ではグローバル prefix 後の中間共有ノードを書き戻しで 1 回だけエンコードする", async ({
    expect,
  }) => {
    // 準備
    const ar = new AllowRepair();
    const a = new FakeTransformer("A");
    const b = new FakeTransformer("B");
    const c = new FakeTransformer("C");
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const kvs = createMiddleSharedKvs(ar, a, b, c, c1, c2, server);
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const value = await kvs.get("foo", { repair: true });

    // 検証
    expect(value).toBe("value");
    expect(a.callsOf("encode")).toHaveLength(1);
    expect(b.callsOf("encode")).toHaveLength(1);
    expect(c.callsOf("encode")).toHaveLength(1);
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");
    expect(server.callsOf("write")).toHaveLength(0);

    // 後片付け
    await kvs.close();
  });

  test("stream repair ではグローバル prefix 後の中間共有ノードの getEncodable を 1 回だけ呼ぶ", async ({
    expect,
  }) => {
    // 準備
    const ar = new AllowRepair();
    const a = new FakeStreamTransformer<Uint8Array>("A");
    const b = new FakeStreamTransformer<Uint8Array>("B");
    const c = new FakeStreamTransformer<Uint8Array>("C");
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(ar)
      .fork(UniKvs.branch().connect(a).connect(b).persist(c1).connect(c).persist(c2))
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    await collect(vs);

    // 検証
    expect(a.callsOf("getEncodable")).toHaveLength(1);
    expect(b.callsOf("getEncodable")).toHaveLength(1);
    expect(c.callsOf("getEncodable")).toHaveLength(1);
    expect(c1.map.get("logs")).toStrictEqual(chunks);
    expect(c2.map.get("logs")).toStrictEqual(chunks);
    expect(server.callsOf("getWritable")).toHaveLength(0);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });
});

describe("UniKvs - 書き戻しの並列性", () => {
  test("保留中の書き戻しがあっても他の対象の書き込みを開始する", async ({ expect }) => {
    // 準備: c1 の書き込みをゲートで保留する
    const ar = new AllowRepair();
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const enteredC1 = new Gate();
    const releaseC1 = new Gate();
    c1.hook = async (call) => {
      if (call.method === "write") {
        enteredC1.open();
        await releaseC1.wait();
      }
    };
    const enteredC2 = new Gate();
    c2.hook = (call) => {
      if (call.method === "write") {
        enteredC2.open();
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(ar)
      .persist(c1)
      .persist(c2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const pending = kvs.get("foo", { repair: true });
    await enteredC1.wait();

    // 検証: c1 の解放前に c2 の書き込みが開始している
    await expect(withTimeout(enteredC2.wait(), 1000, "c2-write")).resolves.toBeUndefined();
    releaseC1.open();
    await expect(pending).resolves.toBe("value");
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });

  test("対象単位の拒否があっても他の対象の書き戻しは実行される", async ({ expect }) => {
    // 準備: c1 のみ書き戻し許可がなく、c2 は許可されている
    const ar = new AllowRepair();
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const enteredC2 = new Gate();
    c2.hook = (call) => {
      if (call.method === "write") {
        enteredC2.open();
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(c1)
      .connect(ar)
      .persist(c2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行と検証: 拒否で読み取りは失敗するが、許可された対象は書き戻される
    await expect(kvs.get("foo", { repair: true, throwOnRepairDenied: true })).rejects.toThrow(
      RepairNotAllowedError,
    );
    await expect(withTimeout(enteredC2.wait(), 1000, "c2-write")).resolves.toBeUndefined();
    await vi.waitFor(() => {
      expect(c2.map.get("foo")).toBe("value");
    });
    expect(c1.map.has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("拒否があっても保留中の他の書き込みを待たずに失敗する", async ({ expect }) => {
    // 準備: c1 は拒否され、c2 への書き込みはゲートで保留する
    const ar = new AllowRepair();
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const enteredC2 = new Gate();
    const releaseC2 = new Gate();
    c2.hook = async (call) => {
      if (call.method === "write") {
        enteredC2.open();
        await releaseC2.wait();
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(c1)
      .connect(ar)
      .persist(c2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const pending = kvs.get("foo", { repair: true, throwOnRepairDenied: true });

    // 検証: 許可された対象の書き込みは開始し、拒否はその完了を待たずに確定する
    await expect(withTimeout(enteredC2.wait(), 1000, "c2-start")).resolves.toBeUndefined();
    await expect(
      withTimeout(
        pending.then(
          () => null,
          (ex: unknown) => ex,
        ),
        1000,
        "fail-fast",
      ),
    ).resolves.toBeInstanceOf(RepairNotAllowedError);

    // 後片付け: 保留中の書き込みを解放して完了させてから閉じる
    releaseC2.open();
    await vi.waitFor(() => {
      expect(c2.map.get("foo")).toBe("value");
    });
    await kvs.close();
  });

  test("書き込み時の拒否も応答のない他の書き戻しを待たずに失敗する", async ({ expect }) => {
    // 準備: c1 の write は拒否を投げ、c2 の write はゲートで保留する
    const ar = new AllowRepair();
    const c1 = new DenyOnRepairWriteStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const enteredC2 = new Gate();
    const releaseC2 = new Gate();
    c2.hook = async (call) => {
      if (call.method === "write") {
        enteredC2.open();
        await releaseC2.wait();
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(ar)
      .persist(c1)
      .persist(c2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const pending = kvs.get("foo", { repair: true, throwOnRepairDenied: true });

    // 検証: 保留中の書き込みは開始しているが、書き込み時の拒否はその完了を待たずに確定する
    await expect(withTimeout(enteredC2.wait(), 1000, "c2-start")).resolves.toBeUndefined();
    await expect(
      withTimeout(
        pending.then(
          () => null,
          (ex: unknown) => ex,
        ),
        1000,
        "fail-fast-write",
      ),
    ).resolves.toBeInstanceOf(RepairNotAllowedError);

    // 後片付け: 保留中の書き込みを解放して完了させてから閉じる
    releaseC2.open();
    await vi.waitFor(() => {
      expect(c2.map.get("foo")).toBe("value");
    });
    await kvs.close();
  });
});

describe("UniKvs - 重複インスタンスのライフサイクル", () => {
  test("同一トランスフォーマーが複数の節に現れても open/onClear/close は 1 回だけ実行される", async ({
    expect,
  }) => {
    // 準備
    const transformer = new CountingOnClearTransformer("dup");
    const storage = new FakeStorage("s");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(transformer)
      .connect(transformer)
      .persist(storage)
      .create();

    // 実行
    await kvs.open();

    // 検証: open は 1 回
    expect(transformer.callsOf("open")).toHaveLength(1);

    // 実行
    await kvs.set("foo", "value");

    // 検証: 節ごとにエンコードされる
    expect(transformer.callsOf("encode")).toHaveLength(2);
    expect(storage.map.get("foo")).toBe("value");

    // 実行
    await kvs.clear();
    await kvs.close();

    // 検証: onClear と close も 1 回
    expect(transformer.clearCallCount).toBe(1);
    expect(transformer.callsOf("close")).toHaveLength(1);
  });

  test("メインと fork 先で共有したトランスフォーマーもライフサイクルは 1 回だけ実行される", async ({
    expect,
  }) => {
    // 準備
    const transformer = new CountingOnClearTransformer("shared");
    const s1 = new FakeStorage("s1");
    const s2 = new FakeStorage("s2");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(transformer)
      .fork(UniKvs.branch().connect(transformer).persist(s1))
      .persist(s2)
      .create();

    // 実行
    await kvs.open();
    await kvs.set("foo", "value");

    // 検証: 節ごとにエンコードされるが、ライフサイクルは 1 回だけ
    expect(transformer.callsOf("encode")).toHaveLength(2);
    expect(transformer.callsOf("open")).toHaveLength(1);
    expect(s1.map.get("foo")).toBe("value");
    expect(s2.map.get("foo")).toBe("value");

    // 実行
    await kvs.clear();
    await kvs.close();

    // 検証
    expect(transformer.clearCallCount).toBe(1);
    expect(transformer.callsOf("close")).toHaveLength(1);
  });
});

describe("UniKvs - 共有節のキー写像", () => {
  test("delete は並列解決でも共有節の mapKey を 1 回だけ呼ぶ", async ({ expect }) => {
    // 準備
    const transformer = new CountingMapKeyTransformer("shared");
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(transformer)
      .persist(a)
      .persist(b)
      .create();
    await kvs.open();

    // 実行
    await kvs.delete("foo");

    // 検証
    expect(transformer.mapKeyCallCount).toBe(1);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - スキップされた部分木の後始末", () => {
  test("修復対象がすべてスキップされると tee を作らず、破棄でソースを解放する", async ({
    expect,
  }) => {
    // 準備: 無効化した AllowRepair により修復対象の部分木がセットアップでスキップされる
    const outer = new FakeStreamTransformer<Uint8Array>("outer");
    const gate = new AllowRepair();
    gate.disable();
    const cache = new CancelObservableStorage("cache");
    const server = new CancelObservableStorage("server");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(outer)
      .connect(gate)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.entries.set("logs", [new Uint8Array([1])]);
    using teeSpy = vi.spyOn(ReadableStream.prototype, "tee");

    // 実行
    const vs = await kvs.stream("logs", { repair: true });

    // 検証: 書き込み対象が残らないため修復用の tee も書き込みも作らない
    expect(teeSpy).not.toHaveBeenCalled();
    expect(cache.getWritableCallCount).toBe(0);

    // 実行: 早期破棄
    await vs.dispose();

    // 検証: ソースが解放される
    expect(server.sourceCancelled).toBe(true);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - デコードの後始末", () => {
  test("デコード途中の getDecodable 失敗でもソースが解放される", async ({ expect }) => {
    // 準備: デコードは後段 (storage 側) から順に適用されるため、後段は成功して前段が失敗する
    const storage = new CancelObservableStorage("logs");
    storage.entries.set("logs", [new Uint8Array([1])]);
    const inner = new FakeStreamTransformer<Uint8Array>("inner");
    const outer = new FakeStreamTransformer<Uint8Array>("outer");
    inner.errors["getDecodable"] = new Error("getDecodable failed");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(inner)
      .connect(outer)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行と検証: 失敗は伝播し、構築済みパイプ経由でソースが解放される
    await expect(kvs.stream("logs")).rejects.toThrow("getDecodable failed");
    expect(storage.sourceCancelled).toBe(true);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - 書き戻し中の読み取り", () => {
  test("書き戻しが保留中でも読み取り出力は進行する", async ({ expect }) => {
    // 準備: cache への書き戻しをゲートで保留する
    const ar = new AllowRepair();
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const writeGate = new Gate();
    cache.writeGate = writeGate;
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(ar)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    const reader = vs.getReader();

    // 検証: 書き戻しが保留中でも最初のチャンクを読み取れる
    await expect(withTimeout(reader.read(), 1000, "read-while-fill")).resolves.toStrictEqual({
      done: false,
      value: chunks[0],
    });

    // 後片付けと検証: 解放後に残りを読み切り、書き戻しも完了する
    writeGate.open();
    const remaining: Uint8Array[] = [];
    while (true) {
      const result = await withTimeout(reader.read(), 1000, "drain");
      if (result.done) {
        break;
      }
      remaining.push(result.value);
    }
    expect(remaining).toStrictEqual(chunks.slice(1));
    await vs.dispose();
    expect(cache.map.get("logs")).toStrictEqual(chunks);
    await kvs.close();
  });
});
