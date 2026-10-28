import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import { Builder } from "../src/index.js";
import { withTimeout } from "./_helpers.js";

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
