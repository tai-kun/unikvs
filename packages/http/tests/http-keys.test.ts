import { describe, test } from "vitest";

import { InvalidKeyError } from "../src/errors.js";
import Http from "../src/http.js";
import { captureRejection, createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

/**
 * 記録された呼び出し URL から末尾セグメントを取り出します。
 * 符号化の表明に使用します。
 */
function lastSegment(url: string): string {
  return url.slice(`${baseUrl}/`.length);
}

describe("キーの符号化", () => {
  test("任意文字列のキーを保存したとき、元のキーで取得できる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const keys = ["a/b", "a:b", "あいう", "🔑", "a b", "a?b", "a#b", "..", "../escape", "a\nb"];

    // 実行
    for (const [index, key] of keys.entries()) {
      await storage.write({
        key,
        data: new Uint8Array([index]),
        signal: AbortSignal.timeout(5_000),
        vars: {},
      });
    }

    // 検証
    for (const [index, key] of keys.entries()) {
      const result = await storage.read({ key, signal: AbortSignal.timeout(5_000), vars: {} });
      expect(result).toStrictEqual(new Uint8Array([index]));
    }
  });

  test("キー全体が単一パスセグメントとして符号化される", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.write({
      key: "a/b:c",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(calls[0]?.url).toBe(`${baseUrl}/${encodeURIComponent("unikvs:a/b:c")}`);
    expect(lastSegment(calls[0]?.url ?? "")).not.toContain("/");
  });

  test("ドットを含むキーは %2E に符号化される", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.write({
      key: "a.b",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(calls[0]?.url).toContain("%2E");
    expect(lastSegment(calls[0]?.url ?? "")).not.toContain(".");
    expect(decodeURIComponent(lastSegment(calls[0]?.url ?? ""))).toBe("unikvs:a.b");
  });

  test("空文字キーを使用しても、clear の ?prefix= と衝突しない", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.write({
      key: "",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(calls[0]?.url).toBe(`${baseUrl}/${encodeURIComponent("unikvs:")}`);
    expect(calls[0]?.url).not.toContain("?prefix=");
    expect(
      await storage.read({ key: "", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toStrictEqual(new Uint8Array([1]));
  });

  test("lone-surrogate を含むキーは InvalidKeyError を投げる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.write({
        key: "\uD800",
        data: new Uint8Array([1]),
        signal: AbortSignal.timeout(5_000),
        vars: {},
      }),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidKeyError);
    expect((error as InvalidKeyError).meta).toStrictEqual({ key: "\uD800" });
    expect((error as InvalidKeyError).cause).toBeInstanceOf(URIError);
  });

  test("lone-surrogate を含むキーの read は InvalidKeyError を投げる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.read({ key: "\uD800", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidKeyError);
  });
});
