import { describe, test } from "vitest";

import Http from "../src/http.js";
import { abortedSignal, captureRejection, createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

describe("ライフサイクル", () => {
  test("open は signal 検証のみ行う", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.open({ signal: AbortSignal.timeout(5_000) });

    // 検証
    expect(calls.length).toBe(0);
    expect(storage.isOpen).toBe(true);
  });

  test("close は signal 検証のみ行う", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.close({ signal: AbortSignal.timeout(5_000) });

    // 検証
    expect(calls.length).toBe(0);
    expect(storage.isOpen).toBe(true);
  });

  test("中断済みシグナルの open は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(storage.open({ signal: abortedSignal() }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
  });

  test("中断済みシグナルの close は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(storage.close({ signal: abortedSignal() }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
  });

  test("open せずに直接操作できる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.write({
      key: "k",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(
      await storage.read({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toStrictEqual(new Uint8Array([1]));
  });

  test("並行 open と並行 close は安全に完了する", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await Promise.all([
      storage.open({ signal: AbortSignal.timeout(5_000) }),
      storage.open({ signal: AbortSignal.timeout(5_000) }),
      storage.close({ signal: AbortSignal.timeout(5_000) }),
      storage.close({ signal: AbortSignal.timeout(5_000) }),
    ]);

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("カスタム reason の中断は reason のまま伝播する", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const reason = new Error("custom-abort");

    // 実行
    const error = await captureRejection(
      storage.write({
        key: "k",
        data: new Uint8Array([1]),
        signal: abortedSignal(reason),
        vars: {},
      }),
    );

    // 検証
    expect(error).toBe(reason);
  });
});
