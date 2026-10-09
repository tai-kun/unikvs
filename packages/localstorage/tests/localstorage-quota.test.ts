import { describe, test as vitest } from "vitest";

import LocalStorage from "../src/localstorage.js";
import { captureThrown, createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとにクォータ付きフェイク背後の LocalStorage を提供します。
 * 容量超過の素通しを検証するために使用します。
 */
const test = vitest.extend<{ backend: Storage; storage: LocalStorage }>({
  // oxlint-disable-next-line no-empty-pattern
  async backend({}, use) {
    await use(createFakeStorage({ quotaAt: 2 }));
  },
  async storage({ backend }, use) {
    await use(new LocalStorage({ storage: backend }));
  },
});

describe("クォータ超過", () => {
  test("write の QuotaExceededError はそのまま伝播する", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: {}, signal });

    // 実行
    const error = captureThrown(() => storage.write({ key: "k2", data: "v2", vars: {}, signal }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("QuotaExceededError");
  });

  test("クォータ超過で失敗した write の後も既存値は残る", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: {}, signal });

    // 実行
    captureThrown(() => storage.write({ key: "k1", data: "v2", vars: {}, signal }));

    // 検証
    expect(storage.read({ key: "k1", signal })).toBe("v1");
  });

  test("クォータ超過で失敗した新規キーは存在しない", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: {}, signal });

    // 実行
    captureThrown(() => storage.write({ key: "k2", data: "v2", vars: {}, signal }));

    // 検証
    expect(storage.exists({ key: "k2", signal })).toBe(false);
  });
});
