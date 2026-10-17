import { AllowRepair } from "@unikvs/allow-repair";
import { ChecksumSha256 } from "@unikvs/checksum";
import { Compression } from "@unikvs/compression";
import type { IMiddleware, IReadableStream, IStorage } from "@unikvs/core";
import { RepairNotAllowedError } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import * as v from "valibot";
import { describe, test, vi } from "vitest";

import { logger } from "../src/_logger.js";
import {
  MiddlewareDestinationMissingError,
  MiddlewareNextNotAwaitedError,
  MiddlewareNextNotCalledError,
  PluginOperationAggregateError,
} from "../src/errors.js";
import UniKvs from "../src/unikvs.js";
import { StreamValue } from "../src/value-schemas.js";
import type { PlainValue } from "../src/value-schemas.js";
import {
  FakeMiddleware,
  FakeStorage,
  FakeStreamMiddleware,
  FakeStreamStorage,
  Gate,
  collect,
  collectBytes,
  isGzip,
  isPending,
  mapOf,
  sha256Hex,
  streamOf,
  withTimeout,
} from "./_helpers.js";

// -------------------------------------------------------------------------------------------------
//
// ヘルパー
//
// -------------------------------------------------------------------------------------------------

/**
 * `next()` を呼ぶが `destination` を設定しないミドルウェアです。
 * `destination` 未設定の規約違反が操作全体の失敗になることを検証します。
 */
class MissingDestinationMiddleware extends FakeMiddleware {
  public constructor(name = "MissingDestination") {
    super(name);
  }

  public override async encode(
    c: IMiddleware.EncodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("encode", { data: c.source, c });
    await next();
  }

  public override async decode(
    c: IMiddleware.DecodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("decode", { data: c.source, c });
    await next();
  }
}

/**
 * `next()` を呼ぶが `destination` を設定しないストリーム対応ミドルウェアです。
 */
class MissingDestinationStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
  public constructor(name = "MissingDestinationStream") {
    super(name);
  }

  public override async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("encodeStream", { data: undefined, c });
    await next();
  }

  public override async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await this.record("decodeStream", { data: undefined, c });
    await next();
  }
}

/**
 * `next()` を await せずに戻るミドルウェアです。
 * 切り離した `next()` は `detached` に保持し、テスト側で完了を待てるようにします。
 */
class FireAndForgetMiddleware extends FakeMiddleware {
  public detached: Promise<void> | undefined;

  public constructor(name = "FireAndForget") {
    super(name);
  }

  public override async encode(
    c: IMiddleware.EncodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    this.detached = next();
  }

  public override async decode(
    c: IMiddleware.DecodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    this.detached = next();
  }
}

/**
 * `next()` を await せずに戻るストリーム対応ミドルウェアです。
 * 切り離した `next()` は `detached` に保持し、テスト側で完了を待てるようにします。
 */
class FireAndForgetStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
  public detached: Promise<void> | undefined;

  public constructor(name = "FireAndForgetStream") {
    super(name);
  }

  public override async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    this.detached = next();
  }

  public override async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    this.detached = next();
  }
}

/**
 * `next()` の前後で自身のラベルを記録するミドルウェアです。
 * オニオン実行では上流の post が下流の処理完了後に実行されます。
 */
class OnionOrderMiddleware extends FakeMiddleware {
  readonly #label: string;
  readonly #order: string[];

  public constructor(label: string, order: string[]) {
    super(label);
    this.#label = label;
    this.#order = order;
  }

  public override async encode(
    c: IMiddleware.EncodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    this.#order.push(`${this.#label}:pre`);
    c.destination = c.source;
    await next();
    this.#order.push(`${this.#label}:post`);
  }
}

/**
 * `next()` の前後で自身のラベルを記録するストリーム対応ミドルウェアです。
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
    this.#order.push(`${this.#label}:pre`);
    c.destination = c.source;
    await next();
    this.#order.push(`${this.#label}:post`);
  }
}

/**
 * `next()` を await してから投げるミドルウェアです。
 * 後段開始後に自ら失敗したときの伝播を検証します。
 */
