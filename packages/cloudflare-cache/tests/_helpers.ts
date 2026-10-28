/**
 * `CacheLike` のインメモリー疑似実装です。
 *
 * 要求 URL をキーにして応答ボディのバイト列を保持します。呼び出し記録は URL 符号化の表明に使います。
 */
import type { CacheLike } from "../src/cloudflare-cache.js";

export type RecordedCall = {
  readonly url: string;
  readonly operation: "put" | "match" | "delete";
};

export type FakeCacheOptions = {
  readonly error?: unknown;
  readonly failOn?: "put" | "match" | "delete" | undefined;
};

export type FakeCache = CacheLike & {
  readonly calls: RecordedCall[];
  readonly store: Map<string, Uint8Array>;
};

/**
 * 要求 URL をキーにする疑似 `Cache` を作ります。
 * 応答ボディは `arrayBuffer` で複製して保持します。
 */
export function createFakeCache(options: FakeCacheOptions = {}): FakeCache {
  const { error = new Error("fake cache failure"), failOn } = options;
  const store = new Map<string, Uint8Array>();
  const calls: RecordedCall[] = [];

  return {
    put: async (request: Request, response: Response): Promise<void> => {
      calls.push({
        url: request.url,
        operation: "put",
      });

      if (failOn === "put") {
        throw error;
      }

      store.set(request.url, new Uint8Array(await response.arrayBuffer()));
    },
    calls,
    match: async (request: Request): Promise<Response | undefined> => {
      calls.push({
        url: request.url,
        operation: "match",
      });

      if (failOn === "match") {
        throw error;
      }

      const found = store.get(request.url);
      let response: Response | undefined;

      if (found === undefined) {
        response = undefined;
      } else {
        response = new Response(found.slice(), {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }

      return response;
    },
    store,
    delete: async (request: Request): Promise<boolean> => {
      calls.push({
        url: request.url,
        operation: "delete",
      });

      if (failOn === "delete") {
        throw error;
      }

      return store.delete(request.url);
    },
  };
}
