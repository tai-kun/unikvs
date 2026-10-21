import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import Cookies from "../src/cookies.js";
import { KeyNotFoundError } from "../src/errors.js";
import { createFakeCookieStore } from "./_helpers.js";

const { signal } = new AbortController();

const test = vitest.extend<{ storage: Cookies }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Cookies({ store: createFakeCookieStore() }));
  },
});

describe("delete と clear", () => {
  test("削除したキーの read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行
    storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 検証
    expect(() => storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("clear したキーの read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    expect(() => storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
    expect(() => storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("空のストレージに clear を呼んでもエラーにならない", ({ expect, storage }) => {
    // 実行と検証
    expect(() =>
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).not.toThrow();
  });

  test("削除したキーへ再度書き込みできる", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 実行
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v2");

    // 検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v2");
  });

  test("delete は対象のキーだけを削除する", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行
    storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 検証
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v2");
  });

  test("区切り文字を含むキーも delete できる", ({ expect, storage }) => {
    // 準備
    const key = "a b;=c";
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行
    storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 検証
    expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v2");
  });

  test("区切り文字を含むキーも clear できる", ({ expect, storage }) => {
    // 準備
    const key = "a b;=c";
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(false);
    expect(storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("clear したキーへ再度書き込みできる", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v2");

    // 検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v2");
  });
});
