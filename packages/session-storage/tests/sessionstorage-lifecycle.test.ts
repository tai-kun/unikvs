import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { SessionStorageNotAvailableError } from "../src/errors.js";
import SessionStorage from "../src/sessionstorage.js";
import { createFakeStorage, runWithGlobalSessionStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空の SessionStorage インスタンスを提供します。
 * ライフサイクルと中断検証に使用します。
 */
const test = vitest.extend<{ storage: SessionStorage }>({
  async storage({}, use) {
    await use(new SessionStorage({ storage: createFakeStorage() }));
  },
});
describe("ライフサイクル", () => {
  test("name は SessionStorage である", ({ expect, storage }) => {
    // 実行と検証：
    expect(storage.name).toBe("SessionStorage");
  });

  test("open は signal 検証と backend 存在確認のみ行う", ({ expect, storage }) => {
    // 実行：
    storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証：
    expect(storage.isOpen).toBe(true);
  });

  test("close は signal 検証のみ行う", ({ expect, storage }) => {
    // 実行：
    storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 検証：
    expect(storage.isOpen).toBe(true);
  });

  test("中断済みシグナルの open は中断例外を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.open(createOpenContext({ signal: abortedSignal() }) as IStorage.OpenContext);
    }).toThrow(DOMException);
  });

  test("中断済みシグナルの close は中断例外を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.close(createCloseContext({ signal: abortedSignal() }) as IStorage.CloseContext);
    }).toThrow(DOMException);
  });

  test("backend 不在の open は SessionStorageNotAvailableError を投げる", ({ expect }) => {
    // 実行：
    const error = runWithGlobalSessionStorage(undefined, () =>
      captureThrown(() => {
        new SessionStorage().open(createOpenContext({ signal }) as IStorage.OpenContext);
      }),
    );

    // 検証：
    expect(error).toBeInstanceOf(SessionStorageNotAvailableError);
  });

  test("backend 不在でも close は成功する", ({ expect }) => {
    // 実行と検証：
    runWithGlobalSessionStorage(undefined, () => {
      new SessionStorage().close(createCloseContext({ signal }) as IStorage.CloseContext);
    });
    expect(true).toBe(true);
  });

  test("backend 不在でも isOpen は true のままである", ({ expect }) => {
    // 実行と検証：
    runWithGlobalSessionStorage(undefined, () => {
      expect(new SessionStorage().isOpen).toBe(true);
    });
  });

  test("close しても backend に触れないため操作を継続できる", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("open せずに直接操作できる", ({ expect, storage }) => {
    // 実行：
    storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "v");

    // 検証：
    expect(storage.read(createGetContext("k", { signal }) as IStorage.ReadContext)).toBe("v");
  });

  test("中断済みシグナルでは全 CRUD が中断例外を投げる", ({ expect, storage }) => {
    // 準備：
    const aborted = abortedSignal();

    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行と検証：
    expect(() => {
      storage.write(createSetContext("k", { signal: aborted }) as IStorage.WriteContext, "v");
    }).toThrow(DOMException);
    expect(() =>
      storage.read(createGetContext("k1", { signal: aborted }) as IStorage.ReadContext),
    ).toThrow(DOMException);
    expect(() =>
      storage.exists(createHasContext("k1", { signal: aborted }) as IStorage.ExistsContext),
    ).toThrow(DOMException);
    expect(() => {
      storage.delete(createDeleteContext("k1", { signal: aborted }) as IStorage.DeleteContext);
    }).toThrow(DOMException);
    expect(() => {
      storage.clear(createClearContext("", { signal: aborted }) as IStorage.ClearContext);
    }).toThrow(DOMException);
  });

  test("カスタム reason の中断は reason のまま伝播する", ({ expect, storage }) => {
    // 準備：
    const reason = new Error("custom-abort");

    // 実行：
    const error = captureThrown(() => {
      storage.write(
        createSetContext("k", { signal: abortedSignal(reason) }) as IStorage.WriteContext,
        "v",
      );
    });

    // 検証：
    expect(error).toBe(reason);
  });
});
