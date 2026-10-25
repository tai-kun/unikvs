// oxlint-disable import/no-namespace
import type { IStorage } from "@unikvs/core";
import { InvalidUsageErrorBase } from "@unikvs/core";
import * as core from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import {
  KeyNotFoundError,
  LocalStorageNotAvailableError,
  ClearWithoutPrefixNotAllowedError,
} from "../src/errors.js";
import LocalStorage from "../src/localstorage.js";
import { createFakeStorage, createSecurityErrorStorage } from "./_helpers.js";

const { signal } = new AbortController();
describe("エラークラスの name", () => {
  test("新設クラスの name が LocalStorage 接頭辞で固定されている", ({ expect }) => {
    // 実行と検証：
    expect(new ClearWithoutPrefixNotAllowedError().name).toBe(
      "LocalStorageClearWithoutPrefixNotAllowedError",
    );
    expect(new LocalStorageNotAvailableError().name).toBe("LocalStorageNotAvailableError");
  });

  test("KeyNotFoundError は core の定義を使う", ({ expect }) => {
    // 実行と検証：
    expect(new KeyNotFoundError({ key: "k" }).name).toBe("UniKvsKeyNotFoundError");
    expect(KeyNotFoundError).toBe(core.KeyNotFoundError);
  });

  test("投げられた KeyNotFoundError は core の判定と互換である", ({ expect }) => {
    // 準備：
    const storage = new LocalStorage({ storage: createFakeStorage() });

    // 実行：
    const error = captureThrown(() =>
      storage.read(createGetContext("unknown", { signal }) as IStorage.ReadContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(core.KeyNotFoundError);
  });
});

describe("エラークラスの継承", () => {
  test("新設クラスは InvalidUsageErrorBase を継承する", ({ expect }) => {
    // 実行と検証：
    expect(new ClearWithoutPrefixNotAllowedError()).toBeInstanceOf(InvalidUsageErrorBase);
    expect(new LocalStorageNotAvailableError()).toBeInstanceOf(InvalidUsageErrorBase);
  });

  test("全クラスが Error を継承する", ({ expect }) => {
    // 実行と検証：
    expect(new ClearWithoutPrefixNotAllowedError()).toBeInstanceOf(Error);
    expect(new LocalStorageNotAvailableError()).toBeInstanceOf(Error);
    expect(new KeyNotFoundError({ key: "k" })).toBeInstanceOf(Error);
  });
});

describe("エラークラスの英語メッセージ", () => {
  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証：
    expect(new ClearWithoutPrefixNotAllowedError().message).toBe(
      "Refusing to clear with an empty keyPrefix because it would delete the entire localStorage. Set allowClearWithoutPrefix to true to opt in.",
    );
    expect(new LocalStorageNotAvailableError().message).toBe(
      "localStorage is not available in this environment. Inject a Storage via options.storage.",
    );
    expect(new KeyNotFoundError({ key: "k" }).message).toBe("Key not found: k");
  });
});

describe("背後例外の素通し", () => {
  test("SecurityError はそのまま伝播する", ({ expect }) => {
    // 準備：
    const storage = new LocalStorage({ storage: createSecurityErrorStorage() });

    // 実行と検証：
    for (const fn of [
      (): void => {
        storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "v");
      },
      (): string => storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
      (): boolean => storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
      (): void => {
        storage.delete(createDeleteContext("k", { signal }) as IStorage.DeleteContext);
      },
      (): void => {
        storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
      },
    ]) {
      const error = captureThrown(fn);
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("SecurityError");
    }
  });
});
