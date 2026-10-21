import { Memory } from "@unikvs/memory";
import { readAll } from "@unikvs/testing";
import { UniKvs } from "unikvs";
import { describe, test } from "vitest";

import { KeyNotFoundError, TtlInvalidValueError } from "../src/errors.js";
import Ttl, { type TtlOptions } from "../src/ttl.js";

/**
 * 固定時刻で動作する Ttl 付きクライアントを作成します。
 * 時刻は返却される `clock` で進められます。
 */
async function createTtlKvs(options?: TtlOptions) {
  let now = 1_000_000;
  const clock = {
    get now() {
      return now;
    },
    advance(ms: number) {
      now += ms;
    },
  };
  const ttl = new Ttl({ ...options, now: () => now });
  const storage = new Memory();
  const kvs = UniKvs.config().use(ttl).persist(storage).create();
  await kvs.open();

  return { kvs, clock };
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
      name: "UniKvsKeyNotFoundError",
      meta: { key: "report" },
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
    await kvs.set("report", "hello", { vars: { expiresAt: clock.now + 5_000 } });
    clock.advance(4_999);

    expect(await kvs.get("report")).toBe("hello");

    clock.advance(1);

    expect(await kvs.has("report")).toBe(false);

    await kvs.close();
  });

  test("過去の失効時刻では即座に期限切れになる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs();
    await kvs.set("report", "hello", { vars: { expiresAt: clock.now - 1 } });

    expect(await kvs.has("report")).toBe(false);
    await expect(kvs.get("report")).rejects.toThrowError(KeyNotFoundError);

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

    await expect(kvs.set("report", "hello", { vars: { ttl: "60" } })).rejects.toThrowError(
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
});

describe("ストリームの有効期限", () => {
  test("有効期限内ではチャンク列が保たれる", async ({ expect }) => {
    const { kvs, clock } = await createTtlKvs({ defaultTtl: 60 });
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
    await kvs.set("logs", streamOf(chunks));
    clock.advance(1_000);

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

    await expect(kvs.stream("logs")).rejects.toThrowError(KeyNotFoundError);

    await kvs.close();
  });
});

describe("再起動後の振る舞い", () => {
  test("エンベロープはストレージに残り、別インスタンスでも期限切れになる", async ({ expect }) => {
    let now = 1_000_000;
    const storage = new Memory();
    const first = UniKvs.config()
      .use(new Ttl({ now: () => now, defaultTtl: 60 }))
      .persist(storage)
      .create();
    await first.open();
    await first.set("report", "hello");
    await first.close();

    now += 61_000;
    const second = UniKvs.config()
      .use(new Ttl({ now: () => now }))
      .persist(storage)
      .create();
    await second.open();

    // エンベロープだけで失効を判定できるのはプレーン値の get です。
    // has と stream は操作中の記録に依存するため、再起動後は失効を検出できません (既知の制約)。
    await expect(second.get("report")).rejects.toThrowError(KeyNotFoundError);

    await second.close();
  });
});