class ThrowAfterNextMiddleware extends FakeMiddleware {
  readonly #error: Error;

  public constructor(name: string, error: Error) {
    super(name);
    this.#error = error;
  }

  public override async encode(
    c: IMiddleware.EncodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    await next();
    throw this.#error;
  }
}

/**
 * 指定チャンク数に達したら書き込みを失敗させるストリームストレージです。
 */
class MidWriteFailStreamStorage extends FakeStorage {
  public failAtChunk: number;
  public readonly stored = new Map<string, Uint8Array[]>();

  public constructor(name: string, failAtChunk = 2) {
    super(name);
    this.failAtChunk = failAtChunk;
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let count = 0;
    const failAt = this.failAtChunk;
    const stored = this.stored;
    const key = c.key;

    return new WritableStream<Uint8Array>({
      write(chunk) {
        count++;
        if (count >= failAt) {
          throw new Error(`write failed at chunk ${count}`);
        }
        chunks.push(chunk);
      },
      close() {
        stored.set(key, chunks);
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array> {
    const chunks = this.stored.get(c.key) ?? [];

    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
  }
}

// -------------------------------------------------------------------------------------------------
//
// ミドルウェア: destination 未設定
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - destination 未設定の規約違反", () => {
  test("encode が destination を設定しないと MiddlewareDestinationMissingError で set が失敗する", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new MissingDestinationMiddleware("NoDest"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const setting = kvs.set("foo", "value");

    // 検証
    await expect(setting).rejects.toThrow(MiddlewareDestinationMissingError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({ meta: { name: "NoDest", operation: "encode" } }),
    );
    expect(storage.map.has("foo")).toBe(false);
  });

  test("decode が destination を設定しないと MiddlewareDestinationMissingError で get が失敗する", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new MissingDestinationMiddleware("NoDest"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const getting = kvs.get("foo");

    // 検証
    await expect(getting).rejects.toThrow(MiddlewareDestinationMissingError);
    await expect(getting).rejects.toEqual(
      expect.objectContaining({ meta: { name: "NoDest", operation: "decode" } }),
    );
  });

  test("encodeStream が destination を設定しないと MiddlewareDestinationMissingError で set が失敗する", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new MissingDestinationStreamMiddleware("NoDestStream"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const setting = kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証
    await expect(setting).rejects.toThrow(MiddlewareDestinationMissingError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({ meta: { name: "NoDestStream", operation: "encode" } }),
    );
    expect(storage.map.has("logs")).toBe(false);
  });

  test("decodeStream が destination を設定しないと MiddlewareDestinationMissingError で stream が失敗する", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new MissingDestinationStreamMiddleware("NoDestStream"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const streaming = kvs.stream("logs");

    // 検証
    await expect(streaming).rejects.toThrow(MiddlewareDestinationMissingError);
    await expect(streaming).rejects.toEqual(
      expect.objectContaining({ meta: { name: "NoDestStream", operation: "decode" } }),
    );
  });
});

// -------------------------------------------------------------------------------------------------
//
// ミドルウェア: next() の await 忘れ (ストリーム/デコード)
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - next() の await 忘れ", () => {
  test("encodeStream で next() を await しないと MiddlewareNextNotAwaitedError を投げる", async ({
    expect,
  }) => {
    // 準備
    class SlowStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public readonly gate = new Gate();

      public constructor() {
        super("SlowStream");
      }

      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await this.gate.wait();
        await next();
      }
    }
    const storage = new FakeStreamStorage();
    const fireAndForget = new FireAndForgetStreamMiddleware("FireAndForgetStream");
    const slow = new SlowStreamMiddleware();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(fireAndForget)
      .connect(slow)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const setting = kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証
    await expect(setting).rejects.toThrow(MiddlewareNextNotAwaitedError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({ meta: { name: "FireAndForgetStream", operation: "encode" } }),
    );

    // 後片付け: 切り離した後段の完了を待ってから閉じる
    slow.gate.open();
    await fireAndForget.detached;
  });

  test("decode で next() を await しないと MiddlewareNextNotAwaitedError を投げる", async ({
    expect,
  }) => {
    // 準備: decode は逆順に実行されるため、後段を遅くするには登録順で先に置く
    class SlowMiddleware extends FakeMiddleware {
      public readonly gate = new Gate();

      public constructor() {
        super("Slow");
      }

      public override async decode(
        c: IMiddleware.DecodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await this.gate.wait();
        await next();
      }
    }
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");
    const slow = new SlowMiddleware();
    const fireAndForget = new FireAndForgetMiddleware("FireAndForget");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(slow)
      .connect(fireAndForget)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const getting = kvs.get("foo");

    // 検証
    await expect(getting).rejects.toThrow(MiddlewareNextNotAwaitedError);
    await expect(getting).rejects.toEqual(
      expect.objectContaining({ meta: { name: "FireAndForget", operation: "decode" } }),
    );

    // 後片付け: 切り離した後段の完了を待ってから閉じる
    slow.gate.open();
    await fireAndForget.detached;
  });

  test("decodeStream で next() を await しないと MiddlewareNextNotAwaitedError を投げる", async ({
    expect,
  }) => {
    // 準備: decodeStream も逆順に実行される
    class SlowStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public readonly gate = new Gate();

      public constructor() {
        super("SlowStream");
      }

      public override async decodeStream(
        c: IMiddleware.DecodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await this.gate.wait();
        await next();
      }
    }
    const storage = new FakeStreamStorage();
    storage.map.set("logs", [new Uint8Array([1])]);
    const slow = new SlowStreamMiddleware();
    const fireAndForget = new FireAndForgetStreamMiddleware("FireAndForgetStream");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(slow)
      .connect(fireAndForget)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const streaming = kvs.stream("logs");

    // 検証
    await expect(streaming).rejects.toThrow(MiddlewareNextNotAwaitedError);
    await expect(streaming).rejects.toEqual(
      expect.objectContaining({ meta: { name: "FireAndForgetStream", operation: "decode" } }),
    );

    // 後片付け: 切り離した後段の完了を待ってから閉じる
    slow.gate.open();
    await fireAndForget.detached;
  });

  test("encodeStream で next() を呼ばないと MiddlewareNextNotCalledError を投げる", async ({
    expect,
  }) => {
    // 準備
    class SilentStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public constructor() {
        super("SilentStream");
      }

      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        _next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
      }
    }
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new SilentStreamMiddleware())
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const setting = kvs.set("logs", streamOf([new Uint8Array([1])]));

    // 検証
    await expect(setting).rejects.toThrow(MiddlewareNextNotCalledError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({ meta: { name: "SilentStream", operation: "encode" } }),
    );
    expect(storage.map.has("logs")).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------------
