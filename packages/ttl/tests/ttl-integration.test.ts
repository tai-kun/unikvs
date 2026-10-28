import type { IStorage, IMiddleware } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import { readAll, createDeleteContext } from "@unikvs/testing";
import type { UniKvs } from "unikvs";
import { Builder } from "unikvs";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError, TtlInvalidValueError } from "../src/errors.js";
import Ttl, { type TtlOptions } from "../src/ttl.js";

/**
 * テスト側から任意のタイミングで解放できるゲートです。
 */
class Gate {
  readonly #promise: Promise<void>;

  #resolve: (() => void) | undefined;

  public constructor() {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#promise = promise;
    this.#resolve = resolve;
  }

  public open(): void {
    this.#resolve?.();
    this.#resolve = undefined;
  }

  public wait(): Promise<void> {
    return this.#promise;
  }
}

/**
 * 指定した操作の `use` をゲートで保留するミドルウェアです。
 * `Ttl` の `use` が期限を保存した後、キーロックを取得する前に操作を止めます。
 */
class UseGateMiddleware implements IMiddleware {
  public readonly name = "UseGateMiddleware";

  public readonly isOpen = true;

  public readonly entered = new Gate();

  public readonly release = new Gate();

  readonly #action: IMiddleware.UseContext["action"];

  public constructor(action: IMiddleware.UseContext["action"]) {
    this.#action = action;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    // oxlint-disable-next-line vitest/no-conditional-in-test -- 対象の操作だけを保留するための分岐です。
    if (c.action === this.#action) {
      this.entered.open();
      await this.release.wait();
    }

    await next();
  }

  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = c.source;
    await next();
  }

  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = c.source;
    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    await next();
  }
}

/**
 * 固定時刻で動作する Ttl 付きクライアントを作成します。
 * 時刻は返却される `clock` で進められます。
 */
async function createTtlKvs(
  options?: TtlOptions,
  storage: Memory | readonly Memory[] = new Memory(),
  middlewares: readonly IMiddleware[] = [],
): Promise<{
  kvs: UniKvs;
  clock: {
    readonly now: number;
    advance: (ms: number) => void;
  };
  storage: Memory;
  storages: readonly Memory[];
}> {
  let now = 1_000_000;
  const clock: {
    readonly now: number;
    advance: (ms: number) => void;
  } = {
    get now(): number {
      return now;
    },
    advance(ms: number): void {
      now += ms;
    },
  };
  const ttl = new Ttl({
    ...options,
    now: (): number => now,
  });
  const storages: readonly Memory[] = Array.isArray(storage) ? storage : [storage];
  const [primary, ...rest] = storages;

  if (primary === undefined) {
    throw new Error("ストレージが必要です。");
  }

  const builder = new Builder();
  builder.use(ttl);

  for (const middleware of middlewares) {
    builder.use(middleware);
  }

  builder.persist(primary);

  for (const extra of rest) {
    builder.persist(extra);
  }

  const kvs = builder.build();
  await kvs.open();

  return {
    kvs,
    clock,
    storage: primary,
    storages,
  };
}

/**
 * バイト列チャンクを流すストリームを作成します。
 * Memory ストレージは Uint8Array チャンクのみを受け付けるためです。
 */
function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}

/**
 * 書き込み・削除・全削除を任意に失敗させられる Memory ストレージです。
 */
class FlakyMemory extends Memory {
  public failWrite = false;

  public failDelete = false;

  public failClear = false;

  public override write(c: IStorage.WriteContext, data: unknown): void {
    // oxlint-disable-next-line vitest/no-conditional-in-test -- 失敗を注入するための分岐です。
    if (this.failWrite) {
      throw new Error("write failed");
    }

    super.write(c, data);
  }

  public override delete(c: IStorage.DeleteContext): void {
    // oxlint-disable-next-line vitest/no-conditional-in-test -- 失敗を注入するための分岐です。
    if (this.failDelete) {
      throw new Error("delete failed");
    }

    super.delete(c);
  }

  public override clear(c: IStorage.ClearContext): void {
    // oxlint-disable-next-line vitest/no-conditional-in-test -- 失敗を注入するための分岐です。
    if (this.failClear) {
      throw new Error("clear failed");
    }

    super.clear(c);
  }
}

