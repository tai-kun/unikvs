/**
 * モック `fetch` 疑似サーバーの共通部品です。
 *
 * `Map` バックで `PUT` / `GET` / `HEAD` / `DELETE` + `?prefix=` を処理します。
 * 呼び出し記録は URL 符号化の表明に使います。
 */
import type { IFetch } from "../src/http.js";

export type RecordedCall = {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
};

export type MockServerOptions = {
  readonly baseUrl?: string | undefined;
  readonly keyPrefix?: string | undefined;
  readonly headNotSupported?: boolean | undefined;
  readonly clearNotSupported?: boolean | undefined;
};

export type MockServer = {
  readonly fetch: IFetch;
  readonly store: Map<string, Uint8Array>;
  readonly calls: RecordedCall[];
  readonly baseUrl: string;
  readonly keyPrefix: string;
};

/**
 * 疑似サーバーとして振る舞う `fetch` 関数を作ります。
 * 中断済みシグナルでは `throwIfAborted` で拒否します。
 */
export function createMockServer(options: MockServerOptions = {}): MockServer {
  const { baseUrl = "https://kv.example.com/store", keyPrefix = "unikvs:" } = options;
  const { headNotSupported = false, clearNotSupported = false } = options;
  const store = new Map<string, Uint8Array>();
  const calls: RecordedCall[] = [];

  const fetch: IFetch = async (request: Request) => {
    request.signal.throwIfAborted();

    const url = request.url;
    const method = request.method;
    const headers = Object.fromEntries(request.headers.entries());
    calls.push({ method, url, headers });

    const parsed = new URL(url);

    if (method === "DELETE" && parsed.searchParams.has("prefix")) {
      if (clearNotSupported) {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      const prefix = parsed.searchParams.get("prefix") ?? "";

      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          store.delete(key);
        }
      }

      return new Response(null, { status: 204, statusText: "No Content" });
    }

    const segment = url.slice(`${baseUrl}/`.length);
    const storageKey = decodeURIComponent(segment);

    if (method === "PUT") {
      const bytes = new Uint8Array(await request.arrayBuffer());
      store.set(storageKey, bytes);

      return new Response(null, { status: 200, statusText: "OK" });
    }

    if (method === "HEAD") {
      if (headNotSupported) {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      return store.has(storageKey)
        ? new Response(null, { status: 200, statusText: "OK" })
        : new Response(null, { status: 404, statusText: "Not Found" });
    }

    if (method === "DELETE") {
      if (storageKey !== "" && store.has(storageKey)) {
        store.delete(storageKey);

        return new Response(null, { status: 204, statusText: "No Content" });
      }

      return new Response(null, { status: 404, statusText: "Not Found" });
    }

    const found = store.get(storageKey);

    if (found === undefined) {
      return new Response(null, { status: 404, statusText: "Not Found" });
    }

    return new Response(found as Uint8Array<ArrayBuffer>, { status: 200, statusText: "OK" });
  };

  return { fetch, store, calls, baseUrl, keyPrefix };
}

/**
 * 応答ボディなしの失敗応答を作ります。
 * `statusText` の空文字分岐の検証に使います。
 */
export function errorResponse(status: number, statusText: string): Response {
  return { ok: false, status, statusText, body: null } as unknown as Response;
}

/**
 * `cancel` の呼び出しを記録するフォールバック応答を作ります。
 * `body` が `null` の分岐の検証にも使います。
 */
export function fallbackResponse(
  status: number,
  onCancel?: () => void,
  bodyNull = false,
): Response {
  if (bodyNull) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "OK",
      body: null,
    } as unknown as Response;
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    body: {
      cancel: async (): Promise<void> => {
        onCancel?.();
      },
    },
  } as unknown as Response;
}

/**
 * `cancel` が拒否するフォールバック応答を作ります。
 * 破棄失敗の伝播の検証に使います。
 */
export function rejectingFallbackResponse(status: number, error: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    body: {
      cancel: async (): Promise<void> => {
        throw error;
      },
    },
  } as unknown as Response;
}

/**
 * 投げた非同期エラーを拒否理由として返します。
 * 実際に投げられたエラーの種類とメタ情報を検証するために使用します。
 */
export async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Promise が拒否されませんでした");
}

/**
 * 常に中断済みのシグナルを返します。
 * 入口の中断検証の検証に使用します。
 */
export function abortedSignal(reason?: unknown): AbortSignal {
  const controller = new AbortController();

  controller.abort(reason);

  return controller.signal;
}
