import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import {
  BlobNetworkError,
  KeyNotFoundError,
  BlobResponseError,
  InvalidTokenError,
  BlobOperationError,
} from "../src/errors.js";
import VercelBlob, { type IFetch, type BlobClientLike } from "../src/vercel-blob.js";
import { createFakeClient, createFakeDownload } from "./_helpers.js";

describe("トークンの解決", () => {
  test("token を渡したとき、クライアント操作とダウンロード要求に伝搬する", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { calls, fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      token: "secret",
      client,
    });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    await storage.read(
      createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(client.calls[0]).toMatchObject({
      token: "secret",
      operation: "put",
    });
    expect(client.calls[1]).toMatchObject({
      token: "secret",
      operation: "head",
    });
    expect(calls[0]?.headers["authorization"]).toBe("Bearer secret");
  });

  test("token がないとき、Authorization は付与されない", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { calls, fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    await storage.read(
      createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(calls[0]?.headers["authorization"]).toBe(undefined);
  });

  test("固有 vars が共通 vars より優先される", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { calls, fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      token: "base",
      client,
    });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    await storage.read(
      createGetContext("k", {
        signal: AbortSignal.timeout(5000),
        values: {
          "@unikvs/fetch:token": "common",
          "@unikvs/vercel-blob:token": "specific",
        },
      }) as IStorage.ReadContext,
    );

    // 検証：
    expect(client.calls.at(-1)).toMatchObject({
      token: "specific",
      operation: "head",
    });
    expect(calls[0]?.headers["authorization"]).toBe("Bearer specific");
  });

  test("共通 vars が基底 token より優先される", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { calls, fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      token: "base",
      client,
    });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    await storage.read(
      createGetContext("k", {
        signal: AbortSignal.timeout(5000),
        values: { "@unikvs/fetch:token": "common" },
      }) as IStorage.ReadContext,
    );

    // 検証：
    expect(client.calls.at(-1)).toMatchObject({
      token: "common",
      operation: "head",
    });
    expect(calls[0]?.headers["authorization"]).toBe("Bearer common");
  });

  test("vars の token が空文字のとき、InvalidTokenError を投げる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", {
          signal: AbortSignal.timeout(5000),
          values: { "@unikvs/vercel-blob:token": "" },
        }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(InvalidTokenError);
  });

  test("token を渡したとき、delete と clear にも伝搬する", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      token: "secret",
      client,
    });
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("k2", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
    );
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5000) }) as IStorage.ClearContext,
    );

    // 検証：
    const delCalls = client.calls.filter((call) => call.operation === "del");
    expect(delCalls.map((call) => call.token)).toStrictEqual(["secret", "secret"]);

    const listCalls = client.calls.filter((call) => call.operation === "list");
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]).toMatchObject({
      token: "secret",
      prefix: "",
      operation: "list",
    });
  });
});