//
// オニオン実行の順序
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - オニオン実行の順序", () => {
  test("plain set は下流ミドルウェアの encode 完了後に上流の後処理を実行する", async ({
    expect,
  }) => {
    // 準備
    const order: string[] = [];
    const a = new OnionOrderMiddleware("A", order);
    const b = new OnionOrderMiddleware("B", order);
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(a)
      .connect(b)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "value");

    // 検証
    expect(order).toStrictEqual(["A:pre", "B:pre", "B:post", "A:post"]);
    expect(storage.map.get("foo")).toBe("value");
  });

  test("plain repair は下流ミドルウェアの encode 完了後に上流の後処理を実行する", async ({
    expect,
  }) => {
    // 準備
    const order: string[] = [];
    const a = new OnionOrderMiddleware("A", order);
    const b = new OnionOrderMiddleware("B", order);
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .connect(a)
      .connect(b)
      .persist(c1)
      .persist(c2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const value = await kvs.get("foo", { repair: true });

    // 検証
    expect(value).toBe("value");
    expect(order).toStrictEqual(["A:pre", "B:pre", "B:post", "A:post"]);
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");
  });

  test("stream set は下流ミドルウェアの encodeStream 完了後に上流の後処理を実行する", async ({
    expect,
  }) => {
    // 準備
    const order: string[] = [];
    const a = new OnionOrderStreamMiddleware("A", order);
    const b = new OnionOrderStreamMiddleware("B", order);
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(a)
      .connect(b)
      .persist(c1)
      .persist(c2)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2])]));

    // 検証
    expect(order).toStrictEqual(["A:pre", "B:pre", "B:post", "A:post"]);
    expect(c1.map.get("logs")).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);
    expect(c2.map.get("logs")).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);
  });

  test("stream repair は下流ミドルウェアの encodeStream 完了後に上流の後処理を実行する", async ({
    expect,
  }) => {
    // 準備
    const order: string[] = [];
    const a = new OnionOrderStreamMiddleware("A", order);
    const b = new OnionOrderStreamMiddleware("B", order);
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .connect(a)
      .connect(b)
      .persist(c1)
      .persist(c2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1]), new Uint8Array([2])]);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    const chunks = await collect(vs);

    // 検証
    expect(chunks).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);
    expect(order).toStrictEqual(["A:pre", "B:pre", "B:post", "A:post"]);
    expect(c1.map.get("logs")).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);
    expect(c2.map.get("logs")).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);

    // 後片付け
    await vs.dispose();
  });
});