describe("透過と有効期限", () => {
  test("TTL 指定なしでは書き込みと読み出しが透過する", async ({ expect }) => {
    const { kvs } = await createTtlKvs();
    await kvs.set("report", "hello");
    expect(await kvs.get("report")).toBe("hello");
    expect(await kvs.has("report")).toBe(true);
    await kvs.close();
  });

  test("defaultTtl の有効期限内では読み取れる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    clock.advance(59_999);
    expect(await kvs.get("report")).toBe("hello");
    expect(await kvs.has("report")).toBe(true);
    await kvs.close();
  });

  test("期限切れの get は KeyNotFoundError を投げる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    clock.advance(60_000);

    const error = await kvs.get("report").catch((ex: unknown) => ex);
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      meta: { key: "report" },
      name: "UniKvsKeyNotFoundError",
    });

    await kvs.close();
  });

  test("期限切れの has は false を返す", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    expect(await kvs.has("report")).toBe(true);
    clock.advance(60_000);
    expect(await kvs.has("report")).toBe(false);
    await kvs.close();
  });

  test("書き込みごとの ttl 変数で上書きできる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("short", "a", { vars: { ttl: 10 } });
    await kvs.set("long", "b", { vars: { "@unikvs/ttl:ttl": 120 } });
    clock.advance(11_000);
    expect(await kvs.has("short")).toBe(false);
    expect(await kvs.get("long")).toBe("b");
    await kvs.close();
  });

  test("書き込みごとの expiresAt 変数で絶対時刻を指定できる", async ({ expect }) => {
    // defaultTtl より書き込みごとの絶対時刻が優先されることも兼ねて確認します。
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello", { vars: { expiresAt: clock.now + 5000 } });
    clock.advance(4999);
    expect(await kvs.get("report")).toBe("hello");
    clock.advance(1);
    expect(await kvs.has("report")).toBe(false);
    await kvs.close();
  });

  test("過去の失効時刻では即座に期限切れになる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs();
    await kvs.set("report", "hello", { vars: { expiresAt: clock.now - 1 } });
    expect(await kvs.has("report")).toBe(false);
    await expect(kvs.get("report")).rejects.toThrow(KeyNotFoundError);
    await kvs.close();
  });

  test("TTL なしの上書きで期限が消える", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs();
    await kvs.set("report", "hello", { vars: { ttl: 10 } });
    await kvs.set("report", "renewed");
    clock.advance(120_000);
    expect(await kvs.get("report")).toBe("renewed");
    await kvs.close();
  });

  test("不正な TTL 値では set が TtlInvalidValueError で失敗する", async ({ expect }) => {
    const { kvs } = await createTtlKvs();
    await expect(kvs.set("report", "hello", { vars: { ttl: "60" } })).rejects.toThrow(
      TtlInvalidValueError,
    );
    // 失敗した書き込みは残らない。
    expect(await kvs.has("report")).toBe(false);
    await kvs.close();
  });

  test("期限切れの delete は透過して後片付けできる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    clock.advance(60_000);
    await kvs.delete("report");
    expect(await kvs.has("report")).toBe(false);
    await kvs.close();
  });

  test("期限切れでも clear は透過する", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    clock.advance(60_000);
    await kvs.clear();
    expect(await kvs.has("report")).toBe(false);
    await kvs.close();
  });

  test("copy はコピー元の有効期限を引き継ぐ", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    await kvs.copy("report", "archived");
    clock.advance(59_999);
    expect(await kvs.get("archived")).toBe("hello");
    clock.advance(1);
    await expect(kvs.get("archived")).rejects.toThrow(KeyNotFoundError);
    await kvs.close();
  });

  test("move は移動元の有効期限を引き継ぐ", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    await kvs.move("report", "archived");
    clock.advance(59_999);
    expect(await kvs.get("archived")).toBe("hello");
    clock.advance(1);
    await expect(kvs.get("archived")).rejects.toThrow(KeyNotFoundError);
    await kvs.close();
  });

  test("期限切れの copy は KeyNotFoundError で失敗する", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    clock.advance(60_000);
    await expect(kvs.copy("report", "archived")).rejects.toThrow(KeyNotFoundError);
    await kvs.close();
  });

  test("期限切れの move は KeyNotFoundError で失敗する", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("report", "hello");
    clock.advance(60_000);
    await expect(kvs.move("report", "archived")).rejects.toThrow(KeyNotFoundError);
    await kvs.close();
  });
});

