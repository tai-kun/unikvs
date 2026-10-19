/**
 * `CacheLike` のインメモリー疑似実装です。
 *
 * 要求 URL をキーにして応答ボディのバイト列を保持します。呼び出し記録は URL 符号化の表明に使います。
 */
import type { CacheLike } from "../src/cloudflare-cache.js";

export type RecordedCall = {
  readonly operation: "put" | "match" | "delete";
  readonly url: string;
};

export type FakeCacheOptions = {
  readonly failOn?: "put" | "match" | "delete" | undefined;
  readonly error?: unknown;
};

export type FakeCache = CacheLike & {
  readonly store: Map<string, Uint8Array>;
  readonly calls: RecordedCall[];
};

/**
 * 要求 URL をキーにする疑似 `Cache` を作ります。
 * 応答ボディは `arrayBuffer` で複製して保持します。
 */
export function createFakeCache(options: FakeCacheOptions = {}): FakeCache {
  const { failOn, error = new Error("fake cache failure") } = options;
  const store = new Map<string, Uint8Array>();
  const calls: RecordedCall[] = [];

  return {
    store,
    calls,
    put: async (request: Request, response: Response): Promise<void> => {
      calls.push({ operation: "put", url: request.url });

      if (failOn === "put") {
        throw error;
      }

      store.set(request.url, new Uint8Array(await response.arrayBuffer()));
    },
    match: async (request: Request): Promise<Response | undefined> => {
      calls.push({ operation: "match", url: request.url });

      if (failOn === "match") {
        throw error;
      }

      const found = store.get(request.url);

      if (found === undefined) {
        return undefined;
      }

      return new Response(found.slice(), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    },
    delete: async (request: Request): Promise<boolean> => {
      calls.push({ operation: "delete", url: request.url });

      if (failOn === "delete") {
        throw error;
      }

      return store.delete(request.url);
    },
  };
}