// -------------------------------------------------------------------------------------------------
//
// ストリームの境界と部分失敗
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - ストリームの境界と部分失敗", () => {
  test("巨大チャンクと空チャンクが tee 分岐を経てもバイト列が一致する", async ({ expect }) => {
    // 準備
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(c1)
      .persist(c2)
      .create();
    await kvs.open();
    const big = Uint8Array.from({ length: 256 * 1024 }, (_, i) => i % 251);
    const chunks = [
      new Uint8Array(0),
      big.subarray(0, 100_000),
      new Uint8Array(0),
      big.subarray(100_000),
    ];

    // 実行
    await kvs.set("logs", streamOf(chunks));
    const vs = await kvs.stream("logs");
    const read = await collect(vs);

    // 検証
    expect(read).toStrictEqual(chunks);
    expect(c1.map.get("logs")).toStrictEqual(chunks);
    expect(c2.map.get("logs")).toStrictEqual(chunks);

    // 後片付け
    await vs.dispose();
  });

  test("片方のストレージが書き込み途中で失敗しても成功側には全チャンクが保存される", async ({
    expect,
  }) => {
    // 準備
    const healthy = new FakeStreamStorage("healthy");
    const failing = new MidWriteFailStreamStorage("failing", 2);
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(healthy)
      .persist(failing)
      .create();
    await kvs.open();
    const chunks = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];

    // 実行
    const error = await kvs.set("logs", streamOf(chunks)).then(
      () => null,
      (ex: unknown) => ex,
    );

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const aggregate = error as PluginOperationAggregateError;
    expect(aggregate.meta.action).toBe("write");
    expect(aggregate.meta.errors).toHaveLength(1);
    expect(aggregate.meta.errors[0]?.name).toBe("failing");
    expect(healthy.map.get("logs")).toStrictEqual(chunks);
    expect(failing.stored.has("logs")).toBe(false);
  });

  test("stream repair で書き戻し先の書き込みが途中で失敗しても読み取りは成功する", async ({
    expect,
  }) => {
    // 準備
    const ar = new AllowRepair();
    const cache = new MidWriteFailStreamStorage("cache", 2);
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(ar)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    const chunks = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    server.map.set("logs", chunks);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    const read = await collect(vs);

    // 検証: 読み取りは元データのまま成功し、失敗した書き戻し先は更新されない
    expect(read).toStrictEqual(chunks);
    expect(cache.stored.has("logs")).toBe(false);

    // 後片付け
    await vs.dispose();
  });
});

