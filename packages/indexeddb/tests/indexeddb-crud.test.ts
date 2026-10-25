import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test } from "./_helpers.js";

const { signal } = new AbortController();
describe("CRUD の不変条件", () => {
  test("write は undefined で解決する", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1"),
    ).resolves.toBeUndefined();
  });

  test("write したオブジェクトの read は内容が等しく参照は異なる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = {
      nested: { list: [1, 2, 3] },
      message: "hello",
    };

    // 実行：
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, data);

    const result = await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

    // 検証：
    expect(result).toStrictEqual(data);
    expect(result).not.toBe(data);
    expect(result.nested).not.toBe(data.nested);
  });

  test("同じキーへ書き込むと上書きされる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "first");

    // 実行：
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "second");

    // 検証：
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "second",
    );
  });

  test("上書き後の exists は true のままである", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "first");

    // 実行：
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "second");

    // 検証：
    expect(await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
  });

  test("複数のキーへ書き込んだとき、互いに干渉しない", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");
    await storage.write(createSetContext("k3", { signal }) as IStorage.WriteContext, "v3");

    // 実行：
    await storage.delete(createDeleteContext("k2", { signal }) as IStorage.DeleteContext);

    // 検証：
    expect(await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
    expect(await storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(await storage.exists(createHasContext("k3", { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "v1",
    );
    expect(await storage.read(createGetContext("k3", { signal }) as IStorage.ReadContext)).toBe(
      "v3",
    );
  });

  test("存在しないキーの delete を繰り返してもエラーにならない", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext("missing", { signal }) as IStorage.DeleteContext),
    ).resolves.toBeUndefined();
    await expect(
      storage.delete(createDeleteContext("missing", { signal }) as IStorage.DeleteContext),
    ).resolves.toBeUndefined();
  });

  test("write 後に元の値を変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = { count: 1 };

    // 実行：
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, data);
    data.count = 99;

    // 検証：
    expect(
      await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual({ count: 1 });
  });

  test("read で得た値を変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, { count: 1 });

    // 実行：
    const first = await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);
    first.count = 99;

    const second = await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

    // 検証：
    expect(second).toStrictEqual({ count: 1 });
  });

  test("read のたびに独立した複製を返す", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = { list: [1, 2] };
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, data);

    // 実行：
    const first = await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);
    const second = await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

    // 検証：
    expect(first).toStrictEqual(second);
    expect(first).not.toBe(second);
  });

  test("clear はすべてのキーを消去し、再度書き込める", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    const existsAfterClear = await storage.exists(
      createHasContext("k1", { signal }) as IStorage.ExistsContext,
    );

    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v3");

    // 検証：
    expect(existsAfterClear).toBe(false);
    expect(await storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "v3",
    );
  });

  test("undefined を保存したキーの exists は true を返す", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, undefined);

    // 検証：
    expect(await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      undefined,
    );
  });

  test("キーごとに値の型が異なっても保存できる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    await storage.write(createSetContext("string", { signal }) as IStorage.WriteContext, "v1");
    await storage.write(createSetContext("number", { signal }) as IStorage.WriteContext, 42);
    await storage.write(createSetContext("boolean", { signal }) as IStorage.WriteContext, false);

    // 検証：
    expect(await storage.read(createGetContext("string", { signal }) as IStorage.ReadContext)).toBe(
      "v1",
    );
    expect(await storage.read(createGetContext("number", { signal }) as IStorage.ReadContext)).toBe(
      42,
    );
    expect(
      await storage.read(createGetContext("boolean", { signal }) as IStorage.ReadContext),
    ).toBe(false);
  });
});
