import type { IStorage } from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { SessionStorageNotAvailableError } from "../src/errors.js";
import SessionStorage from "../src/sessionstorage.js";
import { createFakeStorage, runWithGlobalSessionStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * backend 不在の環境で関数を実行します。
 * `globalThis.sessionStorage` を一時的に隠して SSR 環境を再現するために使用します。
 */
function withoutBackend(fn: () => void): void {
  runWithGlobalSessionStorage(undefined, fn);
}

describe("SSR・非ブラウザー環境", () => {
  test("コンストラクターは backend 不在でも throw しない", ({ expect }) => {
    // 実行と検証：
    withoutBackend(() => {
      expect(() => new SessionStorage()).not.toThrow();
    });
  });

  test("注入なしの全操作は SessionStorageNotAvailableError を投げる", ({ expect }) => {
    // 実行と検証：
    withoutBackend(() => {
      const storage = new SessionStorage();
      expect(() => {
        storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "v");
      }).toThrow(SessionStorageNotAvailableError);
      expect(() => storage.read(createGetContext("k", { signal }) as IStorage.ReadContext)).toThrow(
        SessionStorageNotAvailableError,
      );
      expect(() =>
        storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
      ).toThrow(SessionStorageNotAvailableError);
      expect(() => {
        storage.delete(createDeleteContext("k", { signal }) as IStorage.DeleteContext);
      }).toThrow(SessionStorageNotAvailableError);
      expect(() => {
        storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
      }).toThrow(SessionStorageNotAvailableError);
      expect(() => {
        storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      }).toThrow(SessionStorageNotAvailableError);
    });
  });

  test("注入フェイクがあれば backend 不在環境でも CRUD できる", ({ expect }) => {
    // 実行と検証：
    withoutBackend(() => {
      const storage = new SessionStorage({ storage: createFakeStorage() });
      storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "v");
      expect(storage.read(createGetContext("k", { signal }) as IStorage.ReadContext)).toBe("v");
    });
  });

  test("globalThis.sessionStorage の取得失敗はそのまま伝播する", ({ expect }) => {
    // 準備：
    const holder = globalThis as Record<string, unknown>;
    const hadOwn = Object.hasOwn(holder, "sessionStorage");
    const descriptor = Object.getOwnPropertyDescriptor(holder, "sessionStorage");
    Object.defineProperty(holder, "sessionStorage", {
      get(): Storage {
        throw new DOMException("Access is denied", "SecurityError");
      },
      configurable: true,
    });

    try {
      // 実行：
      const error = captureThrown(() =>
        new SessionStorage().read(createGetContext("k", { signal }) as IStorage.ReadContext),
      );

      // 検証：
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("SecurityError");
    } finally {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (hadOwn && descriptor !== undefined) {
        Object.defineProperty(holder, "sessionStorage", descriptor);
      } else {
        delete holder["sessionStorage"];
      }
    }
  });
});