// -------------------------------------------------------------------------------------------------
//
// 後段開始後のミドルウェア失敗
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - 後段開始後のミドルウェア失敗", () => {
  test("encode が next() 後に失敗すると set は失敗し、どのストレージにも書かれない", async ({
    expect,
  }) => {
    // 準備
    const failing = new ThrowAfterNextMiddleware("PostFail", new Error("post-verify failed"));
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(failing)
      .persist(c1)
      .persist(c2)
      .create();
    await kvs.open();

    // 実行
    const setting = kvs.set("foo", "value");

    // 検証
    await expect(setting).rejects.toThrow(Error);
    await expect(setting).rejects.toMatchObject({ message: "post-verify failed" });
    expect(c1.map.has("foo")).toBe(false);
    expect(c2.map.has("foo")).toBe(false);
  });

  test("encodeStream が next() 後に失敗すると set は失敗し、どのストレージにも書かれない", async ({
    expect,
  }) => {
    // 準備
    class ThrowAfterNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        throw new Error("post-verify stream failed");
      }
    }
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new ThrowAfterNextStreamMiddleware("PostFailStream"))
      .persist(c1)
      .persist(c2)
      .create();
    await kvs.open();

    // 実行
    const error = await kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2])])).then(
      () => null,
      (ex: unknown) => ex,
    );

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("post-verify stream failed");
    expect(c1.map.has("logs")).toBe(false);
    expect(c2.map.has("logs")).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------------
//
// 構築失敗時のソース解放
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - 構築失敗時のソース解放", () => {
  test("構築中に abort したときソースストリームが解放される", async ({ expect }) => {
    // 準備: encodeStream が source を pipeThrough でラップして next() を呼ぶ直前に中断する。
    // 同じ解放漏れは next() 内の mapKey 例外でも発生する (どちらも sources への登録前の失敗)。
    class AbortThenNextMiddleware extends FakeStreamMiddleware<Uint8Array> {
      readonly #ac: AbortController;

      public constructor(ac: AbortController) {
        super("AbortThenNext");
        this.#ac = ac;
      }

      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source.pipeThrough(new TransformStream());
        this.#ac.abort(new Error("aborted mid-build"));
        await next();
      }
    }
    const storage = new FakeStreamStorage();
    const ac = new AbortController();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AbortThenNextMiddleware(ac))
      .persist(storage)
      .create();
    await kvs.open();
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });

    // 実行
    const setting = kvs.set("logs", source, { signal: ac.signal });

    // 検証: 中断理由で失敗し、ソースは解放される
    await expect(setting).rejects.toMatchObject({ message: "aborted mid-build" });
    expect(cancelled).toBe(true);
    expect(source.locked).toBe(false);
  });

  test("mapKey の拒否で分岐をスキップしても構築済みの出力は解放される", async ({ expect }) => {
    // 準備: 1 回目 (読み取り解決) は成功し、2 回目 (repair 構築) だけ拒否を投げる
    class DenyMapKeyMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public source: IReadableStream | undefined;
      public mapKeyCalls = 0;

      public constructor() {
        super("DenyMapKey");
      }

      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        // pipeThrough で親入力をラップしてから next() へ進み、mapKey の拒否で出力が残る経路を作ります。
        this.source = c.source;
        c.destination = c.source.pipeThrough(new TransformStream());
        await next();
      }

      public override mapKey(c: IMiddleware.MapKeyContext): string {
        this.mapKeyCalls += 1;
        if (this.mapKeyCalls > 1) {
          throw new RepairNotAllowedError({ names: [this.name] });
        }

        return c.key;
      }
    }
    const middleware = new DenyMapKeyMiddleware();
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .connect(middleware)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1]), new Uint8Array([2])]);

    // 実行: 拒否された書き戻し分岐はスキップされ、ストリーム自体は取得できる
    const vs = await withTimeout(kvs.stream("logs", { repair: true }), 1500, "stream");
    const reader = vs.getReader();
    const first = await withTimeout(reader.read(), 1500, "read");
    expect(first.done).toBe(false);

    // 実行: 読み切る前に破棄する
    await withTimeout(vs.dispose(), 1500, "dispose");

    // 検証: スキップされた分岐がラップしていた親入力は解放されている
    await vi.waitFor(() => {
      expect(middleware.source?.locked).toBe(false);
    });
    expect(cache.map.has("logs")).toBe(false);
  });

  test("mapKey が最初の tee 構築後に失敗してもソースストリームが解放される", async ({ expect }) => {
    // 準備: 2 本の枝に分かれた後、深い側の mapKey が失敗する
    class ThrowMapKeyDeepMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public constructor() {
        super("ThrowMapKeyDeep");
      }

      public override mapKey(): string {
        throw new Error("deep mapKey boom");
      }
    }
    const shallow = new FakeStreamStorage("shallow");
    const deep = new FakeStreamStorage("deep");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(shallow)
      .connect(new ThrowMapKeyDeepMiddleware())
      .persist(deep)
      .create();
    await kvs.open();
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });

    // 実行
    const setting = kvs.set("logs", source);

    // 検証
    await expect(setting).rejects.toMatchObject({ message: "deep mapKey boom" });
    expect(cancelled).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------------
