import { AllowRepair } from "@unikvs/allow-repair";
import {
  type IStorage,
  type IMiddleware,
  KeyNotFoundError,
  RepairNotAllowedError,
} from "@unikvs/core";
import { vi, test, describe } from "vite-plus/test";

import { Branch, Builder } from "../src/index.js";
import type UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  Gate,
  collect,
  streamOf,
  FakeStorage,
  withTimeout,
  FakeMiddleware,
  FakeStreamStorage,
  FakeStreamMiddleware,
} from "./_helpers.js";

/**
 * clear の呼び出し回数を記録するミドルウェアです。
 * 同一インスタンスが複数の節に現れてもライフサイクルが 1 回だけ実行されることを検証します。
 */
class CountingOnClearMiddleware extends FakeMiddleware {
  public clearCallCount = 0;

  public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    if (c.action === "clear") {
      this.clearCallCount++;
    }

    await super.use(c, next);
  }
}

/**
 * mapKey の呼び出し回数を記録するミドルウェアです。
 * 共有節のキー写像が操作内で 1 回だけ実行されることを検証します。
 */
class CountingMapKeyMiddleware extends FakeMiddleware {
  public mapKeyCallCount = 0;

  public override mapKey(c: IMiddleware.MapKeyContext): string {
    this.mapKeyCallCount++;

    return super.mapKey(c);
  }
}

/**
 * 書き込みで RepairNotAllowedError を投げるストレージです。
 * 書き込み時に判明する拒否が応答のない他の対象を待たないことの検証に使用します。
 * 新方式では repair 要求は get/stream のコンテキストで伝達され、書き戻し自体は通常の書き込みとして実行されるため、全書き込みで拒否します。
 */
