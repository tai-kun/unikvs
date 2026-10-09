import { ErrorBase, InvalidUsageErrorBase } from "@unikvs/core";
import { describe, test } from "vitest";

import {
  ClearNotSupportedError,
  ClearWithoutPrefixNotAllowedError,
  HttpNetworkError,
  HttpResponseError,
  InvalidBaseUrlError,
  InvalidChunkTypeError,
  InvalidHeadersError,
  InvalidKeyError,
  InvalidTokenError,
  KeyNotFoundError,
} from "../src/errors.js";

describe("エラークラスの name", () => {
  test("全クラスの name が Http 接頭辞で固定されている", ({ expect }) => {
    // 実行と検証
    expect(new InvalidBaseUrlError({ actual: "x" }).name).toBe("HttpInvalidBaseUrlError");
    expect(new InvalidHeadersError({ actual: "x" }).name).toBe("HttpInvalidHeadersError");
    expect(new InvalidTokenError({ actual: "x" }).name).toBe("HttpInvalidTokenError");
    expect(new InvalidKeyError({ key: "x" }).name).toBe("HttpInvalidKeyError");
    expect(new ClearWithoutPrefixNotAllowedError().name).toBe(
      "HttpClearWithoutPrefixNotAllowedError",
    );
    expect(new ClearNotSupportedError({ prefix: "p:", status: 405 }).name).toBe(
      "HttpClearNotSupportedError",
    );
    expect(new HttpNetworkError({ method: "GET", url: "https://x", key: "k" }).name).toBe(
      "HttpNetworkError",
    );
    expect(
      new HttpResponseError({
        method: "GET",
        url: "https://x",
        status: 500,
        statusText: "",
        key: "k",
      }).name,
    ).toBe("HttpResponseError");
    expect(new InvalidChunkTypeError({ key: "k", chunk: "x" }).name).toBe(
      "HttpInvalidChunkTypeError",
    );
  });

  test("KeyNotFoundError は core の定義を使う", ({ expect }) => {
    // 実行と検証
    expect(new KeyNotFoundError({ key: "k" }).name).toBe("UniKvsKeyNotFoundError");
  });
});

describe("エラークラスの継承", () => {
  test("値不正と通信系は ErrorBase を継承する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidBaseUrlError({ actual: "x" })).toBeInstanceOf(ErrorBase);
    expect(new InvalidHeadersError({ actual: "x" })).toBeInstanceOf(ErrorBase);
    expect(new InvalidTokenError({ actual: "x" })).toBeInstanceOf(ErrorBase);
    expect(new InvalidKeyError({ key: "x" })).toBeInstanceOf(ErrorBase);
    expect(new HttpNetworkError({ method: "GET", url: "https://x", key: "k" })).toBeInstanceOf(
      ErrorBase,
    );
    expect(
      new HttpResponseError({
        method: "GET",
        url: "https://x",
        status: 500,
        statusText: "",
        key: "k",
      }),
    ).toBeInstanceOf(ErrorBase);
    expect(new InvalidChunkTypeError({ key: "k", chunk: "x" })).toBeInstanceOf(ErrorBase);
  });

  test("非対応と禁止操作は InvalidUsageErrorBase を継承する", ({ expect }) => {
    // 実行と検証
    expect(new ClearWithoutPrefixNotAllowedError()).toBeInstanceOf(InvalidUsageErrorBase);
    expect(new ClearNotSupportedError({ prefix: "p:", status: 405 })).toBeInstanceOf(
      InvalidUsageErrorBase,
    );
  });

  test("全クラスが Error を継承する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidBaseUrlError({ actual: "x" })).toBeInstanceOf(Error);
    expect(new ClearWithoutPrefixNotAllowedError()).toBeInstanceOf(Error);
    expect(new ClearNotSupportedError({ prefix: "p:", status: 405 })).toBeInstanceOf(Error);
    expect(new HttpNetworkError({ method: "GET", url: "https://x", key: "k" })).toBeInstanceOf(
      Error,
    );
    expect(
      new HttpResponseError({
        method: "GET",
        url: "https://x",
        status: 500,
        statusText: "",
        key: "k",
      }),
    ).toBeInstanceOf(Error);
  });
});