describe("メタデータのトランザクション", () => {
  test("期限なしのコピー元からコピーするとコピー先の古い期限が消える", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs();
    await kvs.set("archived", "old", { vars: { ttl: 5 } });
    await kvs.set("report", "hello");
    await kvs.copy("report", "archived");
    clock.advance(10_000);
    expect(await kvs.get("archived")).toBe("hello");
    await kvs.close();
  });

  test("期限なしのコピー元でコピー先の古い期限を消し、has が古い期限で false にならない", async ({
    expect,
  }) => {
    const { kvs, clock } = await createTtlKvs();
    await kvs.set("archived", "old", { vars: { ttl: 5 } });
    await kvs.set("report", "hello");
    await kvs.copy("report", "archived");
    clock.advance(10_000);
    expect(await kvs.has("archived")).toBe(true);
    await kvs.close();
  });

  test("期限なしの移動元で移動先の古い期限を消し、has が古い期限で false にならない", async ({
    expect,
  }) => {
    const { kvs, clock } = await createTtlKvs();
    await kvs.set("archived", "old", { vars: { ttl: 5 } });
    await kvs.set("report", "hello");
    await kvs.move("report", "archived");
    clock.advance(10_000);
    expect(await kvs.has("archived")).toBe(true);
    expect(await kvs.get("archived")).toBe("hello");
    await kvs.close();
  });

  test("move の成功後は移動元の古い期限を残さない", async ({ expect }) => {
    const { kvs, clock, storage } = await createTtlKvs();
    await kvs.set("report", "hello", { vars: { ttl: 5 } });
    await kvs.move("report", "archived");

    // 別のクライアントで移動元のキーを TTL なしで作り直します。
    const plain = new Builder().persist(storage).build();
    await plain.open();
    await plain.set("report", "fresh");

    clock.advance(10_000);

    expect(await kvs.get("report")).toBe("fresh");

    await plain.close();
    await kvs.close();
  });

  test("set の失敗では以前の値と期限を変更しない", async ({ expect }) => {
    const storage = new FlakyMemory();
    const { kvs, clock } = await createTtlKvs(undefined, storage);
    await kvs.set("report", "old");
    storage.failWrite = true;
    await expect(kvs.set("report", "new", { vars: { ttl: 5 } })).rejects.toThrow(
      "fail write operation",
    );
    storage.failWrite = false;
    clock.advance(10_000);
    expect(await kvs.get("report")).toBe("old");
    await kvs.close();
  });

  test("copy の失敗ではコピー先の期限を変更しない", async ({ expect }) => {
    const storage = new FlakyMemory();
    const { kvs, clock } = await createTtlKvs(undefined, storage);
    await kvs.set("destination", "old");
    await kvs.set("source", "new", { vars: { ttl: 5 } });
    storage.failWrite = true;
    await expect(kvs.copy("source", "destination")).rejects.toThrow("fail copy operation");
    storage.failWrite = false;
    clock.advance(10_000);
    expect(await kvs.get("destination")).toBe("old");
    expect(await kvs.has("source")).toBe(false);
    await kvs.close();
  });

  test("move の失敗では移動元の期限を残し、移動先の期限を変更しない", async ({ expect }) => {
    const storage = new FlakyMemory();
    const { kvs, clock } = await createTtlKvs(undefined, storage);
    await kvs.set("destination", "old");
    await kvs.set("source", "new", { vars: { ttl: 5 } });
    storage.failWrite = true;
    await expect(kvs.move("source", "destination")).rejects.toThrow("fail move operation");
    storage.failWrite = false;
    clock.advance(10_000);
    expect(await kvs.has("source")).toBe(false);
    expect(await kvs.get("destination")).toBe("old");
    await kvs.close();
  });

  test("copy は use 後の並行 set で更新されたコピー元の期限を引き継ぐ", async ({ expect }) => {
    for (const action of ["copy", "move"] as const) {
      const gate = new UseGateMiddleware(action);
      const { kvs, clock } = await createTtlKvs(undefined, new Memory(), [gate]);
      await kvs.set("source", streamOf([new Uint8Array([1])]), { vars: { ttl: 5 } });

      const transferring = kvs[action]("source", "destination");

      try {
        // Ttl の use が古い期限を保存した後、キーロック取得前に止まっています。
        await gate.entered.wait();

        // 転送開始前に同じキーを新しい期限で上書きします。
        await kvs.set("source", streamOf([new Uint8Array([2])]), { vars: { ttl: 120 } });
        gate.release.open();
        await transferring;
      } finally {
        gate.release.open();
        await transferring.catch(() => {});
      }

      clock.advance(10_000);

      // 古い 5 秒ではなく、use 後に確定した 120 秒の期限を引き継ぎます。
      expect(await kvs.has("destination")).toBe(true);
      await kvs.close();
    }
  });

  test("複数ストレージでコピー元・移動元が欠けても期限切れのコピー先・移動先を復活させない", async ({
    expect,
  }) => {
    for (const action of ["copy", "move"] as const) {
      const first = new Memory();
      const second = new Memory();
      const { kvs, clock } = await createTtlKvs(undefined, [first, second]);
      await kvs.set("destination", streamOf([new Uint8Array([9])]), { vars: { ttl: 5 } });
      await kvs.set("source", streamOf([new Uint8Array([1])]), { vars: { ttl: 60 } });

      // コピー元・移動元を後段のストレージにだけ残します。
      first.delete(createDeleteContext("source"));
      clock.advance(5000);
      expect(await kvs.has("destination")).toBe(false);
      await kvs[action]("source", "destination");

      // 触れていない first の古い期限を復活させず、期限切れのままです。
      expect(await kvs.has("destination")).toBe(false);
      await expect(kvs.stream("destination")).rejects.toThrow(KeyNotFoundError);
      await kvs.close();
    }
  });

  test("期限切れのコピー元・移動元はストリームの失効記録を残す", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs();
    await kvs.set("logs", streamOf([new Uint8Array([1])]), { vars: { ttl: 5 } });
    clock.advance(5000);

    for (const action of ["copy", "move"] as const) {
      await expect(kvs[action]("logs", "archived")).rejects.toThrow(KeyNotFoundError);
      // 記録が残っているため、失敗したコピー・移動の後でも失効したままです。
      await expect(kvs.stream("logs")).rejects.toThrow(KeyNotFoundError);
    }

    await kvs.delete("logs");
    expect(await kvs.has("logs")).toBe(false);
    await kvs.close();
  });

  test("delete の失敗ではストリームの失効記録を残す", async ({ expect }) => {
    const storage = new FlakyMemory();
    const { kvs, clock } = await createTtlKvs(undefined, storage);
    await kvs.set("logs", streamOf([new Uint8Array([1])]), { vars: { ttl: 5 } });
    storage.failDelete = true;
    await expect(kvs.delete("logs")).rejects.toThrow("fail delete operation");
    storage.failDelete = false;
    clock.advance(5000);
    await expect(kvs.stream("logs")).rejects.toThrow(KeyNotFoundError);
    await kvs.close();
  });

  test("clear の失敗ではストリームの失効記録を残す", async ({ expect }) => {
    const storage = new FlakyMemory();
    const { kvs, clock } = await createTtlKvs(undefined, storage);
    await kvs.set("logs", streamOf([new Uint8Array([1])]), { vars: { ttl: 5 } });
    storage.failClear = true;
    await expect(kvs.clear()).rejects.toThrow("fail clear operation");
    storage.failClear = false;
    clock.advance(5000);
    await expect(kvs.stream("logs")).rejects.toThrow(KeyNotFoundError);
    await kvs.close();
  });
});