//
// 存在確認の失敗と部分操作
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - 存在確認の失敗と部分操作", () => {
  test("has は存在しないと確認できたストレージと exists が失敗したストレージが混在すると KeyNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備
    const broken = new FakeStorage("broken");
    broken.errors["exists"] = new Error("exists failed");
    const empty = new FakeStorage("empty");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(broken)
      .persist(empty)
      .create();
    await kvs.open();

    // 実行
    const checking = kvs.has("foo");

    // 検証: 結果が不明なため false ではなくエラーとして報告される
    await expect(checking).rejects.toThrow(Error);
    await expect(checking).rejects.toMatchObject({ name: "UniKvsKeyNotFoundError" });
  });

  test("delete は exists が失敗したストレージを集約エラーにし、成功したストレージからは削除する", async ({
    expect,
  }) => {
    // 準備
    const broken = new FakeStorage("broken");
    broken.errors["exists"] = new Error("exists failed");
    const healthy = new FakeStorage("healthy");
    healthy.map.set("foo", "value");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(broken)
      .persist(healthy)
      .create();
    await kvs.open();

    // 実行
    const deleting = kvs.delete("foo");

    // 検証
    await expect(deleting).rejects.toThrow(PluginOperationAggregateError);
    await expect(deleting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          action: "delete",
          errors: [expect.objectContaining({ name: "broken" })],
        }),
      }),
    );
    expect(healthy.map.has("foo")).toBe(false);
  });

  test("get は exists が失敗したストレージを記録し、後段にも値がなければ KeyNotFoundError の cause に残す", async ({
    expect,
  }) => {
    // 準備
    const broken = new FakeStorage("broken");
    broken.errors["exists"] = new Error("exists failed");
    const empty = new FakeStorage("empty");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(broken)
      .persist(empty)
      .create();
    await kvs.open();

    // 実行
    const getting = kvs.get("foo");

    // 検証
    await expect(getting).rejects.toThrow(Error);
    await expect(getting).rejects.toMatchObject({
      name: "UniKvsKeyNotFoundError",
      cause: { message: "exists failed" },
    });
    await expect(getting).rejects.toEqual(expect.objectContaining({ cause: expect.any(Error) }));
  });
});

// -------------------------------------------------------------------------------------------------
//
// repair の冪等性
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - repair の冪等性", () => {
  test("2 回目の repair は書き戻さず、復旧後の読み書きが一貫する", async ({ expect }) => {
    // 準備
    const ar = new AllowRepair();
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(ar)
      .persist(c1)
      .persist(c2)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行: 1 回目は両方に書き戻す
    const first = await kvs.get("foo", { repair: true });

    // 検証
    expect(first).toBe("value");
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");
    const writesAfterFirst = c1.callsOf("write").length + c2.callsOf("write").length;

    // 実行: 2 回目は先頭でヒットするため書き戻し不要
    const second = await kvs.get("foo", { repair: true });

    // 検証
    expect(second).toBe("value");
    expect(c1.callsOf("write").length + c2.callsOf("write").length).toBe(writesAfterFirst);
    expect(server.callsOf("read")).toHaveLength(1);
    await expect(kvs.has("foo")).resolves.toBe(true);

    // 実行: 復旧後の削除と再書き込みも通常どおり動作する
    await kvs.delete("foo");
    await kvs.set("foo", "next");
    await expect(kvs.get("foo")).resolves.toBe("next");
  });
});

