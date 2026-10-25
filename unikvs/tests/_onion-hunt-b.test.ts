import { AllowRepair } from "@unikvs/allow-repair";
import type { IMiddleware } from "@unikvs/core";
import { RepairNotAllowedError } from "@unikvs/core";
import { vi, test, describe } from "vite-plus/test";

import { logger, repairLogger } from "../src/_logger.js";
import UniKvs from "../src/unikvs.js";
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

// -------------------------------------------------------------------------------------------------。
//
// ヘルパー。
//
// -------------------------------------------------------------------------------------------------。

/**
 * `encodeStream`/`decodeStream` の前後で自身のラベルを記録するストリーム対応ミドルウェアです。
 * オニオン順序と共有節の実行回数の検証に使用します。
 */
class OnionOrderStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
  readonly #label: string;

  readonly #order: string[];

  public constructor(label: string, order: string[]) {
    super(label);
    this.#label = label;
    this.#order = order;
  }

  public override async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("encodeStream", {
      c,
      data: undefined,
    });
    this.#order.push(`${this.#label}:encode:pre`);
    c.destination = c.source;
    await next();
    this.#order.push(`${this.#label}:encode:post`);
  }

  public override async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("decodeStream", {
      c,
      data: undefined,
    });
    this.#order.push(`${this.#label}:decode:pre`);
    c.destination = c.source;
    await next();
    this.#order.push(`${this.#label}:decode:post`);
  }
}

/**
 * キーへ接頭辞を付けて写像し、呼び出し回数を数えるストリーム対応ミドルウェアです。
 */
class PrefixStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
  public mapKeyCalls = 0;

  public constructor(name = "PrefixStream") {
    super(name);
  }

  public override mapKey(c: IMiddleware.MapKeyContext): string {
    this.mapKeyCalls += 1;

    return `p:${c.key}`;
  }
}

/**
 * `encodeStream` の pre で共有ストアへ変数を書き込むミドルウェアです。
 */
class StreamVarWriterMiddleware extends FakeStreamMiddleware<Uint8Array> {
  readonly #value: string;

  public constructor(name: string, value = "from-writer") {
    super(name);
    this.#value = value;
  }

  public override async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.set("marker", this.#value);
    c.destination = c.source;
    await next();
  }
}

/**
 * `encodeStream` の pre と post で共有ストアの変数を読むミドルウェアです。
 */
class StreamVarReaderMiddleware extends FakeStreamMiddleware<Uint8Array> {
  public seenInPre: unknown;

  public seenInPost: unknown;

  public constructor(name: string) {
    super(name);
  }

  public override async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    this.seenInPre = c.get("marker");
    c.destination = c.source;
    await next();
    this.seenInPost = c.get("marker");
  }
}

/**
 * `getWritable` が常に失敗するストリームストレージです。
 * 書き戻しの部分失敗の検証に使用します。
 */
class UnwritableStreamStorage extends FakeStreamStorage {
  public override getWritable(): WritableStream<Uint8Array> {
    throw new Error(`${this.name}: getWritable failed`);
  }
}

/**
 * 解放を明示的な cancel で観測するストリームストレージです。
 * 読み取りストリームは閉じずに開いたままにし、cancel が呼ばれた回数を数えます。
 */
class CancelProbeReadStreamStorage extends FakeStreamStorage {
  public cancels = 0;

  public override getReadable(
    c: Parameters<FakeStreamStorage["getReadable"]>[0],
  ): ReadableStream<Uint8Array> {
    const chunks = (this.map.get(c.key) as Uint8Array[] | undefined) ?? [];

    return new ReadableStream<Uint8Array>({
      pull(controller): void {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
      },
      cancel: () => {
        this.cancels += 1;
      },
    });
  }
}

/**
 * 読み取りストリームが中断シグナルでエラーになるストリームストレージです。
 */
class AbortableReadStreamStorage extends FakeStreamStorage {
  public override getReadable(
    c: Parameters<FakeStreamStorage["getReadable"]>[0],
  ): ReadableStream<Uint8Array> {
    const chunks = (this.map.get(c.key) as Uint8Array[] | undefined) ?? [];

    return new ReadableStream<Uint8Array>({
      start(controller): void {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }

        c.signal.addEventListener(
          "abort",
          () => {
            controller.error(c.signal.reason);
          },
          { once: true },
        );
      },
    });
  }
}