describe("エラークラスの meta", () => {
  test("actual 系は受け取った値を保持する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidBaseUrlError({ actual: 42 }).meta).toStrictEqual({ actual: 42 });
    expect(new InvalidHeadersError({ actual: null }).meta).toStrictEqual({ actual: null });
    expect(new InvalidTokenError({ actual: "" }).meta).toStrictEqual({ actual: "" });
  });

  test("InvalidKeyError はキーを保持し cause を保持できる", ({ expect }) => {
    // 準備
    const cause = new URIError("bad");

    // 実行
    const error = new InvalidKeyError({ key: "k", cause });

    // 検証
    expect(error.meta).toStrictEqual({ key: "k" });
    expect(error.cause).toBe(cause);
  });

  test("ClearNotSupportedError は prefix と status を保持する", ({ expect }) => {
    // 実行と検証
    expect(new ClearNotSupportedError({ prefix: "a:", status: 501 }).meta).toStrictEqual({
      prefix: "a:",
      status: 501,
    });
  });

  test("HttpNetworkError は method と url と key と cause を保持する", ({ expect }) => {
    // 準備
    const cause = new TypeError("fetch failed");

    // 実行
    const error = new HttpNetworkError({ method: "PUT", url: "https://x/k", key: "k", cause });

    // 検証
    expect(error.meta).toStrictEqual({ method: "PUT", url: "https://x/k", key: "k" });
    expect(error.cause).toBe(cause);
  });

  test("clear 経路の HttpNetworkError は key が undefined である", ({ expect }) => {
    // 実行と検証
    expect(
      new HttpNetworkError({ method: "DELETE", url: "https://x/?prefix=a", key: undefined }).meta,
    ).toStrictEqual({ method: "DELETE", url: "https://x/?prefix=a", key: undefined });
  });

  test("HttpResponseError は通信情報を保持する", ({ expect }) => {
    // 実行と検証
    expect(
      new HttpResponseError({
        method: "GET",
        url: "https://x/k",
        status: 500,
        statusText: "Internal Server Error",
        key: "k",
      }).meta,
    ).toStrictEqual({
      method: "GET",
      url: "https://x/k",
      status: 500,
      statusText: "Internal Server Error",
      key: "k",
    });
  });

  test("InvalidChunkTypeError はキーとチャンクと型名を保持する", ({ expect }) => {
    // 準備
    const chunk = { invalid: true };

    // 実行
    const error = new InvalidChunkTypeError({ key: "k", chunk });

    // 検証
    expect(error.meta.key).toBe("k");
    expect(error.meta.chunk).toBe(chunk);
    expect(error.meta.chunkType).toBe("Object");
  });
});

describe("エラークラスの英語メッセージ", () => {
  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidBaseUrlError({ actual: "x" }).message).toBe(
      "`baseUrl` must be an absolute URL without query or fragment, but got x",
    );
    expect(new InvalidHeadersError({ actual: 42 }).message).toBe(
      "Expected headers to be an object with string values, but got 42",
    );
    expect(new InvalidTokenError({ actual: "" }).message).toBe(
      "Expected token to be a non-empty string, but got ",
    );
    expect(new InvalidKeyError({ key: "k" }).message).toBe(
      'Failed to encode key "k" as a URL path segment',
    );
    expect(new ClearWithoutPrefixNotAllowedError().message).toBe(
      "Refusing to clear without a key prefix. Set a non-empty keyPrefix or allowClearWithoutPrefix: true.",
    );
    expect(new ClearNotSupportedError({ prefix: "a:", status: 405 }).message).toBe(
      'Server does not support DELETE ?prefix= (prefix "a:", status 405). Implement prefix deletion on the server or stop calling clear.',
    );
    expect(new HttpNetworkError({ method: "PUT", url: "https://x/k", key: "k" }).message).toBe(
      "Failed to PUT https://x/k",
    );
    expect(
      new HttpResponseError({
        method: "GET",
        url: "https://x/k",
        status: 500,
        statusText: "Internal Server Error",
        key: "k",
      }).message,
    ).toBe("Request GET https://x/k failed with 500 Internal Server Error");
    expect(
      new HttpResponseError({
        method: "GET",
        url: "https://x/k",
        status: 500,
        statusText: "",
        key: "k",
      }).message,
    ).toBe("Request GET https://x/k failed with 500");
    expect(new InvalidChunkTypeError({ key: "k", chunk: "x" }).message).toBe(
      'Expected chunk for key "k" is Uint8Array<ArrayBuffer>, but got string',
    );
  });
});
