import type { IStorage } from "@unikvs/core";
import { describe, test } from "vitest";

import UniKvs from "../src/unikvs.js";

/**
 * gate() で指定したキーの exists 処理を保留状態にできるストレージモックです。
 * 共有ロックの動作検証のために使用します。
 */
class GatedExistsStorage implements IStorage {
  readonly name = "GatedExistsStorage";
  isOpen = true;

  readonly map = new Map<string, unknown>();

  onExistsStart: ((key: string) => void) | undefined;

  private gatedKey: string | undefined;
  private gatePromise: Promise<void> | undefined;
  private releaseGate: (() => void) | undefined;

  gate(key: string): void {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.gatedKey = key;
    this.gatePromise = promise;
    this.releaseGate = resolve;
  }

  ungate(): void {
    this.releaseGate?.();
    this.gatePromise = undefined;
    this.gatedKey = undefined;
  }

  async open(): Promise<void> {}

  async close(): Promise<void> {}

  async write(args: IStorage.WriteArgs): Promise<void> {
    this.map.set(args.key, args.data);
  }

  async read(args: IStorage.ReadArgs): Promise<unknown> {
    return this.map.get(args.key);
  }

  async exists(args: IStorage.ExistsArgs): Promise<boolean> {
    this.onExistsStart?.(args.key);
    if (args.key === this.gatedKey && this.gatePromise) {
      await this.gatePromise;
    }
    return this.map.has(args.key);
  }

  async delete(args: IStorage.DeleteArgs): Promise<void> {
    this.map.delete(args.key);
  }

  async clear(_args: IStorage.ClearArgs): Promise<void> {
    this.map.clear();
  }

  getReadable(args: Pick<IStorage.GetReadableArgs, "key">): ReadableStream<unknown> {
    const chunks = (this.map.get(args.key) as unknown[] | undefined) ?? [];
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
  }
}

/**
 * 指定時間内に Promise が解決しなければ TIMEOUT エラーで拒否します。
 * デッドロック時にテストが固まるのを防ぐために使用します。
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT(${label})`)), ms)),
  ]);
}

describe("UniKvs - 共有ロック", () => {
  test("has の存在確認が保留中でも別キーの has を完了できる", async ({ expect }) => {
    // 準備
    const storage = new GatedExistsStorage();
    const kvs = UniKvs.config().appendStorage(storage).create();
    await kvs.open();

    const entered = Promise.withResolvers<void>();
    storage.onExistsStart = (key) => {
      if (key === "a") {
        entered.resolve();
      }
    };
    storage.gate("a");

    try {
      // 実行
      const pendingHasA = kvs.has("a");
      await entered.promise;
      const hasB = kvs.has("b");

      // 検証
      await expect(withTimeout(hasB, 200, "has-b")).resolves.toBe(false);
      storage.ungate();
      await expect(pendingHasA).resolves.toBe(false);
    } finally {
      storage.ungate();
      await kvs.close();
    }
  });

  test("stream のセットアップが保留中でも別キーの has を完了できる", async ({ expect }) => {
    // 準備
    const storage = new GatedExistsStorage();
    const kvs = UniKvs.config().appendStorage(storage).create();
    await kvs.open();
    storage.map.set("a", [Uint8Array.from([1])]);

    const entered = Promise.withResolvers<void>();
    storage.onExistsStart = (key) => {
      if (key === "a") {
        entered.resolve();
      }
    };
    storage.gate("a");

    const pendingStream = kvs.stream("a");
    let vs: Awaited<ReturnType<typeof kvs.stream>> | undefined;
    try {
      // 実行
      await entered.promise;

      // 検証
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
      if (vs === undefined) {
        try {
          vs = await withTimeout(pendingStream, 1000, "stream-resume");
        } catch {
          // 修正前の失敗パスではストリームを消費できないため無視します。
        }
      }
      await vs?.dispose();
      await kvs.close();
    }
  });

  test("has の存在確認が保留中のとき set は排他ロックで待たされる", async ({ expect }) => {
    // 準備
    const storage = new GatedExistsStorage();
    const kvs = UniKvs.config().appendStorage(storage).create();
    await kvs.open();

    const entered = Promise.withResolvers<void>();
    storage.onExistsStart = (key) => {
      if (key === "a") {
        entered.resolve();
      }
    };
    storage.gate("a");

    try {
      // 実行
      const pendingHasA = kvs.has("a");
      await entered.promise;
      const setB = kvs.set("b", "value");

      // 検証: 排他ロックにより set は has の完了待ちになる
      await expect(withTimeout(setB, 200, "set-b")).rejects.toThrow("TIMEOUT(set-b)");
      storage.ungate();
      await expect(setB).resolves.toBeUndefined();
      await expect(pendingHasA).resolves.toBe(false);
      await expect(kvs.get("b")).resolves.toBe("value");
    } finally {
      storage.ungate();
      await kvs.close();
    }
  });
});