// -------------------------------------------------------------------------------------------------。
//
// 1. encodeStream/decodeStream の順序
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - ストリームオニオンの順序", () => {
  test("stream set は共有節の pre/post で全分岐の構築を包み、全分岐へ同一チャンク列を届ける", async ({
    expect,
  }) => {
    // 準備 : 根の共有節 S から葉 c1 と、葉 c2/c3 を持つ節 A へ分岐する。
    const order: string[] = [];
    const s = new OnionOrderStreamMiddleware("S", order);
    const a = new OnionOrderStreamMiddleware("A", order);
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    const c3 = new FakeStreamStorage("c3");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(s)
      .persist(c1)
      .use(a)
      .persist(c2)
      .persist(c3)
      .create();
    await kvs.open();

    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3]), new Uint8Array([])];

    // 実行：
    await kvs.set("logs", streamOf(chunks));

    // 検証 : 共有節は 1 回だけ実行され、上流の post は子節の post より後に走る。
    expect(order).toStrictEqual(["S:encode:pre", "A:encode:pre", "A:encode:post", "S:encode:post"]);
    expect(s.callsOf("encodeStream")).toHaveLength(1);
    expect(a.callsOf("encodeStream")).toHaveLength(1);
    for (const storage of [c1, c2, c3]) {
      expect(storage.map.get("logs")).toStrictEqual(chunks);
    }
  });

  test("decodeStream は葉側から pre、根側から post の順で実行し、チャンク列を変えない", async ({
    expect,
  }) => {
    // 準備 : 根側 a → b → 葉側 c の直列経路で、葉がヒットする。
    const order: string[] = [];
    const a = new OnionOrderStreamMiddleware("A", order);
    const b = new OnionOrderStreamMiddleware("B", order);
    const c = new OnionOrderStreamMiddleware("C", order);
    const storage = new FakeStreamStorage("s");
    storage.map.set("logs", [new Uint8Array([1]), new Uint8Array([2])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(a)
      .use(b)
      .use(c)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行：
    const vs = await kvs.stream("logs");
    const chunks = await collect(vs);

    // 検証 : pre は葉側 (C) から、post は根側 (A) から。
    expect(chunks).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);

    expect(order).toStrictEqual([
      "C:decode:pre",
      "B:decode:pre",
      "A:decode:pre",
      "A:decode:post",
      "B:decode:post",
      "C:decode:post",
    ]);

    // 後片付け。
    await vs.dispose();
  });

  test("stream set は登録順に各分岐の書き込みを開始する", async ({ expect }) => {
    // 準備 : 根の葉 c1 と、節 A の葉 c2/c3 の計 3 分岐。
    const a = new FakeStreamMiddleware<Uint8Array>("A");
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    const c3 = new FakeStreamStorage("c3");
    const writableOrder: string[] = [];

    for (const storage of [c1, c2, c3]) {
      storage.onGetWritable = (key): void => {
        writableOrder.push(`${storage.name}:${key}`);
      };
    }

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(c1)
      .use(a)
      .persist(c2)
      .persist(c3)
      .create();
    await kvs.open();

    // 実行：
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証 : getWritable は葉の登録順に呼ばれる。
    expect(writableOrder).toStrictEqual(["c1:logs", "c2:logs", "c3:logs"]);
  });

  test("decodeStream の共有ストアは葉側の pre の変異を根側の post に見せる", async ({ expect }) => {
    // 準備 : 葉側 C が pre で書き、根側 A が post で読む。
    let seen: unknown;

    class WriterMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async decodeStream(
        c: IMiddleware.DecodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.set("marker", "leaf-side");
        c.destination = c.source;
        await next();
      }
    }

    class ReaderMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async decodeStream(
        c: IMiddleware.DecodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        seen = c.get("marker");
      }
    }
    // decode は葉側から実行されるため、葉側の writer を登録順で後ろに置く。
    const storage = new FakeStreamStorage("s");
    storage.map.set("logs", [new Uint8Array([1])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new ReaderMiddleware("reader"))
      .use(new WriterMiddleware("writer"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行：
    const vs = await kvs.stream("logs");
    await collect(vs);

    // 検証 : 共有ストアにより根側の post からも見える。
    expect(seen).toBe("leaf-side");

    // 後片付け。
    await vs.dispose();
  });
});