class DenyOnRepairWriteStorage extends FakeStorage {
  public override async write(_c: IStorage.WriteContext, _data: unknown): Promise<void> {
    throw new RepairNotAllowedError({ names: [this.name] });
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

  public write(_c: IStorage.WriteContext, _data: unknown): void {}

  public read(_c: IStorage.ReadContext): unknown {
    return undefined;
  }

  public exists(c: IStorage.ExistsContext): boolean {
    return this.entries.has(c.key);
  }

  public delete(c: IStorage.DeleteContext): void {
    this.entries.delete(c.key);
  }

  public copy(c: IStorage.CopyContext): void {
    if (!this.entries.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (c.key === c.destinationKey) {
      return;
    }

    this.entries.set(c.destinationKey, this.entries.get(c.key) as Uint8Array[]);
  }

  public move(c: IStorage.MoveContext): void {
    if (!this.entries.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (c.key === c.destinationKey) {
      return;
    }

    this.entries.set(c.destinationKey, this.entries.get(c.key) as Uint8Array[]);
    this.entries.delete(c.key);
  }

  public clear(): void {
    this.entries.clear();
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array> {
    this.getWritableCallCount++;
    const chunks: Uint8Array[] = [];

    return new WritableStream({
      close: () => {
        this.entries.set(c.key, chunks);
      },
      write(chunk): void {
        chunks.push(chunk);
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array> {
    const chunks = this.entries.get(c.key) ?? [];

    return new ReadableStream<Uint8Array>({
      start(controller): void {
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
  a: FakeMiddleware,
  b: FakeMiddleware,
  c: FakeMiddleware,
  c1: FakeStorage,
  c2: FakeStorage,
  server: FakeStorage,
): UniKvs<{ foo: PlainValue<string> }> {
  return new Builder<{ foo: PlainValue<string> }>()
    .use(ar)
    .fork(new Branch().use(a).use(b).persist(c1).use(c).persist(c2))
    .persist(server)
    .build();
}

describe("UniKvs - パイプライングラフの中間共有", () => {
  test("plain set ではグローバル prefix 後の中間共有ノードを 1 回だけエンコードする", async ({
    expect,
  }) => {
    // 準備：
    const ar = new AllowRepair();
    const a = new FakeMiddleware("A");
    const b = new FakeMiddleware("B");
    const c = new FakeMiddleware("C");
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    await using kvs = createMiddleSharedKvs(ar, a, b, c, c1, c2, server);
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証 : 共有ノードは 1 回だけ、宛先にはエンコード結果が分配される。
    expect(a.callsOf("encode")).toHaveLength(1);
    expect(b.callsOf("encode")).toHaveLength(1);
    expect(c.callsOf("encode")).toHaveLength(1);
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");
    expect(server.map.get("foo")).toBe("value");
  });

  test("stream set ではグローバル prefix 後の中間共有ノードの encodeStream を 1 回だけ呼ぶ", async ({
    expect,
  }) => {
    // 準備：
    const ar = new AllowRepair();
    const a = new FakeStreamMiddleware<Uint8Array>("A");
    const b = new FakeStreamMiddleware<Uint8Array>("B");
    const c = new FakeStreamMiddleware<Uint8Array>("C");
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(ar)
      .fork(new Branch().use(a).use(b).persist(c1).use(c).persist(c2))
      .persist(server)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("logs", streamOf(chunks));

    // 検証：
    expect(a.callsOf("encodeStream")).toHaveLength(1);
    expect(b.callsOf("encodeStream")).toHaveLength(1);
    expect(c.callsOf("encodeStream")).toHaveLength(1);
    expect(c1.map.get("logs")).toStrictEqual(chunks);
    expect(c2.map.get("logs")).toStrictEqual(chunks);
    expect(server.map.get("logs")).toStrictEqual(chunks);
  });

  test("plain repair ではグローバル prefix 後の中間共有ノードを書き戻しで 1 回だけエンコードする", async ({
    expect,
  }) => {
    // 準備：
    const ar = new AllowRepair();
    const a = new FakeMiddleware("A");
    const b = new FakeMiddleware("B");
    const c = new FakeMiddleware("C");
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    await using kvs = createMiddleSharedKvs(ar, a, b, c, c1, c2, server);
    await kvs.open();
    server.map.set("foo", "value");

    // 実行：
    const value = await kvs.get("foo", { repair: true });

    // 検証：
    expect(value).toBe("value");

    expect(a.callsOf("encode")).toHaveLength(1);
    expect(b.callsOf("encode")).toHaveLength(1);
    expect(c.callsOf("encode")).toHaveLength(1);
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");
    expect(server.callsOf("write")).toHaveLength(0);
  });

  test("stream repair ではグローバル prefix 後の中間共有ノードの encodeStream を 1 回だけ呼ぶ", async ({
    expect,
  }) => {
    // 準備：
    const ar = new AllowRepair();
    const a = new FakeStreamMiddleware<Uint8Array>("A");
    const b = new FakeStreamMiddleware<Uint8Array>("B");
    const c = new FakeStreamMiddleware<Uint8Array>("C");
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(ar)
      .fork(new Branch().use(a).use(b).persist(c1).use(c).persist(c2))
      .persist(server)
      .build();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    await collect(vs);

    // 検証：
    expect(a.callsOf("encodeStream")).toHaveLength(1);
    expect(b.callsOf("encodeStream")).toHaveLength(1);
    expect(c.callsOf("encodeStream")).toHaveLength(1);
    expect(c1.map.get("logs")).toStrictEqual(chunks);
    expect(c2.map.get("logs")).toStrictEqual(chunks);
    expect(server.callsOf("getWritable")).toHaveLength(0);

    // 後片付け。
    await vs.dispose();
  });
});

describe("UniKvs - 書き戻しの並列性", () => {
  test("保留中の書き戻しがあっても他の対象の書き込みを開始する", async ({ expect }) => {
    // 準備 : c1 の書き込みをゲートで保留する。
    const ar = new AllowRepair();
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const enteredC1 = new Gate();
    const releaseC1 = new Gate();
    c1.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "write") {
        enteredC1.open();
        await releaseC1.wait();
      }
    };

    const enteredC2 = new Gate();
    c2.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "write") {
        enteredC2.open();
      }
    };

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(ar)
      .persist(c1)
      .persist(c2)
      .persist(server)
      .build();
    await kvs.open();

    server.map.set("foo", "value");

    // 実行：
    const pending = kvs.get("foo", { repair: true });

    await enteredC1.wait();

    // 検証 : c1 の解放前に c2 の書き込みが開始している。
    await expect(withTimeout(enteredC2.wait(), 1000, "c2-write")).resolves.toBeUndefined();
    releaseC1.open();
    await expect(pending).resolves.toBe("value");
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");
  });

  test("対象単位の拒否があっても他の対象の書き戻しは実行される", async ({ expect }) => {
    // 準備 : c1 のみ書き戻し許可がなく、c2 は許可されている。
    const ar = new AllowRepair();
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const enteredC2 = new Gate();
    c2.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "write") {
        enteredC2.open();
      }
    };

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .persist(c1)
      .use(ar)
      .persist(c2)
      .persist(server)
      .build();
    await kvs.open();

    server.map.set("foo", "value");

    // 実行と検証 : 拒否で読み取りは失敗するが、許可された対象は書き戻される。
    await expect(
      kvs.get("foo", {
        repair: true,
        throwOnRepairDenied: true,
      }),
    ).rejects.toThrow(RepairNotAllowedError);
    await expect(withTimeout(enteredC2.wait(), 1000, "c2-write")).resolves.toBeUndefined();
    await vi.waitFor(() => {
      expect(c2.map.get("foo")).toBe("value");
    });
    expect(c1.map.has("foo")).toBe(false);
  });

  test("拒否があっても保留中の他の書き込みを待たずに失敗する", async ({ expect }) => {
    // 準備 : c1 は拒否され、c2 への書き込みはゲートで保留する。
    const ar = new AllowRepair();
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const enteredC2 = new Gate();
    const releaseC2 = new Gate();
    c2.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "write") {
        enteredC2.open();
        await releaseC2.wait();
      }
    };

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .persist(c1)
      .use(ar)
      .persist(c2)
      .persist(server)
      .build();
    await kvs.open();

    server.map.set("foo", "value");

    // 実行：
    const pending = kvs.get("foo", {
      repair: true,
      throwOnRepairDenied: true,
    });

    // 検証 : 許可された対象の書き込みは開始し、拒否はその完了を待たずに確定する。
    await expect(withTimeout(enteredC2.wait(), 1000, "c2-start")).resolves.toBeUndefined();
    await expect(withTimeout(pending, 1000, "fail-fast")).rejects.toBeInstanceOf(
      RepairNotAllowedError,
    );

    // 後片付け : 保留中の書き込みを解放して完了させてから閉じる。
    releaseC2.open();
    await vi.waitFor(() => {
      expect(c2.map.get("foo")).toBe("value");
    });
  });

  test("書き込み時の拒否も応答のない他の書き戻しを待たずに失敗する", async ({ expect }) => {
    // 準備 : c1 の write は拒否を投げ、c2 の write はゲートで保留する。
    const ar = new AllowRepair();
    const c1 = new DenyOnRepairWriteStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    const enteredC2 = new Gate();
    const releaseC2 = new Gate();
    c2.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "write") {
        enteredC2.open();
        await releaseC2.wait();
      }
    };

    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(ar)
      .persist(c1)
      .persist(c2)
      .persist(server)
      .build();
    await kvs.open();

    server.map.set("foo", "value");

    // 実行：
    const pending = kvs.get("foo", {
      repair: true,
      throwOnRepairDenied: true,
    });

    // 検証 : 保留中の書き込みは開始しているが、書き込み時の拒否はその完了を待たずに確定する。
    await expect(withTimeout(enteredC2.wait(), 1000, "c2-start")).resolves.toBeUndefined();
    await expect(withTimeout(pending, 1000, "fail-fast-write")).rejects.toBeInstanceOf(
      RepairNotAllowedError,
    );

    // 後片付け : 保留中の書き込みを解放して完了させてから閉じる。
    releaseC2.open();
    await vi.waitFor(() => {
      expect(c2.map.get("foo")).toBe("value");
    });
  });
});

describe("UniKvs - 重複インスタンスのライフサイクル", () => {
  test("同一ミドルウェアが複数の節に現れても open/onClear/close は 1 回だけ実行される", async ({
    expect,
  }) => {
    // 準備：
    const middleware = new CountingOnClearMiddleware("dup");
    const storage = new FakeStorage("s");
    const kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(middleware)
      .use(middleware)
      .persist(storage)
      .build();

    // 実行：
    await kvs.open();

    // 検証 : open は 1 回。
    expect(middleware.callsOf("open")).toHaveLength(1);

    // 実行：
    await kvs.set("foo", "value");

    // 検証 : 節ごとにエンコードされる。
    expect(middleware.callsOf("encode")).toHaveLength(2);
    expect(storage.map.get("foo")).toBe("value");

    // 実行：
    await kvs.clear();
    await kvs.close();

    // 検証 : onClear と close も 1 回。
    expect(middleware.clearCallCount).toBe(1);
    expect(middleware.callsOf("close")).toHaveLength(1);
  });

  test("メインと fork 先で共有したミドルウェアもライフサイクルは 1 回だけ実行される", async ({
    expect,
  }) => {
    // 準備：
    const middleware = new CountingOnClearMiddleware("shared");
    const s1 = new FakeStorage("s1");
    const s2 = new FakeStorage("s2");
    const kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(middleware)
      .fork(new Branch().use(middleware).persist(s1))
      .persist(s2)
      .build();

    // 実行：
    await kvs.open();
    await kvs.set("foo", "value");

    // 検証 : 節ごとにエンコードされるが、ライフサイクルは 1 回だけ。
    expect(middleware.callsOf("encode")).toHaveLength(2);
    expect(middleware.callsOf("open")).toHaveLength(1);
    expect(s1.map.get("foo")).toBe("value");
    expect(s2.map.get("foo")).toBe("value");

    // 実行：
    await kvs.clear();
    await kvs.close();

    // 検証：
    expect(middleware.clearCallCount).toBe(1);
    expect(middleware.callsOf("close")).toHaveLength(1);
  });
});

describe("UniKvs - 共有節のキー写像", () => {
  test("delete は並列解決でも共有節の mapKey を 1 回だけ呼ぶ", async ({ expect }) => {
    // 準備：
    const middleware = new CountingMapKeyMiddleware("shared");
    const a = new FakeStorage("a");
    const b = new FakeStorage("b");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(middleware)
      .persist(a)
      .persist(b)
      .build();
    await kvs.open();

    // 実行：
    await kvs.delete("foo");

    // 検証：
    expect(middleware.mapKeyCallCount).toBe(1);
  });
});

describe("UniKvs - スキップされた部分木の後始末", () => {
  test("修復対象がすべてスキップされると tee を作らず、破棄でソースを解放する", async ({
    expect,
  }) => {
    // 準備 : AllowRepair なしでは修復対象の部分木がスキップされる (新方式では repair 要求は get/stream のコンテキストで伝達され、canRepair のない葉は警告のうえスキップされる)。
    const outer = new FakeStreamMiddleware<Uint8Array>("outer");
    const cache = new CancelObservableStorage("cache");
    const server = new CancelObservableStorage("server");
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(outer)
      .persist(cache)
      .persist(server)
      .build();
    await kvs.open();
    server.entries.set("logs", [new Uint8Array([1])]);

    using teeSpy = vi.spyOn(ReadableStream.prototype, "tee");

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });

    // 検証 : 書き込み対象が残らないため修復用の tee も書き込みも作らない。
    expect(teeSpy).not.toHaveBeenCalled();

    expect(cache.getWritableCallCount).toBe(0);

    // 実行 : 早期破棄。
    await vs.dispose();

    // 検証 : ソースが解放される。
    expect(server.sourceCancelled).toBe(true);
  });
});

