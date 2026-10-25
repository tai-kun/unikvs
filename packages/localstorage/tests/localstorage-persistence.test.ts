import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import LocalStorage from "../src/localstorage.js";
import {
  createKeyPrefix,
  createFakeStorage,
  createSharedBackend,
  runWithGlobalLocalStorage,
} from "./_helpers.js";

const { signal } = new AbortController();
describe("永続化と共有", () => {
  test("別インスタンスで同じ背後領域を開いてもデータを読み取れる", ({ expect }) => {
    // 準備：
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const first = new LocalStorage({
      storage: backend,
      keyPrefix: prefix,
    });
    first.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    const second = new LocalStorage({
      storage: backend,
      keyPrefix: prefix,
    });

    // 検証：
    expect(second.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");

    // 後始末：
    second.clear(createClearContext("", { signal }) as IStorage.ClearContext);
  });

  test("注入なしでも背後領域を使える", ({ expect }) => {
    // 準備：
    const prefix = createKeyPrefix();
    const globalBackend = (globalThis as { localStorage?: Storage | undefined }).localStorage;

    // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
    if (globalBackend) {
      // 実行：
      const storage = new LocalStorage({ keyPrefix: prefix });
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 検証：
      expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");

      // 後始末：
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    } else {
      // 実行と検証：
      runWithGlobalLocalStorage(createFakeStorage(), () => {
        const storage = new LocalStorage({ keyPrefix: prefix });
        storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
        expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
        storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
      });
    }
  });

  test("clear して再度書き込むと空の状態から始められる", ({ expect }) => {
    // 準備：
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const storage = new LocalStorage({
      storage: backend,
      keyPrefix: prefix,
    });
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行：
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 検証：
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v2");

    // 後始末：
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
  });

  test("同一 prefix は共有し異なる prefix は分離する", ({ expect }) => {
    // 準備：
    const backend = createSharedBackend();
    const prefixA = createKeyPrefix();
    const prefixB = createKeyPrefix();
    const storageA1 = new LocalStorage({
      storage: backend,
      keyPrefix: prefixA,
    });
    const storageA2 = new LocalStorage({
      storage: backend,
      keyPrefix: prefixA,
    });
    const storageB = new LocalStorage({
      storage: backend,
      keyPrefix: prefixB,
    });
    storageA1.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "va");

    // 実行と検証：
    expect(storageA2.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("va");
    expect(storageB.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );

    // 後始末：
    storageA1.clear(createClearContext("", { signal }) as IStorage.ClearContext);
  });

  test("削除したデータは別インスタンスからも復活しない", ({ expect }) => {
    // 準備：
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const first = new LocalStorage({
      storage: backend,
      keyPrefix: prefix,
    });
    first.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    first.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 実行：
    const second = new LocalStorage({
      storage: backend,
      keyPrefix: prefix,
    });

    // 検証：
    expect(second.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(false);
  });
});