// -------------------------------------------------------------------------------------------------。
//
// 2. 失敗時のオニオン
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - ストリーム失敗時の解放と集約", () => {
  test("encodeStream の pre 失敗は set を失敗させ、ソースを解放して何も書かない", async ({
    expect,
  }) => {
    // 準備：
    class ThrowBeforeNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(): Promise<void> {
        throw new Error("PRE-BOOM");
      }
    }

    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller): void {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel(): void {
        cancelled = true;
      },
    });
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new ThrowBeforeNextStreamMiddleware("ThrowBeforeNext"))
      .persist(c1)
      .persist(c2)
      .create();
    await kvs.open();

    // 実行：
    const setting = kvs.set("logs", source);

    // 検証：
    await expect(setting).rejects.toThrow(Error);
    await expect(setting).rejects.toMatchObject({ message: "PRE-BOOM" });

    expect(cancelled).toBe(true);
    expect(source.locked).toBe(false);
    expect(c1.map.has("logs")).toBe(false);
    expect(c2.map.has("logs")).toBe(false);
  });

  test("decodeStream の post 失敗は stream を失敗させ、読み取りソースを解放する", async ({
    expect,
  }) => {
    // 準備 : 解放が cancel で行われることを観測するため、読み取りストリームは閉じない。
    class ThrowAfterNextDecodeStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async decodeStream(
        c: IMiddleware.DecodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source.pipeThrough(new TransformStream());
        await next();
        throw new Error("DECODE-POST-BOOM");
      }
    }

    const storage = new CancelProbeReadStreamStorage("s");
    storage.map.set("logs", [new Uint8Array([1])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new ThrowAfterNextDecodeStreamMiddleware("PostFail"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行：
    const streaming = kvs.stream("logs");

    // 検証：
    await expect(streaming).rejects.toThrow(Error);
    await expect(streaming).rejects.toMatchObject({ message: "DECODE-POST-BOOM" });

    expect(storage.cancels).toBe(1);
  });
});

// -------------------------------------------------------------------------------------------------。
//
// 3. 共有ストア (stream set / stream repair)
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - ストリームオニオンの共有ストア", () => {
  test("stream set は下流 encodeStream の変異を上流 post から読める", async ({ expect }) => {
    // 準備 : 上流 reader が post で、下流 writer が pre で変数を扱う。
    const reader = new StreamVarReaderMiddleware("reader");
    const writer = new StreamVarWriterMiddleware("writer");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(reader)
      .use(writer)
      .persist(new FakeStreamStorage("c1"))
      .persist(new FakeStreamStorage("c2"))
      .create();
    await kvs.open();

    // 実行：
    await kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証：
    expect(reader.seenInPost).toBe("from-writer");
  });

  test("stream repair は下流 encodeStream の変異を上流 post から読める", async ({ expect }) => {
    // 準備 : 書き戻し構築時も同じオニオンで変異が見える。
    const reader = new StreamVarReaderMiddleware("reader");
    const writer = new StreamVarWriterMiddleware("writer");
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .use(reader)
      .use(writer)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    await collect(vs);

    // 検証：
    expect(reader.seenInPost).toBe("from-writer");

    // 後片付け。
    await vs.dispose();
  });

  test("stream repair は分岐をまたいだ変異を後続分岐の pre から読める", async ({ expect }) => {
    // 準備 : 先に走査される分岐 W が書き、後続の分岐 R が pre で読む。
    const writer = new StreamVarWriterMiddleware("writer", "branch-written");
    const reader = new StreamVarReaderMiddleware("reader");
    const cache1 = new FakeStreamStorage("cache1");
    const cache2 = new FakeStreamStorage("cache2");
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .fork(UniKvs.branch().use(writer).persist(cache1))
      .fork(UniKvs.branch().use(reader).persist(cache2))
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    await collect(vs);

    // 検証 : 共有ストアのため、先行分岐の変異が後続分岐の pre にも見える。
    expect(reader.seenInPre).toBe("branch-written");

    // 後片付け。
    await vs.dispose();
  });
});

