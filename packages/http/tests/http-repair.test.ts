import { RepairNotAllowedError } from "@unikvs/core";
import { describe, test } from "vitest";

import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

describe("Http - 書き戻しの許可", () => {
  test("既定では書き戻しを拒否する", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行と検証
    expect(storage.allowRepair).toBe(false);
    await expect(
      storage.write({
        key: "a",
        data: new Uint8Array([1]),
        signal: AbortSignal.timeout(5_000),
        vars: { "unikvs:repair": true },
      }),
    ).rejects.toThrow(RepairNotAllowedError);
    expect(await storage.exists({ key: "a", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      false,
    );
  });

  test("allowRepair: true では書き戻しを受け付ける", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch, allowRepair: true });

    // 実行
    expect(storage.allowRepair).toBe(true);
    await storage.write({
      key: "a",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: { "unikvs:repair": true },
    });

    // 検証
    expect(
      await storage.read({ key: "a", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toStrictEqual(new Uint8Array([1]));
  });

  test("allowRepair: false でも通常の write は受け付ける", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch, allowRepair: false });

    // 実行
    await storage.write({
      key: "a",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(
      await storage.read({ key: "a", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toStrictEqual(new Uint8Array([1]));
  });

  test("allowRepair: false では書き戻しの getWritable を拒否する", ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch, allowRepair: false });

    // 実行と検証
    expect(() =>
      storage.getWritable({
        key: "a",
        signal: AbortSignal.timeout(5_000),
        vars: { "unikvs:repair": true },
      }),
    ).toThrow(RepairNotAllowedError);
  });

  test("中断済みと書き戻し違反が同時成立したとき、中断例外を優先する", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.write({
        key: "a",
        data: new Uint8Array([1]),
        signal: controller.signal,
        vars: { "unikvs:repair": true },
      }),
    ).rejects.toThrow(DOMException);
    expect(() =>
      storage.getWritable({
        key: "a",
        signal: controller.signal,
        vars: { "unikvs:repair": true },
      }),
    ).toThrow(DOMException);
  });

  test("書き戻しを許可した getWritable は通常どおり書き込める", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch, allowRepair: true });

    // 実行
    const writable = storage.getWritable({
      key: "a",
      signal: AbortSignal.timeout(5_000),
      vars: { "unikvs:repair": true },
    });
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.close();

    // 検証
    expect(await storage.exists({ key: "a", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      true,
    );
  });
});
