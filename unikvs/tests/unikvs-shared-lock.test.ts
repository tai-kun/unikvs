import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import { OpenContext, CloseContext } from "../src/_contexts.js";
import UniKvsMiddleware from "../src/_middleware.js";
import acquireSignalLock from "../src/_signal-lock.js";
import UniKvsStorage from "../src/_storage.js";
import { Builder } from "../src/index.js";
import { Gate, isPending, FakeStorage, withTimeout, FakeMiddleware } from "./_helpers.js";

/**
 * gate() で指定したキーの exists 処理を保留状態にできるストレージモックです。
 * 共有ロックの動作検証のために使用します。
 */
class GatedExistsStorage implements IStorage {
  public readonly name = "GatedExistsStorage";

  public isOpen = true;

  public readonly map = new Map<string, unknown>();

  public onExistsStart: ((key: string) => void) | undefined;

  private gatedKey: string | undefined;

  private gatePromise: Promise<void> | undefined;

  private releaseGate: (() => void) | undefined;

  public gate(key: string): void {
    const { promise, resolve } = Promise.withResolvers<void>();

    this.gatedKey = key;
    this.gatePromise = promise;
    this.releaseGate = resolve;
  }

  public ungate(): void {
    this.releaseGate?.();
    this.gatePromise = undefined;
    this.gatedKey = undefined;
  }

  public async open(): Promise<void> {}

  public async close(): Promise<void> {}

  public async write(c: IStorage.WriteContext, data: unknown): Promise<void> {
    this.map.set(c.key, data);
  }

  public async read(c: IStorage.ReadContext): Promise<unknown> {
    return this.map.get(c.key);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    this.onExistsStart?.(c.key);
    if (c.key === this.gatedKey && this.gatePromise) {
      await this.gatePromise;
    }

    return this.map.has(c.key);
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    this.map.delete(c.key);
  }

  public async copy(c: IStorage.CopyContext): Promise<void> {
    if (!this.map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (c.key === c.destinationKey) {
      return;
    }

    this.map.set(c.destinationKey, this.map.get(c.key));
  }

  public async move(c: IStorage.MoveContext): Promise<void> {
    if (!this.map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (c.key === c.destinationKey) {
      return;
    }

    this.map.set(c.destinationKey, this.map.get(c.key));
    this.map.delete(c.key);
  }

  public async clear(_c: IStorage.ClearContext): Promise<void> {
    this.map.clear();
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<unknown> {
    const chunks = (this.map.get(c.key) as unknown[] | undefined) ?? [];

    return new ReadableStream({
      start(controller): void {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }

        controller.close();
      },
    });
  }
}

describe("UniKvs - 共有ロック", () => {
  test("has の存在確認が保留中でも別キーの has を完了できる", async ({ expect }) => {
    // 準備：
    const storage = new GatedExistsStorage();
    await using kvs = new Builder().persist(storage).build();
    await kvs.open();

    const entered = Promise.withResolvers<void>();
    storage.onExistsStart = (key): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (key === "a") {
        entered.resolve();
      }
    };

    storage.gate("a");

    try {
      // 実行：
      const pendingHasA = kvs.has("a");

      await entered.promise;
      const hasB = kvs.has("b");

      // 検証：
      await expect(withTimeout(hasB, 200, "has-b")).resolves.toBe(false);

      storage.ungate();
      await expect(pendingHasA).resolves.toBe(false);
    } finally {
      storage.ungate();
    }
  });

  test("stream のセットアップが保留中でも別キーの has を完了できる", async ({ expect }) => {
    // 準備：
    const storage = new GatedExistsStorage();
    await using kvs = new Builder().persist(storage).build();
    await kvs.open();
    storage.map.set("a", [Uint8Array.from([1])]);

    const entered = Promise.withResolvers<void>();
    storage.onExistsStart = (key): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (key === "a") {
        entered.resolve();
      }
    };

    storage.gate("a");

    const pendingStream = kvs.stream("a");
    let vs: Awaited<ReturnType<typeof kvs.stream>> | undefined;

    try {
      // 実行：
      await entered.promise;

      // 検証：
      await expect(withTimeout(kvs.has("b"), 200, "has-b")).resolves.toBe(false);
      storage.ungate();
      vs = await pendingStream;
      const chunks: unknown[] = [];

      for await (const chunk of vs) {
        chunks.push(chunk);
      }

      expect(chunks).toStrictEqual([Uint8Array.from([1])]);
    } finally {
      storage.ungate();
      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (vs === undefined) {
        try {
          vs = await withTimeout(pendingStream, 1000, "stream-resume");
        } catch {
          // 修正前の失敗パスではストリームを消費できないため無視します。
        }
      }

      await vs?.dispose();
    }
  });

  test("has の存在確認が保留中でも別キーの set は完了できる", async ({ expect }) => {
    // 準備：
    const storage = new GatedExistsStorage();
    await using kvs = new Builder().persist(storage).build();
    await kvs.open();

    const entered = Promise.withResolvers<void>();
    storage.onExistsStart = (key): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (key === "a") {
        entered.resolve();
      }
    };

    storage.gate("a");

    try {
      // 実行：
      const pendingHasA = kvs.has("a");

      await entered.promise;
      const setB = kvs.set("b", "value");

      // 検証 : グローバル読み取りロックは共存するため、別キーの set は待たされない。
      await expect(withTimeout(setB, 200, "set-b")).resolves.toBeUndefined();

      storage.ungate();
      await expect(pendingHasA).resolves.toBe(false);
      await expect(kvs.get("b")).resolves.toBe("value");
    } finally {
      storage.ungate();
    }
  });