// -------------------------------------------------------------------------------------------------。
//
// 4. repair のオニオン
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - repair のオニオン", () => {
  test("plain repair の上流 post は下流の書き込み開始後に走る", async ({ expect }) => {
    // 準備 : 共有節の post 時点で、下流の書き戻し書き込みが開始済みである。
    const events: string[] = [];

    class PostProbeMiddleware extends FakeMiddleware {
      public constructor() {
        super("PostProbe");
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        events.push(`post:writes=${cache.callsOf("write").length}`);
      }
    }

    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new AllowRepair())
      .use(new PostProbeMiddleware())
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行：
    const value = await kvs.get("foo", { repair: true });

    // 検証 : next() は書き込みを開始してから戻るため、post 時点で開始済み。
    expect(value).toBe("value");

    expect(events).toStrictEqual(["post:writes=1"]);
  });

  // バグ回帰 : 拒否された部分木の tee 分岐の cancel を await すると、unlocked の兄弟分岐が消費されるまで buildEncodeTree が停止する (walk 内の skip 分岐付近)。
  test("stream repair の next 前拒否は active な兄弟分岐があっても完了する", async ({ expect }) => {
    // 準備 : cache1 と拒否される cache2 が同じ節の兄弟で、両方 missing。server がヒットする。
    using warnSpy = vi.spyOn(repairLogger, "warn");

    class DenyBeforeNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(): Promise<void> {
        throw new RepairNotAllowedError({ names: [this.name] });
      }
    }

    const cache1 = new FakeStreamStorage("cache1");
    const cache2 = new FakeStreamStorage("cache2");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1]), new Uint8Array([2])];
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .persist(cache1)
      .use(new DenyBeforeNextStreamMiddleware("deny"))
      .persist(cache2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行 : 拒否された分岐を skip しても、確認待ちの兄弟分岐で停止しない。
    const vs = await withTimeout(kvs.stream("logs", { repair: true }), 1500, "stream");
    const read = await withTimeout(collect(vs), 1500, "read");

    // 検証 : 拒否分岐だけが skip され、読み取りと他の書き戻しは成功する。
    expect(read).toStrictEqual(chunks);

    expect(cache1.map.get("logs")).toStrictEqual(chunks);
    expect(cache2.map.has("logs")).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      ["Failed to repair a storage: ", ""],
      expect.any(RepairNotAllowedError),
    );

    // 検証 : キーロックが解放されているため、同じキーへの操作と close が完了する。
    await withTimeout(vs.dispose(), 1500, "dispose");
    await expect(withTimeout(kvs.has("logs"), 1500, "has-after-repair")).resolves.toBe(true);
    await withTimeout(kvs.close(), 1500, "close");
  });

  // バグ回帰 : destination を source のままにする節の mapKey 拒否では、walk の catch が abandoned.cancel を await して兄弟分岐待ちで停止する (walk の catch 付近)。
  test("stream repair の mapKey 拒否は source を素通しする節でも完了する", async ({ expect }) => {
    // 準備 : destination を source のままにして mapKey で拒否する (pipeThrough でロックしない)。
    class DenyMapKeyIdentityMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public mapKeyCalls = 0;

      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
      }

      public override mapKey(c: IMiddleware.MapKeyContext): string {
        this.mapKeyCalls += 1;
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (this.mapKeyCalls > 1) {
          throw new RepairNotAllowedError({ names: [this.name] });
        }

        return c.key;
      }
    }

    const cache1 = new FakeStreamStorage("cache1");
    const cache2 = new FakeStreamStorage("cache2");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1])];
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .persist(cache1)
      .use(new DenyMapKeyIdentityMiddleware("deny"))
      .persist(cache2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行：
    const vs = await withTimeout(kvs.stream("logs", { repair: true }), 1500, "stream");
    const read = await withTimeout(collect(vs), 1500, "read");

    // 検証 : 拒否分岐だけが skip され、他の書き戻しは続く。
    expect(read).toStrictEqual(chunks);

    expect(cache1.map.get("logs")).toStrictEqual(chunks);
    expect(cache2.map.has("logs")).toBe(false);

    // 検証 : キーロックが解放されているため、同じキーへの操作と close が完了する。
    await withTimeout(vs.dispose(), 1500, "dispose");
    await expect(withTimeout(kvs.has("logs"), 1500, "has-after-repair")).resolves.toBe(true);
    await withTimeout(kvs.close(), 1500, "close");
  });

  test("stream repair の shared 節の next 前拒否は throwOnRepairDenied 指定時に対象名で失敗する", async ({
    expect,
  }) => {
    // 準備 : deny を共有節にし、その配下の 2 対象が名前として報告される構成にする。
    class DenyBeforeNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(): Promise<void> {
        throw new RepairNotAllowedError({ names: [this.name] });
      }
    }

    const cache1 = new FakeStreamStorage("cache1");
    const cache2 = new FakeStreamStorage("cache2");
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .fork(
        UniKvs.branch()
          .use(new DenyBeforeNextStreamMiddleware("deny"))
          .persist(cache1)
          .persist(cache2),
      )
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    // 実行：
    const streaming = kvs.stream("logs", {
      repair: true,
      throwOnRepairDenied: true,
    });

    // 検証：
    await expect(streaming).rejects.toThrow(RepairNotAllowedError);
    await expect(streaming).rejects.toEqual(
      expect.objectContaining({ meta: { names: ["cache1", "cache2"] } }),
    );

    expect(cache1.map.has("logs")).toBe(false);
    expect(cache2.map.has("logs")).toBe(false);
  });

  // バグ回帰 : 根直下の部分木を skip するとき、tee 分岐の cancel を await すると、まだ消費されていない読み取り側の分岐が解放されるまで buildEncodeTree が停止する (根直下の skip 分岐付近)。
  test("stream repair の根直下の next 前拒否は読み取りを完了してロックを解放する", async ({
    expect,
  }) => {
    // 準備 : 根直下の deny が cache への書き戻しを拒否し、server がヒットする。
    using warnSpy = vi.spyOn(repairLogger, "warn");

    class DenyBeforeNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(): Promise<void> {
        throw new RepairNotAllowedError({ names: [this.name] });
      }
    }

    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1]), new Uint8Array([2])];
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new DenyBeforeNextStreamMiddleware("deny"))
      .use(new AllowRepair())
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行 : 拒否された書き戻しを skip しても、読み取り側の分岐で停止しない。
    const vs = await withTimeout(kvs.stream("logs", { repair: true }), 1500, "stream");
    const read = await withTimeout(collect(vs), 1500, "read");

    // 検証 : 拒否分岐だけが skip され、読み取りは成功する。
    expect(read).toStrictEqual(chunks);

    expect(cache.map.has("logs")).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      ["Failed to repair a storage: ", ""],
      expect.any(RepairNotAllowedError),
    );

    // 検証 : キーロックが解放されているため、同じキーへの操作と close が完了する。
    await withTimeout(vs.dispose(), 1500, "dispose");
    await expect(withTimeout(kvs.has("logs"), 1500, "has-after-repair")).resolves.toBe(true);
    await withTimeout(kvs.close(), 1500, "close");
  });

  // 契約ガード : 根直下の next 前拒否が throwOnRepairDenied で確定しても、読み取りソースを解放して失敗し、キーロックを残さない。根直下 catch の cancel 経路自体は _pipeline-graph.test.ts の単体テストで被覆します。
  test("stream repair の根直下の next 前拒否は throwOnRepairDenied 指定時もソースを解放して失敗する", async ({
    expect,
  }) => {
    // 準備 : 根直下の deny が cache への書き戻しを拒否し、server がヒットする。
    class DenyBeforeNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(): Promise<void> {
        throw new RepairNotAllowedError({ names: [this.name] });
      }
    }

    const cache = new FakeStreamStorage("cache");
    const server = new CancelProbeReadStreamStorage("server");
    server.map.set("logs", [new Uint8Array([1])]);

    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new DenyBeforeNextStreamMiddleware("deny"))
      .use(new AllowRepair())
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();

    // 実行 : 拒否をエラーとして確定させる。
    const streaming = withTimeout(
      kvs.stream("logs", {
        repair: true,
        throwOnRepairDenied: true,
      }),
      1500,
      "stream-denied",
    );

    // 検証 : 対象名付きで失敗し、読み取りソースが解放され、書き戻しは開始されない。
    await expect(streaming).rejects.toThrow(RepairNotAllowedError);
    await expect(streaming).rejects.toEqual(
      expect.objectContaining({ meta: { names: ["cache"] } }),
    );

    expect(server.cancels).toBe(1);
    expect(cache.map.has("logs")).toBe(false);

    // 検証 : キーロックが解放されているため、同じキーへの操作と close が完了する。
    await expect(withTimeout(kvs.has("logs"), 1500, "has-after-denial")).resolves.toBe(true);
    await withTimeout(kvs.close(), 1500, "close");
  });

  test("stream repair は書き戻し先の getWritable 失敗を記録し、他の書き戻しと読み取りを続ける", async ({
    expect,
  }) => {
    // 準備：
    using errorSpy = vi.spyOn(logger, "error");
    const broken = new UnwritableStreamStorage("broken");
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1]), new Uint8Array([2])];
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .persist(broken)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    const read = await collect(vs);

    // 検証：
    expect(read).toStrictEqual(chunks);

    expect(cache.map.get("logs")).toStrictEqual(chunks);
    expect(broken.map.has("logs")).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      ["Failed to repair a storage: ", ""],
      expect.objectContaining({ message: "broken: getWritable failed" }),
    );

    // 後片付け。
    await vs.dispose();
  });
});

