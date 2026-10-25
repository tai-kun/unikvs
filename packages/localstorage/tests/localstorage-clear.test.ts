import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureThrown,
  createHasContext,
  createSetContext,
  createClearContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { ClearWithoutPrefixNotAllowedError } from "../src/errors.js";
import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空のフェイク背後 Storage を提供します。
 * clear の削除範囲を検証するために使用します。
 */
const test = vitest.extend<{ backend: Storage }>({
  async backend({}, use) {
    await use(createFakeStorage());
  },
});
describe("clear の振る舞い", () => {
  test("prefix 配下のみ消去する", ({ expect, backend }) => {
    // 準備：
    const storage = new LocalStorage({ storage: backend });
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行：
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("異なる prefix の値は消去されない", ({ expect, backend }) => {
    // 準備：
    const storageA = new LocalStorage({
      storage: backend,
      keyPrefix: "a:",
    });
    const storageB = new LocalStorage({
      storage: backend,
      keyPrefix: "b:",
    });
    storageA.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "va");
    storageB.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "vb");

    // 実行：
    storageA.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(storageA.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(storageB.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
  });

  test("空 prefix の既定では走査前に拒否する", ({ expect, backend }) => {
    // 準備：
    const storage = new LocalStorage({
      storage: backend,
      keyPrefix: "",
    });
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    const error = captureThrown(() => {
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    });

    // 検証：
    expect(error).toBeInstanceOf(ClearWithoutPrefixNotAllowedError);

    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(true);
  });

  test("空 prefix でも中断済みならガードが signal より先に評価される", ({ expect, backend }) => {
    // 準備：
    const storage = new LocalStorage({
      storage: backend,
      keyPrefix: "",
    });

    // 実行：
    const error = captureThrown(() => {
      storage.clear(createClearContext("", { signal: abortedSignal() }) as IStorage.ClearContext);
    });

    // 検証：
    expect(error).toBeInstanceOf(ClearWithoutPrefixNotAllowedError);
  });

  test("allowClearWithoutPrefix では prefix 外のキーまで削除される", ({ expect, backend }) => {
    // 準備：
    const storage = new LocalStorage({
      storage: backend,
      keyPrefix: "",
      allowClearWithoutPrefix: true,
    });

    backend.setItem("other:k1", "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行：
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(backend.getItem("other:k1")).toBe(null);
    expect(storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("空の状態で clear を呼んでもエラーにならない", ({ expect, backend }) => {
    // 準備：
    const storage = new LocalStorage({ storage: backend });

    // 実行と検証：
    expect(() => {
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    }).not.toThrow();
  });

  test("key の列挙で null が返っても添字ずれなく完了する", ({ expect }) => {
    // 準備：
    const nullKeyBackend = createFakeStorage({ keyAt: () => null });
    nullKeyBackend.setItem("unikvs:k1", "v1");

    const storage = new LocalStorage({ storage: nullKeyBackend });

    // 実行：
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(nullKeyBackend.getItem("unikvs:k1")).toBe("v1");
  });
});
