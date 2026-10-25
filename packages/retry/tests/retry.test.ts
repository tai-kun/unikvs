import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { vi, test, describe } from "vite-plus/test";

import {
  RetryExhaustedError,
  RetryInvalidOptionError,
  RetryUnsupportedOperationError,
} from "../src/errors.js";
import Retry, { isRetryableError } from "../src/retry.js";

/**
 * 操作ごとに指定回数だけ失敗する内側ストレージです。
 * リトライの成功・枯渇・非リトライ・中断の挙動検証に使用します。
 */
class FlakyStorage implements IStorage {
  public readonly name = "Flaky";

  public readonly calls: string[] = [];

  readonly #failures = new Map<
    string,
    {
      error: unknown;
      remaining: number;
    }
  >();

  #value: unknown;

  readonly #open: boolean;

  public constructor(value: unknown = "ok", open = true) {
    this.#value = value;
    this.#open = open;
  }

  public get isOpen(): boolean {
    return this.#open;
  }

  /**
   * 指定操作を指定回数だけ失敗させます。
   */
  public fail(operation: string, times: number, error: unknown = new Error(operation)): void {
    this.#failures.set(operation, {
      error,
      remaining: times,
    });
  }

  #maybeFail(operation: string): void {
    this.calls.push(operation);
    const failure = this.#failures.get(operation);

    if (failure && failure.remaining > 0) {
      failure.remaining -= 1;

      throw failure.error;
    }
  }

  public open(c: IStorage.OpenContext): void {
    this.#maybeFail(`open:${c.action}`);
  }

  public close(c: IStorage.CloseContext): void {
    this.#maybeFail(`close:${c.action}`);
  }

  public write(c: IStorage.WriteContext, data: unknown): void {
    this.#maybeFail(`write:${c.key}`);
    this.#value = data;
  }

  public read(c: IStorage.ReadContext): unknown {
    this.#maybeFail(`read:${c.key}`);

    return this.#value;
  }

  public exists(c: IStorage.ExistsContext): boolean {
    this.#maybeFail(`exists:${c.key}`);

    return true;
  }

  public delete(c: IStorage.DeleteContext): void {
    this.#maybeFail(`delete:${c.key}`);
  }

  public clear(c: IStorage.ClearContext): void {
    this.#maybeFail(`clear:${c.action}`);
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    this.#maybeFail(`getWritable:${c.key}`);

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        this.#value = chunk;
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    this.#maybeFail(`getReadable:${c.key}`);
    const value = this.#value;

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller) => {
        controller.enqueue(value as Uint8Array<ArrayBuffer>);
        controller.close();
      },
    });
  }

  public onOtherWriteError(): void {
    this.calls.push("onOtherWriteError");
  }
}