// -------------------------------------------------------------------------------------------------。
//
// 5. decodeStream と splitRead (読み取り側の独立性)
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - splitRead と読み取り側の独立性", () => {
  test("stream repair の読み取り側チャンクは書き戻しの mapKey 写像に影響されない", async ({
    expect,
  }) => {
    // 準備 : 読み取りも書き戻しも同じ写像キーを使い、読み取り側のバイト列は元のまま。
    const prefix = new PrefixStreamMiddleware();
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];
    server.map.set("p:logs", chunks);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .use(prefix)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    const read = await collect(vs);

    // 検証 : 読み取りは写像後キーで行い、書き戻しも同じキーで行う。
    expect(read).toStrictEqual(chunks);

    expect(server.callsOf("getReadable")[0]?.key).toBe("p:logs");
    expect(cache.map.get("p:logs")).toStrictEqual(chunks);
    expect(prefix.mapKeyCalls).toBe(2);

    // 後片付け。
    await vs.dispose();
  });

  test("stream repair の読み取り中 abort は読み取りを中断し、dispose 後に同じキーへ書き込める", async ({
    expect,
  }) => {
    // 準備 : 中断で読み取りストリームがエラーになるストレージから repair 読み取りする。
    const reason = new Error("READ-ABORT");
    const ac = new AbortController();
    const cache = new FakeStreamStorage("cache");
    const server = new AbortableReadStreamStorage("server");
    server.map.set("logs", [new Uint8Array([1]), new Uint8Array([2])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();

    // 実行 : 読み取りを開始し、1 チャンク読んでから中断する。
    const vs = await kvs.stream("logs", {
      repair: true,
      signal: ac.signal,
    });
    const reader = vs.getReader();
    const first = await withTimeout(reader.read(), 1500, "first-read");
    expect(first.done).toBe(false);

    ac.abort(reason);
    // 中断後はエラーが届くまで読み進める (キュー済みチャンクの有無に依存しない)。
    const error = await (async (): Promise<unknown> => {
      try {
        while (true) {
          const result = await withTimeout(reader.read(), 1500, "read-after-abort");

          // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
          if (result.done) {
            return null;
          }
        }
      } catch (ex) {
        return ex;
      }
    })();

    // 検証 : 読み取りは中断理由で失敗し、dispose で書き戻しとロックが解放される。
    expect(error).toBe(reason);

    await withTimeout(vs.dispose(), 1500, "dispose-after-abort");
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([3])])), 1500, "set-after-abort"),
    ).resolves.toBeUndefined();
  });

  test("stream repair の構築中 abort はソースを解放して中断理由で失敗する", async ({ expect }) => {
    // 準備 : repair 構築の encodeStream で中断する。
    const reason = new Error("BUILD-ABORT");
    const ac = new AbortController();

    class AbortBeforeNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        ac.abort(reason);
        await next();
      }
    }

    const cache = new FakeStreamStorage("cache");
    const server = new CancelProbeReadStreamStorage("server");
    server.map.set("logs", [new Uint8Array([1])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .use(new AbortBeforeNextStreamMiddleware("abort-mid-build"))
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();

    // 実行：
    const streaming = kvs.stream("logs", {
      repair: true,
      signal: ac.signal,
    });

    // 検証：
    await expect(streaming).rejects.toBe(reason);

    expect(server.cancels).toBe(1);
    expect(cache.map.has("logs")).toBe(false);
  });

  test("stream repair の拒否で失敗した後も同じキーへ書き込める", async ({ expect }) => {
    // 準備 : 書き戻し不許可で stream が失敗する。
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    server.map.set("logs", [new Uint8Array([1])]);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();

    // 実行 : AllowRepair がないため throwOnRepairDenied で失敗する。
    await expect(
      kvs.stream("logs", {
        repair: true,
        throwOnRepairDenied: true,
      }),
    ).rejects.toBeInstanceOf(RepairNotAllowedError);

    // 検証 : 読み取りロックが解放されているため同じキーへ書き込める。
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([2])])), 1500, "set-after-denial"),
    ).resolves.toBeUndefined();
  });
});

