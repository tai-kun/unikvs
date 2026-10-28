import { type TestContextInit, TestContext } from "@unikvs/testing";

import type { R2BucketLike, R2ObjectsLike, R2ObjectBodyLike } from "../src/cloudflare-r2.js";

/**
 * テスト用のコピーコンテキストを作成します。
 * パイプライン変数や中断シグナルを引き継いだコンテキストを組み立てるために使用します。
 */
export function createCopyContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "copy",
    key,
    destinationKey,
  });
}

/**
 * テスト用の移動コンテキストを作成します。
 * パイプライン変数や中断シグナルを引き継いだコンテキストを組み立てるために使用します。
 */
export function createMoveContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "move",
    key,
    destinationKey,
  });
}

/**
 * テスト用のインメモリ R2 バケットです。
 *
 * 実バインディングと同じ `null` 契約 (`get`/`head` の未ヒットで `null`) を再現します。
 * `put` では入力を複写して実 R2 の値意味を再現します。
 */
export function createFakeBucket(): R2BucketLike & {
  readonly store: Map<string, Uint8Array<ArrayBuffer>>;
} {
  const store = new Map<string, Uint8Array<ArrayBuffer>>();

  const bucket: R2BucketLike = {
    async put(key, value) {
      store.set(key, value.slice());

      return { key };
    },

    async get(key): Promise<R2ObjectBodyLike | null> {
      const data = store.get(key);

      if (data === undefined) {
        return null;
      }

      const snapshot = data.slice();
      const body: R2ObjectBodyLike = {
        key,
        async arrayBuffer(): Promise<ArrayBuffer> {
          const buffer = new ArrayBuffer(snapshot.byteLength);
          new Uint8Array(buffer).set(snapshot);

          return buffer;
        },
      };

      return body;
    },

    async head(key) {
      return store.has(key) ? { key } : null;
    },

    async delete(keys) {
      const targets = typeof keys === "string" ? [keys] : keys;

      for (const target of targets) {
        store.delete(target);
      }
    },

    async list(options = {}): Promise<R2ObjectsLike> {
      const { limit = 1000, cursor, prefix = "" } = options;
      // 実 R2 の `limit` は最大 1000 件です。
      const pageSize = Math.min(limit, 1000);
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort();
      // 実 R2 のカーソルは不透明ですが、列挙は前ページの最後のキーより後ろから再開します。
      // キー基準のカーソルでその意味論を再現し、削除しながらの列挙でもずれないようにします。
      const start =
        cursor === undefined
          ? 0
          : ((): number => {
              const index = keys.findIndex((key) => key > cursor);

              return index === -1 ? keys.length : index;
            })();
      const page = keys.slice(start, start + pageSize);
      const truncated = start + page.length < keys.length;

      return {
        objects: page.map((key) => ({ key })),
        truncated,
        ...(truncated ? { cursor: page.at(-1) } : {}),
      };
    },
  };

  return Object.assign(bucket, { store });
}