// -------------------------------------------------------------------------------------------------
//
// repair 中のミドルウェア失敗
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - repair 中のミドルウェア失敗", () => {
  test("encode が next() 後に失敗しても repair 付き読み取りは成功し、エラーは記録される", async ({
    expect,
  }) => {
    // 準備: 既存テスト「prefix の非ゲート失敗は読取成功し全書戻しを skip する」と同じ契約を next 後の失敗にも適用する
    using errorSpy = vi.spyOn(logger, "error");
    const repairFailure = new Error("repair post-next failed");
    const failing = new ThrowAfterNextMiddleware("PostFail", repairFailure);
    const c1 = new FakeStorage("c1");
    const server = new FakeStorage("server");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .connect(failing)
      .persist(c1)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const value = await kvs.get("foo", { repair: true });

    // 検証: 書き戻しの失敗は読み取りを壊さず、失敗として記録される
    expect(value).toBe("value");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(["Failed to repair a storage: ", ""], repairFailure);
  });
});

// -------------------------------------------------------------------------------------------------
//
// repair の共有ストア (オニオン実行)
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - repair の共有ストア", () => {
  test("repair でも上流は await next() の後に下流が設定した変数を読める", async ({ expect }) => {
    // 準備
    class VarWriterMiddleware extends FakeMiddleware {
      public constructor() {
        super("VarWriter");
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.set("marker", "from-writer");
        c.destination = c.source;
        await next();
      }
    }
    class VarReaderMiddleware extends FakeMiddleware {
      public seen: unknown;

      public constructor() {
        super("VarReader");
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        this.seen = c.get("marker");
      }
    }
    const reader = new VarReaderMiddleware();
    const writer = new VarWriterMiddleware();
    const c1 = new FakeStorage("c1");
    const server = new FakeStorage("server");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .connect(reader)
      .connect(writer)
      .persist(c1)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const value = await kvs.get("foo", { repair: true });

    // 検証
    expect(value).toBe("value");
    expect(reader.seen).toBe("from-writer");
  });
});

// -------------------------------------------------------------------------------------------------
//
// 統合: Compression + Checksum + repair
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - Compression + Checksum + repair 統合", () => {
  test("大きなバイナリのストリーム repair で圧縮・検証付きの往復が壊れない", async ({ expect }) => {
    // 準備: cache を後段 (server) より先に登録し、server にだけデータを置く
    const cache = new FakeStreamStorage("cache");
    const server = new Memory();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array<ArrayBuffer>> }>()
      .connect(new AllowRepair())
      .connect(new ChecksumSha256())
      .connect(new Compression("gzip"))
      .persist(cache as unknown as IStorage)
      .persist(server)
      .create();
    await kvs.open();
    const data = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 31 + (i >> 8)) % 256);
    const sum = await sha256Hex(data);
    const vars = { "@unikvs/checksum:sha256": sum };

    // 実行: server にのみ保存される
    await kvs.set("logs", streamOf([data.subarray(0, 50_000), data.subarray(50_000)]), { vars });
    cache.map.delete("logs");

    // 実行: server から読んで cache へ書き戻す
    const vs = await kvs.stream("logs", { repair: true, vars });
    const read = await collectBytes(vs);

    // 検証: 生データが一致し、cache には圧縮後のチャンクが入る
    expect([...read]).toStrictEqual([...data]);
    const cached = cache.map.get("logs") as Uint8Array[] | undefined;
    expect(cached).toBeDefined();
    expect(cached!.length).toBeGreaterThan(0);
    expect(isGzip(cached![0]!)).toBe(true);

    // 実行: 2 回目は cache から読める (repair 不要)
    const vs2 = await kvs.stream("logs", { vars });
    const read2 = await collectBytes(vs2);

    // 検証
    expect([...read2]).toStrictEqual([...data]);

    // 後片付け
    await vs2.dispose();
    await vs.dispose();
  });
});

