import { describe, test } from "vitest";

import { LocalStorageNotAvailableError } from "../src/errors.js";
import LocalStorage from "../src/localstorage.js";
import { captureThrown, createFakeStorage, runWithGlobalLocalStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * backend 不在の環境で関数を実行します。
 * `globalThis.localStorage` を一時的に隠して SSR 環境を再現するために使用します。
 */
function withoutBackend(fn: () => void): void {
  runWithGlobalLocalStorage(undefined, fn);
}

describe("SSR・非ブラウザー環境", () => {
  test("コンストラクターは backend 不在でも throw しない", ({ expect }) => {
    // 実行と検証
    withoutBackend(() => {
      expect(() => new LocalStorage()).not.toThrow();
    });
  });

  test("注入なしの全操作は LocalStorageNotAvailableError を投げる", ({ expect }) => {
    // 実行と検証
    withoutBackend(() => {
      const storage = new LocalStorage();
      expect(() => storage.write({ key: "k", data: "v", vars: {}, signal })).toThrow(
        LocalStorageNotAvailableError,
      );
      expect(() => storage.read({ key: "k", signal })).toThrow(LocalStorageNotAvailableError);
      expect(() => storage.exists({ key: "k", signal })).toThrow(LocalStorageNotAvailableError);
      expect(() => storage.delete({ key: "k", signal })).toThrow(LocalStorageNotAvailableError);
      expect(() => storage.clear({ signal })).toThrow(LocalStorageNotAvailableError);
      expect(() => storage.open({ signal })).toThrow(LocalStorageNotAvailableError);
    });
  });

  test("注入フェイクがあれば backend 不在環境でも CRUD できる", ({ expect }) => {
    // 実行と検証
    withoutBackend(() => {
      const storage = new LocalStorage({ storage: createFakeStorage() });
      storage.write({ key: "k", data: "v", vars: {}, signal });
      expect(storage.read({ key: "k", signal })).toBe("v");
    });
  });

  test("globalThis.localStorage の取得失敗はそのまま伝播する", ({ expect }) => {
    // 準備
    const holder = globalThis as Record<string, unknown>;
    const hadOwn = Object.hasOwn(holder, "localStorage");
    const descriptor = Object.getOwnPropertyDescriptor(holder, "localStorage");
    Object.defineProperty(holder, "localStorage", {
      get(): Storage {
        throw new DOMException("Access is denied", "SecurityError");
      },
      configurable: true,
    });

    try {
      // 実行
      const error = captureThrown(() => new LocalStorage().read({ key: "k", signal }));

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("SecurityError");
    } finally {
      if (hadOwn && descriptor !== undefined) {
        Object.defineProperty(holder, "localStorage", descriptor);
      } else {
        delete holder["localStorage"];
      }
    }
  });
});