describe("ストリームの有効期限", () => {
  test("有効期限内ではチャンク列が保たれる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
    await kvs.set("logs", streamOf(chunks));
    clock.advance(1000);

    const stream = await kvs.stream("logs");

    // Memory ストレージは書き込み時にチャンクを結合するため、1 チャンクになる。
    expect(await readAll(stream as unknown as ReadableStream<Uint8Array>)).toStrictEqual([
      new Uint8Array([1, 2, 3]),
    ]);

    await kvs.close();
  });

  test("期限切れの stream は KeyNotFoundError を投げる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    await kvs.set("logs", streamOf([new Uint8Array([1])]));
    clock.advance(60_000);
    await expect(kvs.stream("logs")).rejects.toThrow(KeyNotFoundError);
    await kvs.close();
  });
});

describe("再起動後の振る舞い", () => {
  test("エンベロープはストレージに残り、別インスタンスでも期限切れになる", async ({ expect }) => {
    let now = 1_000_000;
    const storage = new Memory();
    const first = new Builder()
      .use(
        new Ttl({
          now: (): number => now,
          defaultTtl: 60,
        }),
      )
      .persist(storage)
      .build();
    await first.open();
    await first.set("report", "hello");
    await first.close();
    now += 61_000;

    const second = new Builder()
      .use(new Ttl({ now: (): number => now }))
      .persist(storage)
      .build();
    await second.open();

    // エンベロープだけで失効を判定できるのはプレーン値の get です。
    // has と stream は操作中の記録に依存するため、再起動後は失効を検出できません (既知の制約)。
    await expect(second.get("report")).rejects.toThrow(KeyNotFoundError);
    await second.close();
  });
});
