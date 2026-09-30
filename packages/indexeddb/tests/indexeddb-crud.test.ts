import { describe } from "vitest";

import { test } from "./_helpers.js";

describe("CRUD の不変条件", () => {
  test("write は undefined で解決する", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行と検証
    await expect(storage.write({ key: "k1", data: "v1" })).resolves.toBeUndefined();
  });

  test("write したオブジェクトの read は内容が等しく参照は異なる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const data = { message: "hello", nested: { list: [1, 2, 3] } };

    // 実行
    await storage.write({ key: "k1", data });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result).toStrictEqual(data);
    expect(result).not.toBe(data);
    expect(result.nested).not.toBe(data.nested);
  });

  test("同じキーへ書き込むと上書きされる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "first" });

    // 実行
    await storage.write({ key: "k1", data: "second" });

    // 検証
    expect(await storage.read({ key: "k1" })).toBe("second");
  });

  test("上書き後の exists は true のままである", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "first" });

    // 実行
    await storage.write({ key: "k1", data: "second" });

    // 検証
    expect(await storage.exists({ key: "k1" })).toBe(true);
  });

  test("複数のキーへ書き込んだとき、互いに干渉しない", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });
    await storage.write({ key: "k2", data: "v2" });
    await storage.write({ key: "k3", data: "v3" });

    // 実行
    await storage.delete({ key: "k2" });

    // 検証
    expect(await storage.exists({ key: "k1" })).toBe(true);
    expect(await storage.exists({ key: "k2" })).toBe(false);
    expect(await storage.exists({ key: "k3" })).toBe(true);
    expect(await storage.read({ key: "k1" })).toBe("v1");
    expect(await storage.read({ key: "k3" })).toBe("v3");
  });

  test("存在しないキーの delete を繰り返してもエラーにならない", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行と検証
    await expect(storage.delete({ key: "missing" })).resolves.toBeUndefined();
    await expect(storage.delete({ key: "missing" })).resolves.toBeUndefined();
  });

  test("write 後に元の値を変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const data = { count: 1 };

    // 実行
    await storage.write({ key: "k1", data });
    data.count = 99;

    // 検証
    expect(await storage.read({ key: "k1" })).toStrictEqual({ count: 1 });
  });

  test("read で得た値を変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: { count: 1 } });

    // 実行
    const first = await storage.read({ key: "k1" });
    first.count = 99;
    const second = await storage.read({ key: "k1" });

    // 検証
    expect(second).toStrictEqual({ count: 1 });
  });

  test("read のたびに独立した複製を返す", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const data = { list: [1, 2] };
    await storage.write({ key: "k1", data });

    // 実行
    const first = await storage.read({ key: "k1" });
    const second = await storage.read({ key: "k1" });

    // 検証
    expect(first).toStrictEqual(second);
    expect(first).not.toBe(second);
  });

  test("clear はすべてのキーを消去し、再度書き込める", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });
    await storage.write({ key: "k2", data: "v2" });

    // 実行
    await storage.clear();
    const existsAfterClear = await storage.exists({ key: "k1" });
    await storage.write({ key: "k1", data: "v3" });

    // 検証
    expect(existsAfterClear).toBe(false);
    expect(await storage.exists({ key: "k2" })).toBe(false);
    expect(await storage.read({ key: "k1" })).toBe("v3");
  });

  test("undefined を保存したキーの exists は true を返す", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "k1", data: undefined });

    // 検証
    expect(await storage.exists({ key: "k1" })).toBe(true);
    expect(await storage.read({ key: "k1" })).toBe(undefined);
  });

  test("キーごとに値の型が異なっても保存できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "string", data: "v1" });
    await storage.write({ key: "number", data: 42 });
    await storage.write({ key: "boolean", data: false });

    // 検証
    expect(await storage.read({ key: "string" })).toBe("v1");
    expect(await storage.read({ key: "number" })).toBe(42);
    expect(await storage.read({ key: "boolean" })).toBe(false);
  });
});