  test("has の存在確認が保留中のとき同一キーの set はキー書き込みロックの競合で待たされる", async ({
    expect,
  }) => {
    // 準備：
    const storage = new GatedExistsStorage();
    await using kvs = new Builder().persist(storage).build();
    await kvs.open();

    const entered = Promise.withResolvers<void>();
    storage.onExistsStart = (key): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (key === "a") {
        entered.resolve();
      }
    };

    storage.gate("a");

    try {
      // 実行：
      const pendingHasA = kvs.has("a");

      await entered.promise;
      const setA = kvs.set("a", "value");

      // 検証 : 同一キーの読み取りロックと競合するため、set は has の完了待ちになる。
      await expect(withTimeout(setA, 200, "set-a")).rejects.toThrow("TIMEOUT(set-a)");

      storage.ungate();
      await expect(pendingHasA).resolves.toBe(false);
      await expect(setA).resolves.toBeUndefined();
      await expect(kvs.get("a")).resolves.toBe("value");
    } finally {
      storage.ungate();
    }
  });

  test("ライブストリーム中の別キー操作は完了できるが同一キーの set は dispose まで待たされる", async ({
    expect,
  }) => {
    // 準備 : stream("a") がキー a の読み取りロックを保持し続ける。
    const storage = new GatedExistsStorage();
    storage.map.set("a", [Uint8Array.from([1])]);

    await using kvs = new Builder().persist(storage).build();
    await kvs.open();

    const vs = await kvs.stream("a");

    try {
      // 検証 : キー a の読み取りロックはキー b の操作と競合しない。
      await expect(withTimeout(kvs.has("b"), 200, "has-b")).resolves.toBe(false);
      await expect(withTimeout(kvs.set("b", "value"), 200, "set-b")).resolves.toBeUndefined();

      // 実行：
      const setA = kvs.set("a", "value");

      // 検証 : 同一キーへの書き込みはキー読み取りロックの解放待ちになる。
      await expect(withTimeout(setA, 200, "set-a")).rejects.toThrow("TIMEOUT(set-a)");

      // 実行と検証 : dispose でキー読み取りロックが解放されると完了する。
      await vs.dispose();
      await expect(setA).resolves.toBeUndefined();
      await expect(kvs.get("a")).resolves.toBe("value");
    } finally {
      await vs.dispose();
    }
  });

  test("has の存在確認が保留中のとき clear は io グローバル書き込みロックの競合で待たされる", async ({
    expect,
  }) => {
    // 準備：
    const storage = new GatedExistsStorage();
    storage.map.set("a", "value");

    await using kvs = new Builder().persist(storage).build();
    await kvs.open();

    const entered = Promise.withResolvers<void>();
    storage.onExistsStart = (key): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (key === "a") {
        entered.resolve();
      }
    };

    storage.gate("a");

    try {
      // 実行：
      const pendingHasA = kvs.has("a");

      await entered.promise;
      const clearPending = kvs.clear();

      // 検証 : clear の io グローバル書き込みロックはキー読み取りロックの解放待ちになる。
      await expect(withTimeout(clearPending, 200, "clear")).rejects.toThrow("TIMEOUT(clear)");

      storage.ungate();
      await expect(pendingHasA).resolves.toBe(true);
      await expect(clearPending).resolves.toBeUndefined();
      expect(storage.map.size).toBe(0);
    } finally {
      storage.ungate();
    }
  });
});