describe("初期化と基本属性", () => {
  test("name は Retry である", ({ expect }) => {
    // 実行と検証：
    expect(new Retry(new FlakyStorage()).name).toBe("Retry");
  });

  test("設定の既定値", ({ expect }) => {
    // 実行と検証：
    const retry = new Retry(new FlakyStorage());
    expect(retry.maxRetries).toBe(3);
    expect(retry.initialDelayMs).toBe(100);
    expect(retry.maxDelayMs).toBe(5000);
    expect(retry.factor).toBe(2);
    expect(retry.jitter).toBe(true);
  });

  test("指定値を保持する", ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const retryable = (): boolean => true;
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const onRetry = (): void => {};

    // 実行：
    const retry = new Retry(inner, {
      factor: 3,
      jitter: false,
      onRetry,
      retryable,
      maxDelayMs: 50,
      maxRetries: 1,
      initialDelayMs: 5,
    });

    // 検証：
    expect(retry.inner).toBe(inner);
    expect(retry.maxRetries).toBe(1);
    expect(retry.initialDelayMs).toBe(5);
    expect(retry.maxDelayMs).toBe(50);
    expect(retry.factor).toBe(3);
    expect(retry.jitter).toBe(false);
    expect(retry.retryable).toBe(retryable);
    expect(retry.onRetry).toBe(onRetry);
  });

  test("isOpen は inner に委譲する", ({ expect }) => {
    // 実行と検証：
    expect(new Retry(new FlakyStorage("ok", true)).isOpen).toBe(true);
    expect(new Retry(new FlakyStorage("ok", false)).isOpen).toBe(false);
  });

  test("不正な設定は RetryInvalidOptionError を投げる", ({ expect }) => {
    // 実行と検証：
    const inner = new FlakyStorage();
    expect(() => new Retry(inner, { maxRetries: -1 })).toThrow(RetryInvalidOptionError);
    expect(() => new Retry(inner, { maxRetries: 1.5 })).toThrow(RetryInvalidOptionError);
    expect(() => new Retry(inner, { initialDelayMs: -1 })).toThrow(RetryInvalidOptionError);
    expect(() => new Retry(inner, { maxDelayMs: Number.NaN })).toThrow(RetryInvalidOptionError);
    expect(() => new Retry(inner, { factor: 0.5 })).toThrow(RetryInvalidOptionError);
  });

  test("不正な設定の名前と値を meta に保持する", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new Retry(new FlakyStorage(), { maxRetries: -1 }));

    // 検証：
    expect(error).toBeInstanceOf(RetryInvalidOptionError);
    expect((error as RetryInvalidOptionError).meta).toStrictEqual({
      name: "maxRetries",
      actual: -1,
    });
  });
});

describe("再試行", () => {
  test("write は一時的な失敗の後に成功する", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    inner.fail("write:k1", 2);

    const attempts: number[] = [];
    const retry = new Retry(inner, {
      jitter: false,
      onRetry: (info): void => {
        attempts.push(info.attempt);
      },
      initialDelayMs: 1,
    });

    // 実行：
    await retry.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証：
    expect(inner.calls).toStrictEqual(["write:k1", "write:k1", "write:k1"]);
    expect(attempts).toStrictEqual([1, 2]);
    expect(inner.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
  });

  test("read は一時的な失敗の後に値を返す", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage("hello");
    inner.fail("read:k1", 2);

    const retry = new Retry(inner, { initialDelayMs: 1 });

    // 実行：
    const value = await retry.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(value).toBe("hello");

    expect(inner.calls).toStrictEqual(["read:k1", "read:k1", "read:k1"]);
  });

  test("exists は一時的な失敗の後に成功する", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    inner.fail("exists:k1", 1);

    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行：
    const result = await retry.exists(createHasContext("k1") as IStorage.ExistsContext);

    // 検証：
    expect(result).toBe(true);

    expect(inner.calls).toStrictEqual(["exists:k1", "exists:k1"]);
  });

  test("delete は一時的な失敗の後に成功する", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    inner.fail("delete:k1", 1);

    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行：
    await retry.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証：
    expect(inner.calls).toStrictEqual(["delete:k1", "delete:k1"]);
  });

  test("clear は一時的な失敗の後に成功する", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    inner.fail("clear:clear", 1);

    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行：
    await retry.clear(createClearContext() as IStorage.ClearContext);

    // 検証：
    expect(inner.calls).toStrictEqual(["clear:clear", "clear:clear"]);
  });

  test("getWritable の取得は一時的な失敗の後に成功する", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    inner.fail("getWritable:k1", 1);

    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行：
    const writable = await retry.getWritable(createSetContext("k1") as IStorage.GetWritableContext);
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.close();

    // 検証：
    expect(inner.calls).toStrictEqual(["getWritable:k1", "getWritable:k1"]);
    expect(inner.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("getReadable の取得は一時的な失敗の後に成功する", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage(new Uint8Array([4, 5]));
    inner.fail("getReadable:k1", 1);

    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行：
    const readable = await retry.getReadable(
      createStreamContext("k1") as IStorage.GetReadableContext,
    );
    const reader = readable.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];

    for (;;) {
      const { done, value } = await reader.read();

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (done) {
        break;
      }

      chunks.push(value);
    }

    // 検証：
    expect(inner.calls).toStrictEqual(["getReadable:k1", "getReadable:k1"]);
    expect(chunks).toStrictEqual([new Uint8Array([4, 5])]);
  });

  test("カスタム retryable で KeyNotFoundError を再試行できる", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    inner.fail("read:k1", 1, new KeyNotFoundError({ key: "k1" }));

    const retry = new Retry(inner, {
      jitter: false,
      retryable: (): boolean => true,
      initialDelayMs: 1,
    });

    // 実行：
    const value = await retry.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(value).toBe("ok");

    expect(inner.calls).toStrictEqual(["read:k1", "read:k1"]);
  });
});

