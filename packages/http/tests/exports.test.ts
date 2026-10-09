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
import Http, { type HttpOptions, type IFetch } from "../src/http.js";
import * as index from "../src/index.js";

const probe: IFetch = async (_request: Request) => new Response();

void probe;

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Http).toBe(Http);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidBaseUrlError).toBe(InvalidBaseUrlError);
    expect(index.InvalidHeadersError).toBe(InvalidHeadersError);
    expect(index.InvalidTokenError).toBe(InvalidTokenError);
    expect(index.InvalidKeyError).toBe(InvalidKeyError);
    expect(index.ClearWithoutPrefixNotAllowedError).toBe(ClearWithoutPrefixNotAllowedError);
    expect(index.ClearNotSupportedError).toBe(ClearNotSupportedError);
    expect(index.HttpNetworkError).toBe(HttpNetworkError);
    expect(index.HttpResponseError).toBe(HttpResponseError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
  });

  test("HttpOptions 型でインスタンスを組み立てられる", ({ expect }) => {
    // 準備
    const options: HttpOptions = { keyPrefix: "test:" };

    // 実行と検証
    expect(() => new Http("https://kv.example.com/store", options)).not.toThrow();
  });
});