// -------------------------------------------------------------------------------------------------
//
// ストリーム読み取り中の書き込み操作
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - ストリーム読み取り中の書き込み操作", () => {
  test("スキーマ検証で読み取りが失敗してもキーロックは解放され、同じキーへ書き込める", async ({
    expect,
  }) => {
    // 準備: 空チャンクを拒否するスキーマで、読み取り時に検証エラーを起こす
    const storage = new Memory();
    await using kvs = UniKvs.config({
      schema: {
        logs: StreamValue(
          v.pipe(
            v.instance(Uint8Array),
            v.check((b) => b.byteLength > 0),
          ),
        ),
      },
    })
      .persist(storage)
      .create();
    await kvs.open();
    mapOf(storage).set("logs", new Uint8Array());

    // 実行
    const vs = await kvs.stream("logs");
    const collecting = collect(vs);

    // 検証: 検証エラーになる
    await expect(collecting).rejects.toThrow(Error);

    // 実行: ロックが残っていればここでタイムアウトする
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([1])])), 1500, "set-after-schema-error"),
    ).resolves.toBeUndefined();
  });

  test("ライブストリーム中の delete は dispose まで待たされ、その後すべてのストレージから消える", async ({
    expect,
  }) => {
    // 準備
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(c1)
      .persist(c2)
      .create();
    await kvs.open();
    await kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2])]));

    // 実行: 読み取り中はキーロックが保持されるため delete は完了しない
    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    await reader.read();
    const pending = kvs.delete("logs");
    await expect(isPending(pending)).resolves.toBe(true);

    // 実行: 破棄すると delete が完了する
    await vs.dispose();
    await expect(pending).resolves.toBeUndefined();

    // 検証
    expect(c1.map.has("logs")).toBe(false);
    expect(c2.map.has("logs")).toBe(false);
    await expect(kvs.has("logs")).resolves.toBe(false);
  });

  test("書き込みバックプレッシャー中の abort は集約エラーになり、データを保存しない", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStreamStorage();
    const writeGate = new Gate();
    storage.writeGate = writeGate;
    const entered = Promise.withResolvers<void>();
    storage.onWriteStart = () => entered.resolve();
    const reason = new Error("aborted while writing");
    const ac = new AbortController();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();

    // 実行
    const pending = kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2])]), {
      signal: ac.signal,
    });
    await withTimeout(entered.promise, 1500, "write-started");
    ac.abort(reason);
    writeGate.open();

    // 検証
    await expect(pending).rejects.toThrow(PluginOperationAggregateError);
    await expect(pending).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({ errors: [expect.objectContaining({ reason })] }),
      }),
    );
    expect(storage.map.has("logs")).toBe(false);
  });

  test("破損した圧縮データの読み取りは途中で失敗し、同じキーを上書きできる", async ({ expect }) => {
    // 準備: gzip のマジックナンバーで始まる不正データを直接保存する
    const storage = new Memory();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new Compression("gzip"))
      .persist(storage)
      .create();
    await kvs.open();
    mapOf(storage).set("logs", Uint8Array.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff, 0xff, 0xff]));

    // 実行
    const vs = await kvs.stream("logs");
    const collecting = collect(vs);

    // 検証: 読み取りは失敗する
    await expect(collecting).rejects.toThrow(Error);

    // 実行: ロックが残っていればここでタイムアウトする
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([1])])), 1500, "set-after-corrupt"),
    ).resolves.toBeUndefined();
  });

  test("3 分岐の tee 経由でも全ストレージに同じチャンク列が届く", async ({ expect }) => {
    // 準備: 葉 2 つと、子節を挟んだ葉 1 つの計 3 分岐
    const c1 = new FakeStreamStorage("c1");
    const c2 = new FakeStreamStorage("c2");
    const c3 = new FakeStreamStorage("c3");
    const branch = new FakeStreamMiddleware<Uint8Array>("branch");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(c1)
      .connect(branch)
      .persist(c2)
      .persist(c3)
      .create();
    await kvs.open();
    const chunks = [
      new Uint8Array(0),
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
      new Uint8Array(0),
    ];

    // 実行
    await kvs.set("logs", streamOf(chunks));

    // 検証
    expect(c1.map.get("logs")).toStrictEqual(chunks);
    expect(c2.map.get("logs")).toStrictEqual(chunks);
    expect(c3.map.get("logs")).toStrictEqual(chunks);
  });
});
