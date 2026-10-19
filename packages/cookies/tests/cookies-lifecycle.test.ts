import type { IStorage } from "@unikvs/core";
import { InvalidUsageErrorBase } from "@unikvs/core";
import * as core from "@unikvs/core";
import {
  abortedSignal,
  captureThrown,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import Cookies from "../src/cookies.js";
import { CookieNotAvailableError, CookieTooLargeError, KeyNotFoundError } from "../src/errors.js";
import { createFakeCookieStore, runWithGlobalDocument } from "./_helpers.js";

const { signal } = new AbortController();

const test = vitest.extend<{ storage: Cookies }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Cookies({ store: createFakeCookieStore() }));
  },
});

describe("ライフサイクル", () => {
  test("name は Cookies である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.name).toBe("Cookies");
  });

  test("isOpen は常に true である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.isOpen).toBe(true);
  });

  test("open と close は成功する", ({ expect, storage }) => {
    // 実行と検証
    storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    expect(storage.isOpen).toBe(true);
  });

  test("open せずに直接操作できる", ({ expect, storage }) => {
    // 実行
    storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "v");

    // 検証
    expect(storage.read(createGetContext("k", { signal }) as IStorage.ReadContext)).toBe("v");
  });

  test("中断済みシグナルの open と close は中断例外を投げる", ({ expect, storage }) => {
    // 実行と検証
    expect(() =>
      storage.open(createOpenContext({ signal: abortedSignal() }) as IStorage.OpenContext),
    ).toThrow(DOMException);
    expect(() =>
      storage.close(createCloseContext({ signal: abortedSignal() }) as IStorage.CloseContext),
    ).toThrow(DOMException);
  });

  test("中断済みシグナルでは全 CRUD が中断例外を投げる", ({ expect, storage }) => {
    // 準備
    const aborted = abortedSignal();
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行と検証
    expect(() =>
      storage.write(createSetContext("k", { signal: aborted }) as IStorage.WriteContext, "v"),
    ).toThrow(DOMException);
    expect(() =>
      storage.read(createGetContext("k1", { signal: aborted }) as IStorage.ReadContext),
    ).toThrow(DOMException);
    expect(() =>
      storage.exists(createHasContext("k1", { signal: aborted }) as IStorage.ExistsContext),
    ).toThrow(DOMException);
    expect(() =>
      storage.delete(createDeleteContext("k1", { signal: aborted }) as IStorage.DeleteContext),
    ).toThrow(DOMException);
    expect(() =>
      storage.clear(createClearContext("", { signal: aborted }) as IStorage.ClearContext),
    ).toThrow(DOMException);
  });
});

// ブラウザーでは `document` を削除できないため、不在時の検証は server 実行に限ります。
describe.skipIf(typeof globalThis.document !== "undefined")("backend 不在", () => {
  test("document 不在の open は CookieNotAvailableError を投げる", ({ expect }) => {
    // 実行
    const error = runWithGlobalDocument(undefined, () =>
      captureThrown(() =>
        new Cookies().open(createOpenContext({ signal }) as IStorage.OpenContext),
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(CookieNotAvailableError);
  });

  test("document 不在の CRUD は CookieNotAvailableError を投げる", ({ expect }) => {
    // 実行と検証
    runWithGlobalDocument(undefined, () => {
      const storage = new Cookies();

      for (const fn of [
        () => storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "v"),
        () => storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
        () => storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
        () => storage.delete(createDeleteContext("k", { signal }) as IStorage.DeleteContext),
        () => storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
      ]) {
        expect(captureThrown(fn)).toBeInstanceOf(CookieNotAvailableError);
      }
    });
  });

  test("backend 不在でも close は成功する", ({ expect }) => {
    // 実行と検証
    runWithGlobalDocument(undefined, () =>
      new Cookies().close(createCloseContext({ signal }) as IStorage.CloseContext),
    );
    expect(true).toBe(true);
  });
});

describe("エラークラス", () => {
  test("name が固定されている", ({ expect }) => {
    // 実行と検証
    expect(new CookieTooLargeError({ key: "k", actual: 5000, limit: 4096 }).name).toBe(
      "UniKvsCookieTooLargeError",
    );
    expect(new CookieNotAvailableError().name).toBe("CookieNotAvailableError");
    expect(new KeyNotFoundError({ key: "k" }).name).toBe("UniKvsKeyNotFoundError");
  });

  test("KeyNotFoundError は core の定義を使う", ({ expect }) => {
    // 実行と検証
    expect(KeyNotFoundError).toBe(core.KeyNotFoundError);
  });

  test("新設クラスは用途別に基底クラスを継承する", ({ expect }) => {
    // 実行と検証
    expect(new CookieNotAvailableError()).toBeInstanceOf(InvalidUsageErrorBase);
    expect(new CookieTooLargeError({ key: "k", actual: 1, limit: 0 })).toBeInstanceOf(
      core.ErrorBase,
    );
    expect(new CookieTooLargeError({ key: "k", actual: 1, limit: 0 })).toBeInstanceOf(Error);
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new CookieTooLargeError({ key: "k", actual: 5000, limit: 4096 }).message).toBe(
      'Cookie value for key "k" is 5000 bytes, which exceeds the size limit of 4096 bytes.',
    );
    expect(new CookieNotAvailableError().message).toBe(
      "Cookies are not available in this environment. Inject a CookieStoreLike via options.store.",
    );
  });
});
