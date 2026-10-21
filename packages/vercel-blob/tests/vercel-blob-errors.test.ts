import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import {
  BlobNetworkError,
  BlobOperationError,
  BlobResponseError,
  InvalidTokenError,
  KeyNotFoundError,
} from "../src/errors.js";
import VercelBlob, { type BlobClientLike, type IFetch } from "../src/vercel-blob.js";
import { createFakeClient, createFakeDownload } from "./_helpers.js";

describe("トークンの解決", () => {
  test("token を渡したとき、クライアント操作とダウンロード要求に伝搬する", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const { fetch, calls } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch, token: "secret" });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.read(
      createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
    );

    // 検証
    expect(client.calls[0]).toMatchObject({ operation: "put", token: "secret" });
    expect(client.calls[1]).toMatchObject({ operation: "head", token: "secret" });
    expect(calls[0]?.headers["authorization"]).toBe("Bearer secret");
  });

  test("token がないとき、Authorization は付与されない", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const { fetch, calls } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.read(
      createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
    );

    // 検証
    expect(calls[0]?.headers["authorization"]).toBe(undefined);
  });

  test("固有 vars が共通 vars より優先される", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const { fetch, calls } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch, token: "base" });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.read(
      createGetContext("k", {
        signal: AbortSignal.timeout(5_000),
        values: {
          "@unikvs/fetch:token": "common",
          "@unikvs/vercel-blob:token": "specific",
        },
      }) as IStorage.ReadContext,
    );

    // 検証
    expect(client.calls.at(-1)).toMatchObject({ operation: "head", token: "specific" });
    expect(calls[0]?.headers["authorization"]).toBe("Bearer specific");
  });

  test("共通 vars が基底 token より優先される", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const { fetch, calls } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch, token: "base" });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.read(
      createGetContext("k", {
        signal: AbortSignal.timeout(5_000),
        values: { "@unikvs/fetch:token": "common" },
      }) as IStorage.ReadContext,
    );

    // 検証
    expect(client.calls.at(-1)).toMatchObject({ operation: "head", token: "common" });
    expect(calls[0]?.headers["authorization"]).toBe("Bearer common");
  });

  test("vars の token が空文字のとき、InvalidTokenError を投げる", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("k", {
          signal: AbortSignal.timeout(5_000),
          values: { "@unikvs/vercel-blob:token": "" },
        }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidTokenError);
  });

  test("token を渡したとき、delete と clear にも伝搬する", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch, token: "secret" });
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("k2", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.DeleteContext,
    );
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5_000) }) as IStorage.ClearContext,
    );

    // 検証
    const delCalls = client.calls.filter((call) => call.operation === "del");
    expect(delCalls.map((call) => call.token)).toStrictEqual(["secret", "secret"]);
    const listCalls = client.calls.filter((call) => call.operation === "list");
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]).toMatchObject({ operation: "list", prefix: "", token: "secret" });
  });
});

