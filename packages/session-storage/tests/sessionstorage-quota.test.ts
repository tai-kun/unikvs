import type { IStorage } from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import SessionStorage from "../src/sessionstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとにクォータ付きフェイク背後の SessionStorage を提供します。
 * 容量超過の素通しを検証するために使用します。
 */
const test = vitest.extend<{
  backend: Storage;
  storage: SessionStorage;
}>({
  async backend({}, use) {
    await use(createFakeStorage({ quotaAt: 2 }));
  },
  async storage({ backend }, use) {
    await use(new SessionStorage({ storage: backend }));
  },
});
describe("クォータ超過", () => {
  test("write の QuotaExceededError はそのまま伝播する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    const error = captureThrown(() => {
      storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");
    });

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("QuotaExceededError");
  });

  test("クォータ超過で失敗した write の後も既存値は残る", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    captureThrown(() => {
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v2");
    });

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("クォータ超過で失敗した新規キーは存在しない", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    captureThrown(() => {
      storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");
    });

    // 検証：
    expect(storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });
});