// -------------------------------------------------------------------------------------------------。
//
// 6. mapKey
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - ストリームと mapKey", () => {
  test("stream set は共有節の mapKey を 1 回だけ呼ぶ", async ({ expect }) => {
    // 準備：
    const prefix = new PrefixStreamMiddleware();
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(prefix)
      .persist(c1)
      .persist(c2)
      .create();
    await kvs.open();

    const chunks = [new Uint8Array([1])];

    // 実行：
    await kvs.set("logs", streamOf(chunks));

    // 検証 : 共有節の写像は 1 回だけ。
    expect(prefix.mapKeyCalls).toBe(1);
    expect(c1.map.get("p:logs")).toStrictEqual(chunks);
    expect(c2.map.get("p:logs")).toStrictEqual(chunks);
  });

  test("stream repair の書き戻し元と書き戻し先は同じ写像キーを使う", async ({ expect }) => {
    // 準備 : 2 段の経路で、ヒット側と書き戻し先で写像が一致する。
    const prefix = new PrefixStreamMiddleware();
    const tag = new FakeStreamMiddleware<Uint8Array>("tag");
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const chunks = [new Uint8Array([1])];
    server.map.set("p:logs", chunks);

    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .use(prefix)
      .persist(cache)
      .use(tag)
      .persist(server)
      .create();
    await kvs.open();

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    const read = await collect(vs);

    // 検証 : 書き戻し先 cache は prefix 経路の写像キーで書かれる。
    expect(read).toStrictEqual(chunks);

    expect(server.callsOf("getReadable")[0]?.key).toBe("p:logs");
    expect(cache.map.get("p:logs")).toStrictEqual(chunks);

    // 後片付け。
    await vs.dispose();
  });
});