describe("UniKvs - デコードの後始末", () => {
  test("デコード途中の decodeStream 失敗でもソースが解放される", async ({ expect }) => {
    // 準備 : デコードは後段 (storage 側) から順に適用されるため、後段は成功して前段が失敗する。
    const storage = new CancelObservableStorage("logs");
    storage.entries.set("logs", [new Uint8Array([1])]);

    const inner = new FakeStreamMiddleware<Uint8Array>("inner");
    const outer = new FakeStreamMiddleware<Uint8Array>("outer");
    inner.errors["decodeStream"] = new Error("decodeStream failed");

    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(inner)
      .use(outer)
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証 : 失敗は伝播し、構築済みパイプ経由でソースが解放される。
    await expect(kvs.stream("logs")).rejects.toThrow("decodeStream failed");

    expect(storage.sourceCancelled).toBe(true);
  });
});

describe("UniKvs - 書き戻し中の読み取り", () => {
  test("書き戻しが保留中でも読み取り出力は進行する", async ({ expect }) => {
    // 準備 : cache への書き戻しをゲートで保留する。
    const ar = new AllowRepair();
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const writeGate = new Gate();
    cache.writeGate = writeGate;

    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];
    await using kvs = new Builder<{ logs: StreamValue<Uint8Array> }>()
      .use(ar)
      .persist(cache)
      .persist(server)
      .build();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    const reader = vs.getReader();

    // 検証 : 書き戻しが保留中でも最初のチャンクを読み取れる。
    await expect(withTimeout(reader.read(), 1000, "read-while-fill")).resolves.toStrictEqual({
      done: false,
      value: chunks[0],
    });

    // 後片付けと検証 : 解放後に残りを読み切り、書き戻しも完了する。
    writeGate.open();
    const remaining: Uint8Array[] = [];

    while (true) {
      const result = await withTimeout(reader.read(), 1000, "drain");

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (result.done) {
        break;
      }

      remaining.push(result.value);
    }

    expect(remaining).toStrictEqual(chunks.slice(1));
    await vs.dispose();
    expect(cache.map.get("logs")).toStrictEqual(chunks);
  });
});
