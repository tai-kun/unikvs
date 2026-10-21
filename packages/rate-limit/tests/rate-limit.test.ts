import type { IMiddleware } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createNext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test, vi } from "vitest";

import { RateLimitExceededError, RateLimitInvalidOptionError } from "../src/errors.js";
import RateLimit from "../src/rate-limit.js";

function createManualClock(start = 0) {
  let now = start;
  const sleeps: number[] = [];

  return {
    now: (): number => now,
    sleep: (ms: number): Promise<void> => {
      sleeps.push(ms);
      now += ms;

      return Promise.resolve();
    },
    sleeps,
  };
}

/**
 * sleep を保留状態にし、テストから明示的に完了させられる偽時計です。
 * 待機中の中断と、中断後に待ち行列が解放されることを検証するために使用します。
 */
function createPendingClock() {
  let now = 0;
  const waits: Array<{ complete: () => void }> = [];

  return {
    now: (): number => now,
    sleep: (ms: number, signal: AbortSignal): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const complete = (): void => {
          now += ms;
          resolve();
        };
        waits.push({ complete });
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    waits,
  };
}

/**
 * 待機中のリクエストが sleep の呼び出しに到達するまでマイクロタスクを進めます。
 * 実時間に依存せず、待機状態を確実に作るために使用します。
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function useSet(limiter: RateLimit, key = "k1", init: { signal?: AbortSignal } = {}) {
  return limiter.use(createSetContext(key, init) as IMiddleware.UseContext, createNext());
}

describe("初期化と基本属性", () => {
  test("name は RateLimit である", ({ expect }) => {
    expect(new RateLimit().name).toBe("RateLimit");
  });

  test("isOpen は常に true である", ({ expect }) => {
    expect(new RateLimit().isOpen).toBe(true);
  });

  test("既定値は 1 トークン毎秒でバーストなしである", ({ expect }) => {
    const limiter = new RateLimit();

    expect(limiter.tokensPerInterval).toBe(1);
    expect(limiter.intervalMs).toBe(1000);
    expect(limiter.maxTokens).toBe(1);
    expect(limiter.strategy).toBe("wait");
    expect(limiter.availableTokens).toBe(1);
  });

  test("burst は maxTokens の別名である", ({ expect }) => {
    expect(new RateLimit({ burst: 5 }).maxTokens).toBe(5);
  });

  test("maxTokens と burst の両指定では maxTokens が優先される", ({ expect }) => {
    expect(new RateLimit({ maxTokens: 2, burst: 5 }).maxTokens).toBe(2);
  });

  test("maxTokens の既定値は tokensPerInterval である", ({ expect }) => {
    expect(new RateLimit({ tokensPerInterval: 4 }).maxTokens).toBe(4);
  });
});

describe("コンストラクターの検証", () => {
  test("不正な tokensPerInterval を拒否する", ({ expect }) => {
    for (const tokensPerInterval of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new RateLimit({ tokensPerInterval })).toThrow(RateLimitInvalidOptionError);
    }
  });

  test("不正な intervalMs を拒否する", ({ expect }) => {
    for (const intervalMs of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new RateLimit({ intervalMs })).toThrow(RateLimitInvalidOptionError);
    }
  });

  test("不正な maxTokens と burst を拒否する", ({ expect }) => {
    for (const maxTokens of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new RateLimit({ maxTokens })).toThrow(RateLimitInvalidOptionError);
      expect(() => new RateLimit({ burst: maxTokens })).toThrow(RateLimitInvalidOptionError);
    }
  });

  test("不正な strategy を拒否する", ({ expect }) => {
    expect(() => new RateLimit({ strategy: "bogus" as never })).toThrow(
      RateLimitInvalidOptionError,
    );
  });

  test("関数でない now と sleep を拒否する", ({ expect }) => {
    expect(() => new RateLimit({ now: "now" as never })).toThrow(RateLimitInvalidOptionError);
    expect(() => new RateLimit({ sleep: 1 as never })).toThrow(RateLimitInvalidOptionError);
  });

  test("不正なオプションの名前と値を meta に保持する", ({ expect }) => {
    // 実行
    let error: unknown;
    try {
      new RateLimit({ intervalMs: 0 });
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(RateLimitInvalidOptionError);
    expect((error as RateLimitInvalidOptionError).meta).toStrictEqual({
      name: "intervalMs",
      actual: 0,
    });
  });
});

describe("バースト", () => {
  test("上限までは連続操作を通し、キーが違っても上限超過で投げる", async ({ expect }) => {
    // バケットはキーごとではなくミドルウェアインスタンスで共有される
    const limiter = new RateLimit({
      tokensPerInterval: 1,
      intervalMs: 1000,
      maxTokens: 3,
      strategy: "throw",
      now: () => 0,
    });

    await useSet(limiter, "k1");
    await useSet(limiter, "k2");
    await useSet(limiter, "k3");
    expect(limiter.availableTokens).toBe(0);

    const error = await captureRejection(useSet(limiter, "k4"));

    expect(error).toBeInstanceOf(RateLimitExceededError);
    expect((error as RateLimitExceededError).meta).toStrictEqual({ retryAfterMs: 1000 });
    expect((error as Error).message).toBe("Rate limit exceeded. Retry after 1000ms.");
  });
});

describe("時間経過による回復", () => {
  test("偽時計でトークンが補充される", async ({ expect }) => {
    let now = 0;
    const limiter = new RateLimit({
      tokensPerInterval: 1,
      intervalMs: 1000,
      maxTokens: 1,
      strategy: "throw",
      now: () => now,
    });

    await useSet(limiter);

    now = 500;
    expect(limiter.availableTokens).toBeCloseTo(0.5, 10);
    const first = (await captureRejection(useSet(limiter))) as RateLimitExceededError;
    expect(first).toBeInstanceOf(RateLimitExceededError);
    expect(first.meta).toStrictEqual({ retryAfterMs: 500 });

    now = 1000;
    await useSet(limiter);
    expect(limiter.availableTokens).toBe(0);

    now = 1500;
    const second = (await captureRejection(useSet(limiter))) as RateLimitExceededError;
    expect(second.meta).toStrictEqual({ retryAfterMs: 500 });
  });

  test("補充は上限で頭打ちになる", async ({ expect }) => {
    let now = 0;
    const limiter = new RateLimit({
      tokensPerInterval: 1,
      intervalMs: 1000,
      maxTokens: 2,
      strategy: "throw",
      now: () => now,
    });

    await useSet(limiter, "k1");
    await useSet(limiter, "k2");

    now = 10_000;
    expect(limiter.availableTokens).toBe(2);

    await useSet(limiter, "k3");
    await useSet(limiter, "k4");
    await expect(useSet(limiter, "k5")).rejects.toThrow(RateLimitExceededError);
  });

  test("時計が戻ってもトークンは増えない", async ({ expect }) => {
    let now = 1000;
    const limiter = new RateLimit({
      tokensPerInterval: 1,
      intervalMs: 1000,
      maxTokens: 1,
      strategy: "throw",
      now: () => now,
    });

    await useSet(limiter);

    now = 500;
    await expect(useSet(limiter)).rejects.toThrow(RateLimitExceededError);
  });
});

describe("throw 戦略", () => {
  test("制限超過で待たずに投げ、next を呼ばない", async ({ expect }) => {
    const clock = createManualClock();
    const limiter = new RateLimit({
      tokensPerInterval: 2,
      intervalMs: 1000,
      maxTokens: 1,
      strategy: "throw",
      now: clock.now,
      sleep: clock.sleep,
    });
    let calls = 0;
    const next = async (): Promise<void> => {
      calls += 1;
    };

    await limiter.use(createSetContext("k1") as IMiddleware.UseContext, next);
    const error = (await captureRejection(
      limiter.use(createSetContext("k2") as IMiddleware.UseContext, next),
    )) as RateLimitExceededError;

    expect(error).toBeInstanceOf(RateLimitExceededError);
    expect(error.meta).toStrictEqual({ retryAfterMs: 500 });
    expect(clock.sleeps).toStrictEqual([]);
    expect(calls).toBe(1);
    expect(limiter.availableTokens).toBe(0);
  });
});

describe("wait 戦略", () => {
  test("トークン回復まで待ってから実行する", async ({ expect }) => {
    const clock = createManualClock();
    const limiter = new RateLimit({
      tokensPerInterval: 2,
      intervalMs: 1000,
      maxTokens: 2,
      strategy: "wait",
      now: clock.now,
      sleep: clock.sleep,
    });
    let calls = 0;
    const next = async (): Promise<void> => {
      calls += 1;
    };

    await limiter.use(createSetContext("k1") as IMiddleware.UseContext, next);
    await limiter.use(createSetContext("k2") as IMiddleware.UseContext, next);
    await limiter.use(createSetContext("k3") as IMiddleware.UseContext, next);

    expect(calls).toBe(3);
    expect(clock.sleeps).toStrictEqual([500]);
  });

  test("既定の sleep はタイマーで回復を待つ", async ({ expect }) => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const limiter = new RateLimit({
        tokensPerInterval: 1,
        intervalMs: 20,
        maxTokens: 1,
        strategy: "wait",
        now: () => now,
      });
      let calls = 0;
      const next = async (): Promise<void> => {
        calls += 1;
      };

      await limiter.use(createSetContext("k1") as IMiddleware.UseContext, next);
      const pending = limiter.use(createSetContext("k2") as IMiddleware.UseContext, next);
      await flushMicrotasks();
      now = 20;
      await vi.advanceTimersByTimeAsync(20);
      await pending;

      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("待ち行列は先着順に実行される", async ({ expect }) => {
    const clock = createManualClock();
    const limiter = new RateLimit({
      tokensPerInterval: 1,
      intervalMs: 100,
      maxTokens: 1,
      strategy: "wait",
      now: clock.now,
      sleep: clock.sleep,
    });

    await useSet(limiter, "k0");

    const order: number[] = [];
    const nextFor = (id: number) => async (): Promise<void> => {
      order.push(id);
    };
    await Promise.all([
      limiter.use(createSetContext("k1") as IMiddleware.UseContext, nextFor(1)),
      limiter.use(createSetContext("k2") as IMiddleware.UseContext, nextFor(2)),
      limiter.use(createSetContext("k3") as IMiddleware.UseContext, nextFor(3)),
    ]);

    expect(order).toStrictEqual([1, 2, 3]);
    expect(clock.sleeps).toStrictEqual([100, 100, 100]);
  });
});

describe("操作の種類", () => {
  test("読み書きと存在確認と削除と全削除と流れが 1 トークンずつ消費する", async ({ expect }) => {
    const limiter = new RateLimit({
      tokensPerInterval: 1,
      intervalMs: 1000,
      maxTokens: 6,
      strategy: "throw",
      now: () => 0,
    });
    let calls = 0;
    const next = async (): Promise<void> => {
      calls += 1;
    };

    await limiter.use(createSetContext("k") as IMiddleware.UseContext, next);
    await limiter.use(createGetContext("k") as IMiddleware.UseContext, next);
    await limiter.use(createStreamContext("k") as IMiddleware.UseContext, next);
    await limiter.use(createHasContext("k") as IMiddleware.UseContext, next);
    await limiter.use(createDeleteContext("k") as IMiddleware.UseContext, next);
    await limiter.use(createClearContext() as IMiddleware.UseContext, next);

    expect(calls).toBe(6);
    expect(limiter.availableTokens).toBe(0);
    await expect(useSet(limiter)).rejects.toThrow(RateLimitExceededError);
  });
});

describe("中断", () => {
  test("中断済みシグナルではトークンを消費せず中断する", async ({ expect }) => {
    const limiter = new RateLimit({ maxTokens: 1, strategy: "wait" });
    let calls = 0;
    const next = async (): Promise<void> => {
      calls += 1;
    };

    const error = await captureRejection(
      limiter.use(
        createSetContext("k1", { signal: abortedSignal() }) as IMiddleware.UseContext,
        next,
      ),
    );

    expect((error as DOMException).name).toBe("AbortError");
    expect(limiter.availableTokens).toBe(1);
    expect(calls).toBe(0);
  });

  test("待機中に中断するとエラーになり、後続の要求は待ち行列に残らない", async ({ expect }) => {
    const clock = createPendingClock();
    const limiter = new RateLimit({
      tokensPerInterval: 1,
      intervalMs: 1000,
      maxTokens: 1,
      strategy: "wait",
      now: clock.now,
      sleep: clock.sleep,
    });
    let calls = 0;
    const next = async (): Promise<void> => {
      calls += 1;
    };

    await limiter.use(createSetContext("k1") as IMiddleware.UseContext, next);

    // 準備: 2 件目を sleep で待機させる
    const controller = new AbortController();
    const pending = limiter.use(
      createSetContext("k2", { signal: controller.signal }) as IMiddleware.UseContext,
      next,
    );
    await flushMicrotasks();
    expect(clock.waits).toHaveLength(1);

    // 実行
    controller.abort();

    // 検証: 中断した要求は next を呼ばない
    const error = await captureRejection(pending);
    expect((error as DOMException).name).toBe("AbortError");
    expect(calls).toBe(1);

    // 検証: 中断した要求が待ち行列を塞いでいない
    const queued = limiter.use(createSetContext("k3") as IMiddleware.UseContext, next);
    await flushMicrotasks();
    expect(clock.waits).toHaveLength(2);
    clock.waits[1]!.complete();
    await queued;
    expect(calls).toBe(2);
  });

  test("既定の待機処理は中断で打ち切られる", async ({ expect }) => {
    const limiter = new RateLimit({ intervalMs: 60_000, maxTokens: 1 });
    let calls = 0;
    const next = async (): Promise<void> => {
      calls += 1;
    };

    await limiter.use(createSetContext("k1") as IMiddleware.UseContext, next);

    const controller = new AbortController();
    const pending = limiter.use(
      createSetContext("k2", { signal: controller.signal }) as IMiddleware.UseContext,
      next,
    );
    await flushMicrotasks();
    controller.abort();

    const error = await captureRejection(pending);

    expect((error as DOMException).name).toBe("AbortError");
    expect(calls).toBe(1);
  });
});