describe("枯渇", () => {
  test("上限を超えたら RetryExhaustedError を投げる", async ({ expect }) => {
    // 準備：
    const lastError = new Error("boom");
    const inner = new FlakyStorage();
    inner.fail("write:k1", 5, lastError);

    const retriedAttempts: number[] = [];
    const retry = new Retry(inner, {
      jitter: false,
      onRetry: (info): void => {
        retriedAttempts.push(info.attempt);
      },
      maxRetries: 2,
      initialDelayMs: 1,
    });

    // 実行：
    const error = await retry
      .write(createSetContext("k1") as IStorage.WriteContext, "v1")
      .catch((caught: unknown) => caught);

    // 検証：
    expect(error).toBeInstanceOf(RetryExhaustedError);
    expect((error as RetryExhaustedError).meta).toStrictEqual({
      attempts: 3,
      operation: "write",
    });
    expect((error as RetryExhaustedError).cause).toBe(lastError);
    expect(retriedAttempts).toStrictEqual([1, 2]);

    expect(inner.calls).toStrictEqual(["write:k1", "write:k1", "write:k1"]);
  });

  test("maxRetries が 0 のときは再試行しない", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    inner.fail("read:k1", 1);

    const retry = new Retry(inner, {
      jitter: false,
      maxRetries: 0,
      initialDelayMs: 1,
    });

    // 実行：
    const error = await retry
      .read(createGetContext("k1") as IStorage.ReadContext)
      .catch((caught: unknown) => caught);

    // 検証：
    expect(error).toBeInstanceOf(RetryExhaustedError);
    expect((error as RetryExhaustedError).meta.attempts).toBe(1);

    expect(inner.calls).toStrictEqual(["read:k1"]);
  });
});

describe("再試行しない失敗", () => {
  test("KeyNotFoundError は既定で再試行しない", async ({ expect }) => {
    // 準備：
    const notFound = new KeyNotFoundError({ key: "k1" });
    const inner = new FlakyStorage();
    inner.fail("read:k1", 5, notFound);

    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行と検証：
    await expect(retry.read(createGetContext("k1") as IStorage.ReadContext)).rejects.toBe(notFound);

    expect(inner.calls).toStrictEqual(["read:k1"]);
  });

  test("retryable が false を返したら再試行しない", async ({ expect }) => {
    // 準備：
    const fatal = new Error("fatal");
    const inner = new FlakyStorage();
    inner.fail("delete:k1", 5, fatal);

    const retry = new Retry(inner, {
      jitter: false,
      retryable: (): boolean => false,
      initialDelayMs: 1,
    });

    // 実行と検証：
    await expect(retry.delete(createDeleteContext("k1") as IStorage.DeleteContext)).rejects.toBe(
      fatal,
    );

    expect(inner.calls).toStrictEqual(["delete:k1"]);
  });

  test("AbortError 名のエラーは既定で再試行しない", async ({ expect }) => {
    // 準備：
    const aborted = new DOMException("aborted", "AbortError");
    const inner = new FlakyStorage();
    inner.fail("exists:k1", 5, aborted);

    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行と検証：
    await expect(retry.exists(createHasContext("k1") as IStorage.ExistsContext)).rejects.toBe(
      aborted,
    );

    expect(inner.calls).toStrictEqual(["exists:k1"]);
  });
});

