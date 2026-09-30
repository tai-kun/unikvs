import { describe } from "vitest";

import { test } from "./_helpers.js";

describe("キーの扱い", () => {
  test("スラッシュで区切られたキーは他のキーと干渉しない", async ({ expect, signal, storage }) => {
    // 準備
    const entries = [
      { key: "dir/sub/file.txt", data: new Uint8Array([1]) },
      { key: "dir/sub.txt", data: new Uint8Array([2]) },
      { key: "dir.txt", data: new Uint8Array([3]) },
    ];
    storage.open();

    // 実行
    for (const { key, data } of entries) {
      await storage.write({ key, data, signal });
    }
    await storage.delete({ key: "dir/sub.txt", signal });

    // 検証
    await expect(storage.read({ key: "dir/sub/file.txt", signal })).resolves.toStrictEqual(
      new Uint8Array([1]),
    );
    await expect(storage.exists({ key: "dir/sub.txt", signal })).resolves.toBe(false);
    await expect(storage.read({ key: "dir.txt", signal })).resolves.toStrictEqual(
      new Uint8Array([3]),
    );
  });

  test("先頭と末尾にスラッシュがあるキーも保存できる", async ({ expect, signal, storage }) => {
    // 準備
    const entries = [
      { key: "/leading.txt", data: new Uint8Array([1]) },
      { key: "trailing/", data: new Uint8Array([2]) },
    ];
    storage.open();

    // 実行と検証
    for (const { key, data } of entries) {
      await storage.write({ key, data, signal });
      await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
    }
  });

  test("Unicode と絵文字を含むキーが往復する", async ({ expect, signal, storage }) => {
    // 準備
    const entries = [
      { key: "日本語キー.txt", data: new Uint8Array([1]) },
      { key: "📦emoji🚀.bin", data: new Uint8Array([2]) },
      { key: "ключ/ключ.bin", data: new Uint8Array([3]) },
      { key: "e\u0301clair.txt", data: new Uint8Array([4]) },
    ];
    storage.open();

    // 実行と検証
    for (const { key, data } of entries) {
      await storage.write({ key, data, signal });
      await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
    }
  });

  test("大文字と小文字を区別する", async ({ expect, signal, storage }) => {
    // 準備
    storage.open();
    await storage.write({ key: "Case.txt", data: new Uint8Array([1]), signal });

    // 実行
    const lowerExists = await storage.exists({ key: "case.txt", signal });
    const upperData = await storage.read({ key: "Case.txt", signal });

    // 検証
    expect(lowerExists).toBe(false);
    expect(upperData).toStrictEqual(new Uint8Array([1]));
  });

  test("255 文字のキーは保存できる", async ({ expect, signal, storage }) => {
    // 準備
    const key = `${"a".repeat(251)}.bin`;
    const data = new Uint8Array([1]);
    storage.open();

    // 実行
    await storage.write({ key, data, signal });

    // 検証
    expect(key).toHaveLength(255);
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("1025 文字のキーは KeyTooLongError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    const key = "a".repeat(1025);
    storage.open();

    // 実行と検証
    await expect(storage.write({ key, data: new Uint8Array([1]), signal })).rejects.toMatchObject({
      name: "KeyTooLongError",
    });
  });

  test("空文字列のキーへの write と read は拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.open();

    // 実行と検証
    await expect(storage.write({ key: "", data: new Uint8Array([1]), signal })).rejects.toThrow();
    await expect(storage.read({ key: "", signal })).rejects.toThrow();
  });

  test("../ を含むキーは拒否され、パス移動したキーは作られない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    storage.open();

    // 実行と検証
    await expect(
      storage.write({ key: "dir/../escape.txt", data: new Uint8Array([1]), signal }),
    ).rejects.toThrow();
    await expect(storage.exists({ key: "escape.txt", signal })).resolves.toBe(false);
  });

  test("連続するスラッシュを含むキーは拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.open();

    // 実行と検証
    await expect(
      storage.write({ key: "dir//file.txt", data: new Uint8Array([1]), signal }),
    ).rejects.toThrow();
  });

  test("記号を含むキーが往復する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "a b/c?d&e=f+x%y.txt";
    const data = new Uint8Array([1, 2, 3]);
    storage.open();

    // 実行
    await storage.write({ key, data, signal });

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });
});
