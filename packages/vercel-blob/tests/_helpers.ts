/**
 * ネットワークを使わない `BlobClientLike` とダウンロード用 `fetch` の疑似実装です。
 *
 * pathname をキーにする `Map` バックで `put` / `head` / `del` / `list` を処理します。
 * 呼び出し記録は pathname 解決・トークン伝搬・頁分割の表明に使います。
 */
import type { BlobClientLike, BlobHeadResult, BlobListResult, IFetch } from "../src/vercel-blob.js";

const FAKE_ORIGIN = "https://fake.blob";

export type RecordedClientCall =
  | {
      readonly operation: "put";
      readonly pathname: string;
      readonly token: string | undefined;
      readonly access: string;
    }
  | {
      readonly operation: "head";
      readonly pathname: string;
      readonly token: string | undefined;
    }
  | {
      readonly operation: "del";
      readonly pathnames: readonly string[];
      readonly token: string | undefined;
    }
  | {
      readonly operation: "list";
      readonly prefix: string | undefined;
      readonly cursor: string | undefined;
      readonly token: string | undefined;
    };

export type FakeBlobClientOptions = {
  readonly pageSize?: number | undefined;
  readonly failOn?: "put" | "head" | "del" | "list" | undefined;
  readonly error?: unknown;
};

export type FakeBlobClient = BlobClientLike & {
  readonly store: Map<string, Uint8Array>;
  readonly calls: RecordedClientCall[];
};

/**
 * 欠番を表す疑似エラーを作ります。
 * 実クライアントの `BlobNotFoundError` と同じ `name` を持ちます。
 */
export function createBlobNotFoundError(): Error {
  const error = new Error("The requested blob does not exist");
  error.name = "BlobNotFoundError";

  return error;
}

/**
 * pathname から疑似 Blob URL を組み立てます。
 */
export function toFakeUrl(pathname: string): string {
  return `${FAKE_ORIGIN}/${pathname}`;
}

/**
 * 疑似 URL から pathname を取り出します。一致しないときは `undefined` を返します。
 */
export function fromFakeUrl(url: string): string | undefined {
  return url.startsWith(`${FAKE_ORIGIN}/`) ? url.slice(FAKE_ORIGIN.length + 1) : undefined;
}

/**
 * インメモリーの疑似 `BlobClientLike` を作ります。
 * 頁分割は `pageSize` ごとに `cursor` で再開します。
 */
export function createFakeClient(options: FakeBlobClientOptions = {}): FakeBlobClient {
  const { pageSize = 1_000, failOn, error = new Error("fake blob failure") } = options;
  const store = new Map<string, Uint8Array>();
  const calls: RecordedClientCall[] = [];

  return {
    store,
    calls,
    put: async (pathname, body, putOptions): Promise<{ url: string; pathname: string }> => {
      putOptions.abortSignal?.throwIfAborted();
      calls.push({
        operation: "put",
        pathname,
        token: putOptions.token,
        access: putOptions.access,
      });

      if (failOn === "put") {
        throw error;
      }

      // 実際のアップロードと同様に、本文の複製を非同期に行います。
      // 呼び出し元が送信中の配列を変更しても、保存値に影響しないことを検証できます。
      await Promise.resolve();
      store.set(pathname, body.slice());

      return { url: toFakeUrl(pathname), pathname };
    },
    head: async (pathname, headOptions): Promise<BlobHeadResult> => {
      headOptions.abortSignal?.throwIfAborted();
      calls.push({ operation: "head", pathname, token: headOptions.token });

      if (failOn === "head") {
        throw error;
      }

      if (!store.has(pathname)) {
        throw createBlobNotFoundError();
      }

      return { url: toFakeUrl(pathname), pathname };
    },
    del: async (pathname, delOptions): Promise<void> => {
      delOptions.abortSignal?.throwIfAborted();
      const pathnames = Array.isArray(pathname) ? [...pathname] : [pathname];
      calls.push({ operation: "del", pathnames, token: delOptions.token });

      if (failOn === "del") {
        throw error;
      }

      // 実 API の del は存在しない pathname でも成功するため、単に無視します。
      for (const target of pathnames) {
        store.delete(target);
      }
    },
    list: async (listOptions): Promise<BlobListResult> => {
      listOptions.abortSignal?.throwIfAborted();
      calls.push({
        operation: "list",
        prefix: listOptions.prefix,
        cursor: listOptions.cursor,
        token: listOptions.token,
      });

      if (failOn === "list") {
        throw error;
      }

      const prefix = listOptions.prefix ?? "";
      const matched = [...store.keys()].filter((pathname) => pathname.startsWith(prefix));
      const start = listOptions.cursor === undefined ? 0 : Number(listOptions.cursor);
      const slice = matched.slice(start, start + pageSize);
      const next = start + pageSize;

      return {
        blobs: slice.map((pathname) => ({ url: toFakeUrl(pathname), pathname })),
        cursor: next < matched.length ? String(next) : undefined,
        hasMore: next < matched.length,
      };
    },
  };
}

export type RecordedDownload = {
  readonly url: string;
  readonly headers: Record<string, string>;
};

export type FakeDownloadOptions = {
  readonly failWith?: unknown;
  readonly status?: number | undefined;
  readonly statusText?: string | undefined;
};

export type FakeDownload = {
  readonly fetch: IFetch;
  readonly calls: RecordedDownload[];
};

/**
 * 疑似 Blob URL からバイト列を返す `fetch` を作ります。
 * `failWith` 指定時は要求自体を拒否し、`status` 指定時はその状態で応答します。
 */
export function createFakeDownload(
  store: Map<string, Uint8Array>,
  options: FakeDownloadOptions = {},
): FakeDownload {
  const { failWith, status, statusText } = options;
  const calls: RecordedDownload[] = [];

  const fetch: IFetch = async (request: Request): Promise<Response> => {
    request.signal.throwIfAborted();
    calls.push({
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
    });

    if (failWith !== undefined) {
      throw failWith;
    }

    if (status !== undefined) {
      return new Response(null, statusText === undefined ? { status } : { status, statusText });
    }

    const pathname = fromFakeUrl(request.url);
    const found = pathname === undefined ? undefined : store.get(pathname);

    if (found === undefined) {
      return new Response(null, { status: 404, statusText: "Not Found" });
    }

    return new Response(found as Uint8Array<ArrayBuffer>, {
      status: 200,
      statusText: "OK",
    });
  };

  return { fetch, calls };
}