describe("中断", () => {
  test("開始前に中断されていたら inner を呼ばずに失敗する", async ({ expect }) => {
    // 準備：
    const controller = new AbortController();
    const reason = new Error("stop");
    controller.abort(reason);

    const inner = new FlakyStorage();
    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行と検証：
    await expect(
      retry.read(createGetContext("k1", { signal: controller.signal }) as IStorage.ReadContext),
    ).rejects.toBe(reason);
    expect(inner.calls).toStrictEqual([]);
  });

  test("待機中の中断は待機を打ち切る", async ({ expect }) => {
    // 準備：
    vi.useFakeTimers();

    try {
      const controller = new AbortController();
      const reason = new Error("stop");
      const inner = new FlakyStorage();
      inner.fail("read:k1", 5);

      const retry = new Retry(inner, {
        jitter: false,
        initialDelayMs: 10_000,
      });

      // 実行：
      const pending = retry.read(
        createGetContext("k1", { signal: controller.signal }) as IStorage.ReadContext,
      );

      expect(vi.getTimerCount()).toBe(1);
      controller.abort(reason);

      // 検証：
      await expect(pending).rejects.toBe(reason);
      expect(vi.getTimerCount()).toBe(0);
      expect(inner.calls).toStrictEqual(["read:k1"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("バックオフ", () => {
  test("待機時間は指数で増加し上限で頭打ちになる", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    inner.fail("write:k1", 3);

    const delays: number[] = [];
    const retry = new Retry(inner, {
      factor: 2,
      jitter: false,
      onRetry: (info): void => {
        delays.push(info.nextDelayMs);
      },
      maxDelayMs: 25,
      initialDelayMs: 10,
    });

    // 実行：
    await retry.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証：
    expect(delays).toStrictEqual([10, 20, 25]);

    expect(inner.calls).toStrictEqual(["write:k1", "write:k1", "write:k1", "write:k1"]);
  });

  test("ジッターは上限の半分から上限までの範囲で待機時間を揺らす", async ({ expect }) => {
    // 準備：
    vi.useFakeTimers();

    try {
      const inner = new FlakyStorage();
      inner.fail("write:k1", 2);

      const delays: number[] = [];
      const random = vi.spyOn(Math, "random");
      random.mockReturnValueOnce(0).mockReturnValueOnce(1);

      const retry = new Retry(inner, {
        factor: 2,
        jitter: true,
        onRetry: (info): void => {
          delays.push(info.nextDelayMs);
        },
        maxDelayMs: 100,
        initialDelayMs: 100,
      });

      // 実行：
      const pending = retry.write(createSetContext("k1") as IStorage.WriteContext, "v1");

      await vi.runAllTimersAsync();
      await pending;

      // 検証：
      expect(delays).toStrictEqual([50, 100]);
      expect(random).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  test("待機時間が 0 のときはタイマーを経由せずに再試行する", async ({ expect }) => {
    // 準備：
    vi.useFakeTimers();

    try {
      const inner = new FlakyStorage();
      inner.fail("read:k1", 1);

      const delays: number[] = [];
      const retry = new Retry(inner, {
        jitter: false,
        onRetry: (info): void => {
          delays.push(info.nextDelayMs);
        },
        initialDelayMs: 0,
      });

      // 実行：
      const value = await retry.read(createGetContext("k1") as IStorage.ReadContext);

      // 検証：
      expect(value).toBe("ok");
      expect(delays).toStrictEqual([0]);

      expect(vi.getTimerCount()).toBe(0);
      expect(inner.calls).toStrictEqual(["read:k1", "read:k1"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("onRetry に試行情報が通知される", async ({ expect }) => {
    // 準備：
    const failure = new Error("transient");
    const inner = new FlakyStorage();
    inner.fail("read:k1", 1, failure);

    const infos: {
      error: unknown;
      attempt: number;
      operation: string;
      nextDelayMs: number;
    }[] = [];
    const retry = new Retry(inner, {
      jitter: false,
      onRetry: (info): void => {
        infos.push({ ...info });
      },
      initialDelayMs: 1,
    });

    // 実行：
    await retry.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(infos).toHaveLength(1);
    expect(infos[0]?.operation).toBe("read");
    expect(infos[0]?.attempt).toBe(1);
    expect(infos[0]?.error).toBe(failure);
    expect(infos[0]?.nextDelayMs).toBe(1);
  });
});

describe("再試行しない委譲", () => {
  test("open と close は inner に委譲する", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    const retry = new Retry(inner);

    // 実行：
    await retry.open(createOpenContext() as IStorage.OpenContext);
    await retry.close(createCloseContext() as IStorage.CloseContext);

    // 検証：
    expect(inner.calls).toStrictEqual(["open:open", "close:close"]);
  });

  test("open の失敗は再試行しない", async ({ expect }) => {
    // 準備：
    const failure = new Error("open failed");
    const inner = new FlakyStorage();
    inner.fail("open:open", 5, failure);

    const retry = new Retry(inner);

    // 実行と検証：
    await expect(retry.open(createOpenContext() as IStorage.OpenContext)).rejects.toBe(failure);

    expect(inner.calls).toStrictEqual(["open:open"]);
  });

  test("onOtherWriteError は inner に委譲する", async ({ expect }) => {
    // 準備：
    const inner = new FlakyStorage();
    const retry = new Retry(inner);

    // 実行：
    await retry.onOtherWriteError(
      createSetContext("k1") as IStorage.OtherWriteErrorHandlerContext,
      [],
    );

    // 検証：
    expect(inner.calls).toStrictEqual(["onOtherWriteError"]);
  });

  test("getWritable を持たない inner では RetryUnsupportedOperationError で失敗する", async ({
    expect,
  }) => {
    // 準備：
    const inner = {
      name: "Bare",
      read: (): unknown => "v",
      clear: (): void => {},
      write: (): void => {},
      delete: (): void => {},
      exists: (): boolean => true,
      isOpen: true,
    } as unknown as IStorage;
    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行：
    const error = await retry
      .getWritable(createSetContext("k1") as IStorage.GetWritableContext)
      .catch((caught: unknown) => caught);

    // 検証：
    expect(error).toBeInstanceOf(RetryUnsupportedOperationError);
    expect((error as RetryUnsupportedOperationError).meta).toStrictEqual({
      storage: "Bare",
      operation: "getWritable",
    });
  });

  test("getReadable を持たない inner では RetryUnsupportedOperationError で失敗する", async ({
    expect,
  }) => {
    // 準備：
    const inner = {
      name: "Bare",
      read: (): unknown => "v",
      clear: (): void => {},
      write: (): void => {},
      delete: (): void => {},
      exists: (): boolean => true,
      isOpen: true,
    } as unknown as IStorage;
    const retry = new Retry(inner, {
      jitter: false,
      initialDelayMs: 1,
    });

    // 実行と検証：
    await expect(
      retry.getReadable(createStreamContext("k1") as IStorage.GetReadableContext),
    ).rejects.toThrow(RetryUnsupportedOperationError);
  });
});

describe("isRetryableError", () => {
  test("既定の再試行可否を判定する", ({ expect }) => {
    // 実行と検証：
    expect(isRetryableError(new Error("boom"))).toBe(true);
    expect(isRetryableError("boom")).toBe(true);
    expect(isRetryableError(new KeyNotFoundError({ key: "k1" }))).toBe(false);
    expect(isRetryableError(new DOMException("aborted", "AbortError"))).toBe(false);
    expect(isRetryableError({ name: "AbortError" })).toBe(false);
  });
});