describe("UniKvs - 共有プラグインの open/close 待機中の中断", () => {
  test("共有ストレージの open 待機中に中断すると即座に拒否する", async ({ expect }) => {
    // 準備 : 実 open をゲートで保留するストレージを 2 クライアントが共有する。
    const storage = new FakeStorage("shared-open");
    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "open") {
        entered.open();
        await release.wait();
      }
    };

    const builder = new Builder().persist(storage);
    const a = builder.build();
    const b = builder.build();
    const aOpen = a.open();

    try {
      await entered.wait();

      const reason = new Error("open aborted");
      const ac = new AbortController();
      const bOpen = b.open({ signal: ac.signal });

      // 待機側が共有ロックの取得待ちに入るまでマイクロタスクを流します。
      await new Promise((resolve) => setTimeout(resolve, 0));
      ac.abort(reason);

      // 検証 : 先行する open を待たず、中断理由で拒否する。
      await expect(withTimeout(bOpen, 200, "aborted-open")).rejects.toBe(reason);
      await expect(isPending(aOpen)).resolves.toBe(true);
    } finally {
      release.open();
    }

    await aOpen;
    expect(storage.isOpen).toBe(true);

    await a.close();
  });

  test("共有ミドルウェアの open 待機中に中断すると即座に拒否する", async ({ expect }) => {
    // 準備 : 実 open をゲートで保留するミドルウェアを 2 クライアントが共有する。
    const middleware = new FakeMiddleware("shared-open");
    const entered = new Gate();
    const release = new Gate();
    middleware.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "open") {
        entered.open();
        await release.wait();
      }
    };

    const builder = new Builder().use(middleware).persist(new FakeStorage());
    const a = builder.build();
    const b = builder.build();
    const aOpen = a.open();

    try {
      await entered.wait();

      const reason = new Error("open aborted");
      const ac = new AbortController();
      const bOpen = b.open({ signal: ac.signal });

      await new Promise((resolve) => setTimeout(resolve, 0));
      ac.abort(reason);

      await expect(withTimeout(bOpen, 200, "aborted-open")).rejects.toBe(reason);
      await expect(isPending(aOpen)).resolves.toBe(true);
    } finally {
      release.open();
    }

    await aOpen;
    expect(middleware.isOpen).toBe(true);

    await a.close();
  });

  test("共有ストレージの close 待機中に中断すると即座に拒否する", async ({ expect }) => {
    // 準備 : 参照を 1 つ残した状態で実 close をゲートで保留する。
    const storage = new FakeStorage("shared-close");
    const wrapper = UniKvsStorage.from(storage);
    const openSignal = AbortSignal.timeout(1000);
    await wrapper.open(new OpenContext({ signal: openSignal }));
    await wrapper.open(new OpenContext({ signal: openSignal }));
    await wrapper.close(new CloseContext({ signal: openSignal }));

    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "close") {
        entered.open();
        await release.wait();
      }
    };

    const closing = wrapper.close(new CloseContext({ signal: openSignal }));

    try {
      await entered.wait();

      const reason = new Error("close aborted");
      const ac = new AbortController();
      const waiting = wrapper.close(new CloseContext({ signal: ac.signal }));

      await new Promise((resolve) => setTimeout(resolve, 0));
      ac.abort(reason);

      // 検証 : 先行する実 close を待たず、中断理由で拒否する。
      await expect(withTimeout(waiting, 200, "aborted-close")).rejects.toBe(reason);
    } finally {
      release.open();
    }

    await closing;
    expect(storage.isOpen).toBe(false);
  });

  test("共有ミドルウェアの close 待機中に中断すると即座に拒否する", async ({ expect }) => {
    // 準備 : 参照を 1 つ残した状態で実 close をゲートで保留する。
    const middleware = new FakeMiddleware("shared-close");
    const wrapper = UniKvsMiddleware.from(middleware);
    const openSignal = AbortSignal.timeout(1000);
    await wrapper.open(new OpenContext({ signal: openSignal }));
    await wrapper.open(new OpenContext({ signal: openSignal }));
    await wrapper.close(new CloseContext({ signal: openSignal }));

    const entered = new Gate();
    const release = new Gate();
    middleware.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "close") {
        entered.open();
        await release.wait();
      }
    };

    const closing = wrapper.close(new CloseContext({ signal: openSignal }));

    try {
      await entered.wait();

      const reason = new Error("close aborted");
      const ac = new AbortController();
      const waiting = wrapper.close(new CloseContext({ signal: ac.signal }));

      await new Promise((resolve) => setTimeout(resolve, 0));
      ac.abort(reason);

      await expect(withTimeout(waiting, 200, "aborted-close")).rejects.toBe(reason);
    } finally {
      release.open();
    }

    await closing;
    expect(middleware.isOpen).toBe(false);
  });
});

