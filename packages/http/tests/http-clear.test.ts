import { describe, test } from "vitest";

import {
  ClearNotSupportedError,
  ClearWithoutPrefixNotAllowedError,
  HttpResponseError,
  InvalidKeyError,
} from "../src/errors.js";
import Http, { type IFetch } from "../src/http.js";
import { abortedSignal, captureRejection, createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

describe("clear の振る舞い", () => {
  test("?prefix= 付き DELETE を送り、prefix 配下のみ消去する", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    await storage.write({
      key: "k1",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 実行
    await storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(calls.at(-1)?.method).toBe("DELETE");
    expect(calls.at(-1)?.url).toBe(`${baseUrl}/?prefix=${encodeURIComponent("unikvs:")}`);
    expect(await storage.exists({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      false,
    );
  });

  test("異なる prefix の値は消去されない", async ({ expect }) => {
    // 準備
    const server = createMockServer();
    const storageA = new Http(baseUrl, { fetch: server.fetch, keyPrefix: "a:" });
    const storageB = new Http(baseUrl, { fetch: server.fetch, keyPrefix: "b:" });
    await storageA.write({
      key: "k1",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });
    await storageB.write({
      key: "k1",
      data: new Uint8Array([2]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 実行
    await storageA.clear({ signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(await storageA.exists({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      false,
    );
    expect(await storageB.exists({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      true,
    );
  });

  test("空 prefix の既定では送信前に拒否する", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer({ keyPrefix: "" });
    const storage = new Http(baseUrl, { fetch, keyPrefix: "" });

    // 実行
    const error = await captureRejection(
      storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(ClearWithoutPrefixNotAllowedError);
    expect(calls.length).toBe(0);
  });

  test("空 prefix でも中断済みならガードが signal より先に評価される", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer({ keyPrefix: "" });
    const storage = new Http(baseUrl, { fetch, keyPrefix: "" });

    // 実行
    const error = await captureRejection(storage.clear({ signal: abortedSignal(), vars: {} }));

    // 検証
    expect(error).toBeInstanceOf(ClearWithoutPrefixNotAllowedError);
  });

  test("allowClearWithoutPrefix では空 prefix でも送信する", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer({ keyPrefix: "" });
    const storage = new Http(baseUrl, { fetch, keyPrefix: "", allowClearWithoutPrefix: true });

    // 実行
    await storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe(`${baseUrl}/?prefix=`);
  });

  test("未対応の 404・405・501 は ClearNotSupportedError を投げる", async ({ expect }) => {
    // 準備と実行と検証
    for (const status of [404, 405, 501]) {
      const failingFetch: IFetch = async () =>
        new Response(null, { status, statusText: "Unsupported" });
      const storage = new Http(baseUrl, { fetch: failingFetch });
      const error = await captureRejection(
        storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} }),
      );

      expect(error).toBeInstanceOf(ClearNotSupportedError);
      expect((error as ClearNotSupportedError).meta).toStrictEqual({
        prefix: "unikvs:",
        status,
      });
    }
  });

  test("?prefix= 未対応モードの clear は ClearNotSupportedError を投げる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer({ clearNotSupported: true });
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(ClearNotSupportedError);
  });

  test("一時失敗の 500 は HttpResponseError を投げる", async ({ expect }) => {
    // 準備
    const failingFetch: IFetch = async () =>
      new Response(null, { status: 500, statusText: "Internal Server Error" });
    const storage = new Http(baseUrl, { fetch: failingFetch });

    // 実行
    const error = await captureRejection(
      storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
    expect((error as HttpResponseError).meta.key).toBe(undefined);
  });

  test("lone-surrogate の keyPrefix では InvalidKeyError を投げる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch, keyPrefix: "\uD800" });

    // 実行
    const error = await captureRejection(
      storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidKeyError);
    expect((error as InvalidKeyError).meta).toStrictEqual({ key: "\uD800" });
  });
});
