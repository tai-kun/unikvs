import { Variables } from "@unikvs/core";
import { captureThrown } from "@unikvs/testing";
import { describe, test } from "vitest";

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
    // 実行と検証
    withoutBackend(() => {
      expect(() => new SessionStorage()).not.toThrow();
    });
  });

  test("注入なしの全操作は SessionStorageNotAvailableError を投げる", ({ expect }) => {
    // 実行と検証
    withoutBackend(() => {
      const storage = new SessionStorage();
      expect(() => storage.write({ key: "k", data: "v", vars: new Variables(), signal })).toThrow(
        SessionStorageNotAvailableError,
      );
      expect(() => storage.read({ key: "k", signal })).toThrow(SessionStorageNotAvailableError);
      expect(() => storage.exists({ key: "k", signal })).toThrow(SessionStorageNotAvailableError);
      expect(() => storage.delete({ key: "k", signal })).toThrow(SessionStorageNotAvailableError);
      expect(() => storage.clear({ signal })).toThrow(SessionStorageNotAvailableError);
      expect(() => storage.open({ signal })).toThrow(SessionStorageNotAvailableError);
    });
  });

  test("注入フェイクがあれば backend 不在環境でも CRUD できる", ({ expect }) => {
    // 実行と検証
    withoutBackend(() => {
      const storage = new SessionStorage({ storage: createFakeStorage() });
      storage.write({ key: "k", data: "v", vars: new Variables(), signal });
      expect(storage.read({ key: "k", signal })).toBe("v");
    });
  });

  test("globalThis.sessionStorage の取得失敗はそのまま伝播する", ({ expect }) => {
    // 準備
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
      // 実行
      const error = captureThrown(() => new SessionStorage().read({ key: "k", signal }));

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("SecurityError");
    } finally {
      if (hadOwn && descriptor !== undefined) {
        Object.defineProperty(holder, "sessionStorage", descriptor);
      } else {
        delete holder["sessionStorage"];
      }
    }
  });
});