// -------------------------------------------------------------------------------------------------。
//
// 7. fill の並列性と部分失敗
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - stream repair の書き戻しの並列性", () => {
  test("一方の書き戻しが保留中でも他方の書き戻しは開始され、読み取りは妨げられない", async ({
    expect,
  }) => {
    // 準備 : cache1 の書き込みをゲートで保留する。
    const cache1 = new FakeStreamStorage("cache1");
    const cache2 = new FakeStreamStorage("cache2");
    const server = new FakeStreamStorage("server");
    const writeGate = new Gate();
    cache1.writeGate = writeGate;

    const entered = Promise.withResolvers<void>();
    cache1.onWriteStart = (): void => {
      entered.resolve();
    };

    const chunks = [new Uint8Array([1]), new Uint8Array([2])];
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .persist(cache1)
      .persist(cache2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    const reader = vs.getReader();
    const first = await withTimeout(reader.read(), 1500, "read-while-fill");

    // 検証 : 保留中でも他方の書き込みは完了し、最初のチャンクは読める。
    expect(first).toStrictEqual({
      done: false,
      value: chunks[0],
    });

    await withTimeout(entered.promise, 1500, "cache1-write-start");
    await vi.waitFor(() => {
      expect(cache2.map.get("logs")).toStrictEqual(chunks);
    });

    // 後片付け : ゲートを解放して読み切り、書き戻しの完了を待つ。
    writeGate.open();
    const remaining: Uint8Array[] = [];

    while (true) {
      const result = await withTimeout(reader.read(), 1500, "drain");

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (result.done) {
        break;
      }

      remaining.push(result.value);
    }

    expect(remaining).toStrictEqual(chunks.slice(1));
    await vs.dispose();
    expect(cache1.map.get("logs")).toStrictEqual(chunks);
  });

  test("読み取り前に dispose しても書き戻しの保留で停止しない", async ({ expect }) => {
    // 準備 : 書き戻しの書き込みをゲートで保留し、読み取らずに破棄する。
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const writeGate = new Gate();
    cache.writeGate = writeGate;

    const chunks = [new Uint8Array([1]), new Uint8Array([2])];
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", chunks);

    // 実行：
    const vs = await kvs.stream("logs", { repair: true });
    await withTimeout(vs.dispose(), 1500, "dispose");
    // ゲートは閉じたまま。

    // 検証 : 書き戻しのロックも解放され、同じキーへ書き込める。
    writeGate.open();
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([3])])), 1500, "set-after-dispose"),
    ).resolves.toBeUndefined();
  });
});
