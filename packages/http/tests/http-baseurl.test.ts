import { describe, test } from "vitest";

import { InvalidBaseUrlError } from "../src/errors.js";
import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

describe("baseUrl の検証", () => {
  test("末尾のスラッシュは除去して正規化される", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer({ baseUrl: "https://kv.example.com/store" });
    const storage = new Http("https://kv.example.com/store///", { fetch });

    // 実行
    await storage.write({
      key: "k",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(calls.length).toBe(1);
    expect(calls[0]?.url.startsWith("https://kv.example.com/store/")).toBe(true);
  });

  test("非 string の baseUrl は InvalidBaseUrlError を投げる", ({ expect }) => {
    // 実行と検証
    for (const actual of [42, null, undefined, {}, ["https://x"]]) {
      expect(() => new Http(actual as unknown as string)).toThrow(InvalidBaseUrlError);
      try {
        new Http(actual as unknown as string);
      } catch (error) {
        expect((error as InvalidBaseUrlError).meta).toStrictEqual({ actual });
      }
    }
  });

  test("前後空白を含む baseUrl は InvalidBaseUrlError を投げる", ({ expect }) => {
    // 実行と検証
    expect(() => new Http(" https://kv.example.com/store")).toThrow(InvalidBaseUrlError);
    expect(() => new Http("https://kv.example.com/store ")).toThrow(InvalidBaseUrlError);
    expect(() => new Http("https://kv.example.com/store\n")).toThrow(InvalidBaseUrlError);
  });

  test("空文字の baseUrl は InvalidBaseUrlError を投げる", ({ expect }) => {
    // 実行と検証
    expect(() => new Http("")).toThrow(InvalidBaseUrlError);
  });

  test("スラッシュのみの baseUrl は InvalidBaseUrlError を投げる", ({ expect }) => {
    // 実行と検証
    expect(() => new Http("/")).toThrow(InvalidBaseUrlError);
    expect(() => new Http("///")).toThrow(InvalidBaseUrlError);
  });

  test("相対 URL の baseUrl は InvalidBaseUrlError を投げる", ({ expect }) => {
    // 実行と検証
    expect(() => new Http("store")).toThrow(InvalidBaseUrlError);
    expect(() => new Http("/store")).toThrow(InvalidBaseUrlError);
    expect(() => new Http("://bad")).toThrow(InvalidBaseUrlError);
  });

  test("query 付きの baseUrl は InvalidBaseUrlError を投げる", ({ expect }) => {
    // 実行と検証
    expect(() => new Http("https://kv.example.com/store?x=1")).toThrow(InvalidBaseUrlError);
  });

  test("fragment 付きの baseUrl は InvalidBaseUrlError を投げる", ({ expect }) => {
    // 実行と検証
    expect(() => new Http("https://kv.example.com/store#frag")).toThrow(InvalidBaseUrlError);
  });

  test("query と fragment の両方付きは InvalidBaseUrlError を投げる", ({ expect }) => {
    // 実行と検証
    expect(() => new Http("https://kv.example.com/store?x=1#frag")).toThrow(InvalidBaseUrlError);
  });

  test("http と https の両方を受け付ける", ({ expect }) => {
    // 準備
    const { fetch } = createMockServer({ baseUrl: "http://localhost:8080/s" });

    // 実行と検証
    expect(() => new Http("http://localhost:8080/s", { fetch })).not.toThrow();
    expect(() => new Http("https://kv.example.com/store", { fetch })).not.toThrow();
  });

  test("検証順序は型が空白より先である", ({ expect }) => {
    // 実行
    let meta: unknown;

    try {
      new Http(42 as unknown as string);
    } catch (error) {
      meta = (error as InvalidBaseUrlError).meta;
    }

    // 検証
    expect(meta).toStrictEqual({ actual: 42 });
  });
});
