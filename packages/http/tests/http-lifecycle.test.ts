import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createCloseContext,
  createGetContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

describe("ライフサイクル", () => {
  test("open は signal 検証のみ行う", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.open(
      createOpenContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.OpenContext,
    );

    // 検証
    expect(calls.length).toBe(0);
    expect(storage.isOpen).toBe(true);
  });

  test("close は signal 検証のみ行う", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.close(
      createCloseContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.CloseContext,
    );

    // 検証
    expect(calls.length).toBe(0);
    expect(storage.isOpen).toBe(true);
  });

  test("中断済みシグナルの open は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.open(createOpenContext({ signal: abortedSignal() }) as IStorage.OpenContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
  });

  test("中断済みシグナルの close は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.close(createCloseContext({ signal: abortedSignal() }) as IStorage.CloseContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
  });

  test("open せずに直接操作できる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(
      await storage.read(
        createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1]));
  });

  test("並行 open と並行 close は安全に完了する", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await Promise.all([
      storage.open(
        createOpenContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.OpenContext,
      ),
      storage.open(
        createOpenContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.OpenContext,
      ),
      storage.close(
        createCloseContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.CloseContext,
      ),
      storage.close(
        createCloseContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.CloseContext,
      ),
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
      storage.write(
        createSetContext("k", { signal: abortedSignal(reason) }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    );

    // 検証
    expect(error).toBe(reason);
  });
});
