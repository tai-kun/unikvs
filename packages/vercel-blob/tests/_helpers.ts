/**
 * ネットワークを使わない `BlobClientLike` とダウンロード用 `fetch` の疑似実装です。
 *
 * pathname をキーにする `Map` バックで `put` / `head` / `del` / `list` を処理します。
 * 呼び出し記録は pathname 解決・トークン伝搬・頁分割の表明に使います。
 */
import type {
  IFetch,
  BlobClientLike,
  BlobCopyResult,
  BlobHeadResult,
  BlobListResult,
} from "../src/vercel-blob.js";

const FAKE_ORIGIN = "https://fake.blob";

export type RecordedClientCall =
  | {
      readonly token: string | undefined;
      readonly access: string;
      readonly pathname: string;
      readonly operation: "put";
    }
  | {
      readonly token: string | undefined;
      readonly pathname: string;
      readonly operation: "head";
    }
  | {
      readonly token: string | undefined;
      readonly access: string;
      readonly operation: "copy";
      readonly toPathname: string;
      readonly fromPathname: string;
    }
  | {
      readonly token: string | undefined;
      readonly operation: "del";
      readonly pathnames: readonly string[];
    }
  | {
      readonly token: string | undefined;
      readonly cursor: string | undefined;
      readonly prefix: string | undefined;
      readonly operation: "list";
    };

export type FakeBlobClientOptions = {
  readonly error?: unknown;
  readonly failOn?: "put" | "head" | "del" | "list" | "copy" | undefined;
  readonly pageSize?: number | undefined;
};

export type FakeBlobClient = BlobClientLike & {
  readonly calls: RecordedClientCall[];
  readonly store: Map<string, Uint8Array>;
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
  const { error = new Error("fake blob failure"), failOn, pageSize = 1000 } = options;
  const store = new Map<string, Uint8Array>();
  const calls: RecordedClientCall[] = [];

  return {
    del: async (pathname, delOptions): Promise<void> => {
      delOptions.abortSignal?.throwIfAborted();
      const pathnames = Array.isArray(pathname) ? [...pathname] : [pathname];
      calls.push({
        token: delOptions.token,
        operation: "del",
        pathnames,
      });

      if (failOn === "del") {
        throw error;
      }

      // 実 API の del は存在しない pathname でも成功するため、単に無視します。
      for (const target of pathnames) {
        store.delete(target);
      }
    },
    put: async (
      pathname,
      body,
      putOptions,
    ): Promise<{
      url: string;
      pathname: string;
    }> => {
      putOptions.abortSignal?.throwIfAborted();
      calls.push({
        token: putOptions.token,
        access: putOptions.access,
        pathname,
        operation: "put",
      });

      if (failOn === "put") {
        throw error;
      }

      // 実際のアップロードと同様に、本文の複製を非同期に行います。
      // 呼び出し元が送信中の配列を変更しても、保存値に影響しないことを検証できます。
      await Promise.resolve();
      store.set(pathname, body.slice());

      return {
        url: toFakeUrl(pathname),
        pathname,
      };
    },
    copy: async (fromUrlOrPathname, toPathname, copyOptions): Promise<BlobCopyResult> => {
      copyOptions.abortSignal?.throwIfAborted();
      calls.push({
        token: copyOptions.token,
        access: copyOptions.access,
        operation: "copy",
        toPathname,
        fromPathname: fromUrlOrPathname,
      });

      if (failOn === "copy") {
        throw error;
      }

      const source = store.get(fromUrlOrPathname);

      if (source === undefined) {
        throw createBlobNotFoundError();
      }

      await Promise.resolve();
      store.set(toPathname, source.slice());

      return {
        url: toFakeUrl(toPathname),
        pathname: toPathname,
      };
    },
    head: async (pathname, headOptions): Promise<BlobHeadResult> => {
      headOptions.abortSignal?.throwIfAborted();
      calls.push({
        token: headOptions.token,
        pathname,
        operation: "head",
      });

      if (failOn === "head") {
        throw error;
      }

      if (!store.has(pathname)) {
        throw createBlobNotFoundError();
      }

      return {
        url: toFakeUrl(pathname),
        pathname,
      };
    },
    list: async (listOptions): Promise<BlobListResult> => {
      listOptions.abortSignal?.throwIfAborted();
      calls.push({
        token: listOptions.token,
        cursor: listOptions.cursor,
        prefix: listOptions.prefix,
        operation: "list",
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
        blobs: slice.map((pathname) => ({
          url: toFakeUrl(pathname),
          pathname,
        })),
        cursor: next < matched.length ? String(next) : undefined,
        hasMore: next < matched.length,
      };
    },
    calls,
    store,
  };
}

export type RecordedDownload = {
  readonly url: string;
  readonly headers: Record<string, string>;
};

export type FakeDownloadOptions = {
  readonly status?: number | undefined;
  readonly failWith?: unknown;
  readonly statusText?: string | undefined;
};

export type FakeDownload = {
  readonly calls: RecordedDownload[];
  readonly fetch: IFetch;
};

/**
 * 疑似 Blob URL からバイト列を返す `fetch` を作ります。
 * `failWith` 指定時は要求自体を拒否し、`status` 指定時はその状態で応答します。
 */
export function createFakeDownload(
  store: Map<string, Uint8Array>,
  options: FakeDownloadOptions = {},
): FakeDownload {
  const { status, failWith, statusText } = options;
  const calls: RecordedDownload[] = [];

  const fetch: IFetch = async (request: Request): Promise<Response> => {
    request.signal.throwIfAborted();
    calls.push({
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
    });

    if (failWith !== undefined) {
      // oxlint-disable-next-line typescript/only-throw-error
      throw failWith;
    }

    if (status !== undefined) {
      return new Response(
        null,
        statusText === undefined
          ? { status }
          : {
              status,
              statusText,
            },
      );
    }

    const requestUrl = new URL(request.url);
    const pathname = fromFakeUrl(`${requestUrl.origin}${requestUrl.pathname}`);
    const found = pathname === undefined ? undefined : store.get(pathname);

    if (found === undefined) {
      return new Response(null, {
        status: 404,
        statusText: "Not Found",
      });
    }

    return new Response(found as Uint8Array<ArrayBuffer>, {
      status: 200,
      statusText: "OK",
    });
  };

  return {
    calls,
    fetch,
  };
}