describe("クライアント失敗の包み直し", () => {
  test("put の失敗は原因を保持した BlobOperationError になる", async ({ expect }) => {
    // 準備
    const failure = new Error("fake put failure");
    const client = createFakeClient({ failOn: "put", error: failure });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });

    // 実行
    const error = await captureRejection(
      storage.write(
        createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({ operation: "put", key: "k" });
    expect((error as BlobOperationError).cause).toBe(failure);
  });

  test("read 時の head の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備
    const client = createFakeClient({ failOn: "head" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({ operation: "head", key: "k" });
  });

  test("exists 時の head の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備
    const client = createFakeClient({ failOn: "head" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });

    // 実行
    const error = await captureRejection(
      storage.exists(
        createHasContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobOperationError);
  });

  test("del の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備
    const client = createFakeClient({ failOn: "del" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    client.calls.length = 0;

    // 実行
    const error = await captureRejection(
      storage.delete(
        createDeleteContext("k", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.DeleteContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({ operation: "del", key: "k" });
  });

  test("clear 時の list の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備
    const client = createFakeClient({ failOn: "list" });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });

    // 実行
    const error = await captureRejection(
      storage.clear(
        createClearContext("", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.ClearContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({ operation: "list", key: undefined });
  });

  test("clear 時の del の失敗は BlobOperationError になる", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client, fetch });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const failingDel: BlobClientLike = {
      ...client,
      del: async () => {
        throw new Error("fake del failure");
      },
    };
    const failing = new VercelBlob({ client: failingDel, fetch });

    // 実行
    const error = await captureRejection(
      failing.clear(
        createClearContext("", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.ClearContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({ operation: "del", key: undefined });
  });
});

describe("ダウンロード失敗の包み直し", () => {
  test("要求自体の失敗は原因を保持した BlobNetworkError になる", async ({ expect }) => {
    // 準備
    const failure = new TypeError("fetch failed");
    const client = createFakeClient();
    const { store } = client;
    store.set("k", new Uint8Array([1]));
    const failingFetch: IFetch = async () => {
      throw failure;
    };
    const storage = new VercelBlob({ client, fetch: failingFetch });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobNetworkError);
    expect((error as BlobNetworkError).meta.key).toBe("k");
    expect((error as BlobNetworkError).cause).toBe(failure);
  });

  test("ダウンロード中の中断は BlobNetworkError にせず中断例外を投げる", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const client = createFakeClient();
    client.store.set("k", new Uint8Array([1]));
    let notifyDownloadStarted = (): void => {};
    const downloadStarted = new Promise<void>((resolve) => {
      notifyDownloadStarted = () => resolve();
    });
    const pendingFetch: IFetch = (request) => {
      notifyDownloadStarted();

      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), {
          once: true,
        });
      });
    };
    const storage = new VercelBlob({ client, fetch: pendingFetch });

    // 実行
    const pending = captureRejection(
      storage.read(createGetContext("k", { signal: controller.signal }) as IStorage.ReadContext),
    );
    await downloadStarted;
    controller.abort();

    // 検証
    const error = await pending;
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("失敗応答は BlobResponseError になる", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const { store } = client;
    store.set("k", new Uint8Array([1]));
    const badFetch: IFetch = async () =>
      new Response(null, { status: 500, statusText: "Internal Server Error" });
    const storage = new VercelBlob({ client, fetch: badFetch });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobResponseError);
    expect((error as BlobResponseError).meta).toMatchObject({ key: "k", status: 500 });
  });

  test("空の statusText でも BlobResponseError を組み立てられる", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    client.store.set("k", new Uint8Array([1]));
    const badFetch: IFetch = async () => new Response(null, { status: 500 });
    const storage = new VercelBlob({ client, fetch: badFetch });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobResponseError);
    expect((error as BlobResponseError).meta.statusText).toBe("");
  });
});

describe("欠番判定の互換性", () => {
  test("constructor 名での欠番は exists が false を返す", async ({ expect }) => {
    // 準備
    class BlobNotFoundError extends Error {}
    const client = createFakeClient();
    const missingHead: BlobClientLike = {
      ...client,
      head: async () => {
        throw new BlobNotFoundError("The requested blob does not exist");
      },
    };
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client: missingHead, fetch });

    // 実行
    const result = await storage.exists(
      createHasContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(false);
  });

  test("status での欠番は delete を成功扱いにする", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const missingDel: BlobClientLike = {
      ...client,
      del: async () => {
        throw Object.assign(new Error("not found"), { status: 404 });
      },
    };
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client: missingDel, fetch });

    // 実行と検証
    await expect(
      storage.delete(
        createDeleteContext("k", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.DeleteContext,
      ),
    ).resolves.toBeUndefined();
  });

  test("statusCode での欠番は read が KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const missingHead: BlobClientLike = {
      ...client,
      head: async () => {
        throw Object.assign(new Error("not found"), { statusCode: 404 });
      },
    };
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client: missingHead, fetch });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("オブジェクトでない失敗は欠番にせず BlobOperationError を投げる", async ({ expect }) => {
    // 準備
    const client = createFakeClient();
    const throwingHead: BlobClientLike = {
      ...client,
      head: async () => {
        throw "boom";
      },
    };
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({ client: throwingHead, fetch });

    // 実行
    const error = await captureRejection(
      storage.exists(
        createHasContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(BlobOperationError);
  });
});