describe("クライアント失敗の包み直し", () => {
  test("put の失敗は原因を保持した BlobOperationError になる", async ({ expect }) => {
    // 準備：
    const failure = new Error("fake put failure");
    const client = createFakeClient({
      error: failure,
      failOn: "put",
    });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.write(
        createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({
      key: "k",
      operation: "put",
    });
    expect((error as BlobOperationError).cause).toBe(failure);
  });

  test("read 時の head の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient({ failOn: "head" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({
      key: "k",
      operation: "head",
    });
  });

  test("exists 時の head の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient({ failOn: "head" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.exists(
        createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobOperationError);
  });

  test("del の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient({ failOn: "del" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    client.calls.length = 0;

    // 実行：
    const error = await captureRejection(
      storage.delete(
        createDeleteContext("k", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.DeleteContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({
      key: "k",
      operation: "del",
    });
  });

  test("clear 時の list の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient({ failOn: "list" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.clear(
        createClearContext("", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.ClearContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({
      key: undefined,
      operation: "list",
    });
  });

  test("clear 時の del の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    const failingDel: BlobClientLike = {
      ...client,
      del: async () => {
        throw new Error("fake del failure");
      },
    };
    const failing = new VercelBlob({
      fetch,
      client: failingDel,
    });

    // 実行：
    const error = await captureRejection(
      failing.clear(
        createClearContext("", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.ClearContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({
      key: undefined,
      operation: "del",
    });
  });
});

describe("ダウンロード失敗の包み直し", () => {
  test("要求自体の失敗は原因を保持した BlobNetworkError になる", async ({ expect }) => {
    // 準備：
    const failure = new TypeError("fetch failed");
    const client = createFakeClient();
    const { store } = client;
    store.set("k", new Uint8Array([1]));

    const failingFetch: IFetch = async () => {
      throw failure;
    };
    const storage = new VercelBlob({
      fetch: failingFetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobNetworkError);
    expect((error as BlobNetworkError).meta.key).toBe("k");
    expect((error as BlobNetworkError).cause).toBe(failure);
  });

  test("ダウンロード中の中断は BlobNetworkError にせず中断例外を投げる", async ({ expect }) => {
    // 準備：
    const controller = new AbortController();
    const client = createFakeClient();
    client.store.set("k", new Uint8Array([1]));

    // oxlint-disable-next-line unicorn/consistent-function-scoping
    let notifyDownloadStarted = (): void => {};
    const downloadStarted = new Promise<void>((resolve) => {
      notifyDownloadStarted = (): void => {
        resolve();
      };
    });
    const pendingFetch: IFetch = (request) => {
      notifyDownloadStarted();

      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener(
          "abort",
          () => {
            reject(request.signal.reason);
          },
          {
            once: true,
          },
        );
      });
    };
    const storage = new VercelBlob({
      fetch: pendingFetch,
      client,
    });

    // 実行：
    const pending = captureRejection(
      storage.read(createGetContext("k", { signal: controller.signal }) as IStorage.ReadContext),
    );
    await downloadStarted;

    controller.abort();

    // 検証：
    const error = await pending;
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("失敗応答は BlobResponseError になる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { store } = client;
    store.set("k", new Uint8Array([1]));

    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const badFetch: IFetch = async () =>
      new Response(null, {
        status: 500,
        statusText: "Internal Server Error",
      });
    const storage = new VercelBlob({
      fetch: badFetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobResponseError);
    expect((error as BlobResponseError).meta).toMatchObject({
      key: "k",
      status: 500,
    });
  });

  test("失敗応答のボディーを破棄する", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    client.store.set("k", new Uint8Array([1]));

    let canceled = false;
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const badFetch: IFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array<ArrayBuffer>>({
          cancel() {
            canceled = true;
          },
        }),
        {
          status: 500,
          statusText: "Internal Server Error",
        },
      );
    const storage = new VercelBlob({
      fetch: badFetch,
      client,
    });

    // 実行と検証：
    await expect(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).rejects.toBeInstanceOf(BlobResponseError);
    expect(canceled).toBe(true);
  });

  test("空の statusText でも BlobResponseError を組み立てられる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    client.store.set("k", new Uint8Array([1]));

    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const badFetch: IFetch = async () => new Response(null, { status: 500 });
    const storage = new VercelBlob({
      fetch: badFetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobResponseError);
    expect((error as BlobResponseError).meta.statusText).toBe("");
  });
});

describe("欠番判定の互換性", () => {
  test("constructor 名での欠番は exists が false を返す", async ({ expect }) => {
    // 準備：
    class BlobNotFoundError extends Error {}

    const client = createFakeClient();
    const missingHead: BlobClientLike = {
      ...client,
      head: async () => {
        throw new BlobNotFoundError("The requested blob does not exist");
      },
    };
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client: missingHead,
    });

    // 実行：
    const result = await storage.exists(
      createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(result).toBe(false);
  });

  test("status での欠番は delete を成功扱いにする", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const missingDel: BlobClientLike = {
      ...client,
      del: async () => {
        throw Object.assign(new Error("not found"), { status: 404 });
      },
    };
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client: missingDel,
    });

    // 実行と検証：
    await expect(
      storage.delete(
        createDeleteContext("k", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.DeleteContext,
      ),
    ).resolves.toBeUndefined();
  });

  test("statusCode での欠番は read が KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const missingHead: BlobClientLike = {
      ...client,
      head: async () => {
        throw Object.assign(new Error("not found"), { statusCode: 404 });
      },
    };
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client: missingHead,
    });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("オブジェクトでない失敗は欠番にせず BlobOperationError を投げる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const throwingHead: BlobClientLike = {
      ...client,
      head: async () => {
        // oxlint-disable-next-line typescript/only-throw-error
        throw "boom";
      },
    };
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client: throwingHead,
    });

    // 実行：
    const error = await captureRejection(
      storage.exists(
        createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobOperationError);
  });
});