describe("UniKvs - 共有ロック取得待機の中断", () => {
  test("中断で待機をやめた要求が後からロックを取得して保持しない", async ({ expect }) => {
    // 準備 : 先行要求がロックを保持している間に、後続要求を待機させて中断する。
    const target = {};
    const holder = await acquireSignalLock(target, AbortSignal.timeout(1000));
    const reason = new Error("waiting aborted");
    const ac = new AbortController();
    const waiting = acquireSignalLock(target, ac.signal);

    try {
      // 待機キューへ入るまでマイクロタスクを流します。
      await new Promise((resolve) => setTimeout(resolve, 0));
      ac.abort(reason);

      // 検証 : 待機中の要求は即座に中断理由で失敗する。
      await expect(withTimeout(waiting, 200, "waiting-aborted")).rejects.toBe(reason);
    } finally {
      holder.release();
    }

    // 検証 : 中断済みの要求が後からロックを取得して保持せず、次の要求へ即座に割り当てられる。
    const next = await withTimeout(
      acquireSignalLock(target, AbortSignal.timeout(1000)),
      200,
      "acquire-after-abort",
    );
    expect(next.released).toBe(false);
    next.release();
  });

  test("中断済みの signal では待機キューに入らず即座に拒否する", async ({ expect }) => {
    // 準備 :
    const target = {};
    const reason = new Error("already aborted");

    // 実行と検証 : 中断済みの要求はロックを取得しない。
    await expect(acquireSignalLock(target, AbortSignal.abort(reason))).rejects.toBe(reason);

    // 検証 : 中断済みの要求がキューに残っていないため、次の要求は即座にロックを取得できる。
    const next = await withTimeout(
      acquireSignalLock(target, AbortSignal.timeout(1000)),
      200,
      "acquire-after-already-aborted",
    );
    expect(next.released).toBe(false);
    next.release();
  });
});
