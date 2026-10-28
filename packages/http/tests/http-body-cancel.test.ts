import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError, HttpResponseError, ClearNotSupportedError } from "../src/errors.js";
import Http, { type IFetch } from "../src/http.js";
import { fallbackResponse } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

/**
 * `cancel` の呼び出し回数を記録する応答を返す `fetch` を作ります。
 */
function createCancelTrackingFetch(status: number, counter: { calls: number }): IFetch {
  return async () =>
    fallbackResponse(status, () => {
      counter.calls += 1;
    });
}

describe("消費しない応答ボディの破棄", () => {
  test("write の成功時にボディを破棄する", async ({ expect }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(200, counter),
    });

    // 実行：
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(counter.calls).toBe(1);
  });

  test("write の失敗時にボディを破棄してから HttpResponseError を投げる", async ({ expect }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(500, counter),
    });

    // 実行：
    const error = await captureRejection(
      storage.write(
        createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(HttpResponseError);
    expect(counter.calls).toBe(1);
  });

  test("exists の HEAD 応答でもボディを破棄する", async ({ expect }) => {
    const cases = [
      {
        status: 200,
        expected: true,
      },
      {
        status: 404,
        expected: false,
      },
    ] as const;

    for (const { status, expected } of cases) {
      // 準備：
      const counter = { calls: 0 };
      const storage = new Http(baseUrl, {
        fetch: createCancelTrackingFetch(status, counter),
      });

      // 実行：
      await expect(
        storage.exists(
          createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(expected);

      // 検証：
      expect(counter.calls, String(status)).toBe(1);
    }
  });

  test("exists の HEAD 失敗時にボディを破棄してから HttpResponseError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(500, counter),
    });

    // 実行：
    const error = await captureRejection(
      storage.exists(
        createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(HttpResponseError);
    expect(counter.calls).toBe(1);
  });

  test("read の 404 時にボディを破棄してから KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(404, counter),
    });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("missing", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(counter.calls).toBe(1);
  });

  test("read の非 2xx 時にボディを破棄してから HttpResponseError を投げる", async ({ expect }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(500, counter),
    });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(HttpResponseError);
    expect(counter.calls).toBe(1);
  });

  test("delete の成功時と 404 時にボディを破棄する", async ({ expect }) => {
    for (const status of [204, 404]) {
      // 準備：
      const counter = { calls: 0 };
      const storage = new Http(baseUrl, {
        fetch: createCancelTrackingFetch(status, counter),
      });

      // 実行：
      await storage.delete(
        createDeleteContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
      );

      // 検証：
      expect(counter.calls, String(status)).toBe(1);
    }
  });

  test("delete の失敗時にボディを破棄してから HttpResponseError を投げる", async ({ expect }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(500, counter),
    });

    // 実行：
    const error = await captureRejection(
      storage.delete(
        createDeleteContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(HttpResponseError);
    expect(counter.calls).toBe(1);
  });

  test("clear の成功時にボディを破棄する", async ({ expect }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(204, counter),
    });

    // 実行：
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5000) }) as IStorage.ClearContext,
    );

    // 検証：
    expect(counter.calls).toBe(1);
  });

  test("clear の未対応応答時にボディを破棄してから ClearNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(405, counter),
    });

    // 実行：
    const error = await captureRejection(
      storage.clear(
        createClearContext("", { signal: AbortSignal.timeout(5000) }) as IStorage.ClearContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(ClearNotSupportedError);
    expect(counter.calls).toBe(1);
  });

  test("clear の一時失敗時にボディを破棄してから HttpResponseError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(500, counter),
    });

    // 実行：
    const error = await captureRejection(
      storage.clear(
        createClearContext("", { signal: AbortSignal.timeout(5000) }) as IStorage.ClearContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(HttpResponseError);
    expect(counter.calls).toBe(1);
  });

  test("getReadable の 404 時にボディを破棄してから KeyNotFoundError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(404, counter),
    });

    // 実行：
    const error = await captureRejection(
      storage.getReadable(
        createStreamContext("missing", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.GetReadableContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(counter.calls).toBe(1);
  });

  test("getWritable の close 失敗時にボディを破棄してから HttpResponseError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const counter = { calls: 0 };
    const storage = new Http(baseUrl, {
      fetch: createCancelTrackingFetch(500, counter),
    });
    const writer = storage
      .getWritable(
        createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行：
    const error = await captureRejection(writer.close());

    // 検証：
    expect(error).toBeInstanceOf(HttpResponseError);

    expect(counter.calls).toBe(1);
  });

  test("ボディ破棄の失敗は本来のエラーを覆さない", async ({ expect }) => {
    // 準備：
    const cause = new Error("cancel failed");
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const fetch: IFetch = async () =>
      ({
        ok: false,
        body: {
          cancel: (): Promise<void> => Promise.reject(cause),
        },
        status: 404,
        statusText: "Not Found",
      }) as unknown as Response;
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("missing", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).not.toBe(cause);
  });

  test("ボディ破棄の失敗は write の成功を覆さない", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const fetch: IFetch = async () =>
      ({
        ok: true,
        body: {
          cancel: (): Promise<void> => Promise.reject(new Error("cancel failed")),
        },
        status: 200,
        statusText: "OK",
      }) as unknown as Response;
    const storage = new Http(baseUrl, { fetch });

    // 実行と検証：
    await expect(
      storage.write(
        createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).resolves.toBeUndefined();
  });
});
