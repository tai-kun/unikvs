import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import VercelRuntimeCache from "../src/vercel-runtime-cache.js";

const test = vitest.extend<{ storage: VercelRuntimeCache }>({
  async storage({}, use) {
    await use(new VercelRuntimeCache({ ttlSeconds: 60 }));
  },
});
describe("CRUD の不変条件 (フォールバック)", () => {
  test("書き込んだ値を読み取れる", async ({ expect, storage }) => {
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe("v1");
  });

  test("open/close は no-op として成功する", async ({ expect, storage }) => {
    await expect(
      storage.open(createOpenContext() as IStorage.OpenContext),
    ).resolves.toBeUndefined();
    await expect(
      storage.close(createCloseContext() as IStorage.CloseContext),
    ).resolves.toBeUndefined();
    expect(storage.isOpen).toBe(true);
  });

  test("削除したキーの read は KeyNotFoundError を投げる", async ({ expect, storage }) => {
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("存在しないキーの delete は KeyNotFoundError を投げる", async ({ expect, storage }) => {
    await expect(
      storage.delete(createDeleteContext("missing") as IStorage.DeleteContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("存在しないキーの read は KeyNotFoundError を投げる", async ({ expect, storage }) => {
    await expect(
      storage.read(createGetContext("missing") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("exists は存在するとき true 存在しないとき false", async ({ expect, storage }) => {
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
  });

  test("clear したキーの read は KeyNotFoundError を投げる", async ({ expect, storage }) => {
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await storage.clear(createClearContext() as IStorage.ClearContext);

    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("undefined を保存したキーの exists は true を返す", async ({ expect, storage }) => {
    await storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
  });

  test("書き込み値は複製される", async ({ expect, storage }) => {
    const source = { nested: { value: 1 } };
    await storage.write(createSetContext("k1") as IStorage.WriteContext, source);
    source.nested.value = 99;

    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).resolves.toStrictEqual({ nested: { value: 1 } });
  });

  test("読み取り値は複製される", async ({ expect, storage }) => {
    await storage.write(createSetContext("k1") as IStorage.WriteContext, { nested: { value: 1 } });
    const first = (await storage.read(createGetContext("k1") as IStorage.ReadContext)) as {
      nested: { value: number };
    };
    first.nested.value = 99;

    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).resolves.toStrictEqual({ nested: { value: 1 } });
  });

  test("namespace が異なるとキーは分離される", async ({ expect }) => {
    const a = new VercelRuntimeCache({ namespace: "a" });
    const b = new VercelRuntimeCache({ namespace: "b" });
    await a.write(createSetContext("k") as IStorage.WriteContext, "va");
    await b.write(createSetContext("k") as IStorage.WriteContext, "vb");
    await expect(a.read(createGetContext("k") as IStorage.ReadContext)).resolves.toBe("va");
    await expect(b.read(createGetContext("k") as IStorage.ReadContext)).resolves.toBe("vb");
    expect(a.namespace).toBe("a");
    expect(a.ttlSeconds).toBe(60);
    expect(a.maxEntries).toBeUndefined();
    expect(a.name).toBe("VercelRuntimeCache");
  });
});
