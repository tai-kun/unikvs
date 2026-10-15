import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import SessionStorage from "../src/sessionstorage.js";
import {
  createFakeStorage,
  createKeyPrefix,
  createSharedBackend,
  runWithGlobalSessionStorage,
} from "./_helpers.js";

const { signal } = new AbortController();

describe("永続化と共有", () => {
  test("別インスタンスで同じ背後領域を開いてもデータを読み取れる", ({ expect }) => {
    // 準備
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const first = new SessionStorage({ storage: backend, keyPrefix: prefix });
    first.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行
    const second = new SessionStorage({ storage: backend, keyPrefix: prefix });

    // 検証
    expect(second.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");

    // 後始末
    second.clear(createClearContext("", { signal }) as IStorage.ClearContext);
  });

  test("注入なしでも背後領域を使える", ({ expect }) => {
    // 準備
    const prefix = createKeyPrefix();
    const globalBackend = (globalThis as { sessionStorage?: Storage | undefined }).sessionStorage;

    if (globalBackend) {
      // 実行
      const storage = new SessionStorage({ keyPrefix: prefix });
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 検証
      expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");

      // 後始末
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    } else {
      // 実行と検証
      runWithGlobalSessionStorage(createFakeStorage(), () => {
        const storage = new SessionStorage({ keyPrefix: prefix });
        storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
        expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
        storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
      });
    }
  });

  test("clear して再度書き込むと空の状態から始められる", ({ expect }) => {
    // 準備
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const storage = new SessionStorage({ storage: backend, keyPrefix: prefix });
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 検証
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v2");

    // 後始末
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
  });

  test("同一 prefix は共有し異なる prefix は分離する", ({ expect }) => {
    // 準備
    const backend = createSharedBackend();
    const prefixA = createKeyPrefix();
    const prefixB = createKeyPrefix();
    const storageA1 = new SessionStorage({ storage: backend, keyPrefix: prefixA });
    const storageA2 = new SessionStorage({ storage: backend, keyPrefix: prefixA });
    const storageB = new SessionStorage({ storage: backend, keyPrefix: prefixB });
    storageA1.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "va");

    // 実行と検証
    expect(storageA2.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("va");
    expect(storageB.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );

    // 後始末
    storageA1.clear(createClearContext("", { signal }) as IStorage.ClearContext);
  });

  test("削除したデータは別インスタンスからも復活しない", ({ expect }) => {
    // 準備
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const first = new SessionStorage({ storage: backend, keyPrefix: prefix });
    first.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    first.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 実行
    const second = new SessionStorage({ storage: backend, keyPrefix: prefix });

    // 検証
    expect(second.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(false);
  });
});
