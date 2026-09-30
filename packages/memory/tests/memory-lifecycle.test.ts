import { describe, test as vitest } from "vitest";

import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * 各テストが他のテストの状態に依存しないようにするために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Memory());
  },
});

describe("ライフサイクル", () => {
  test("name は Memory である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.name).toBe("Memory");
  });

  test("open と close は存在しない", ({ expect, storage }) => {
    // 実行と検証
    expect("open" in storage).toBe(false);
    expect("close" in storage).toBe(false);
  });

  test("CRUD 操作の後も isOpen は true のままである", ({ expect, storage }) => {
    // 準備と実行
    storage.write({ key: "k1", data: "v1" });
    storage.read({ key: "k1" });
    storage.delete({ key: "k1" });
    storage.clear();

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("ストリーム操作の後も isOpen は true のままである", async ({ expect, storage }) => {
    // 準備
    const writer = storage.getWritable({ key: "s1" }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();
    const reader = storage.getReadable({ key: "s1" }).getReader();
    await reader.read();
    reader.releaseLock();

    // 検証
    expect(storage.isOpen).toBe(true);
  });
});
