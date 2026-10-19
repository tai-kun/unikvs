import type { IStorage } from "@unikvs/core";
import {
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

describe("文字列の往復", () => {
  test("書き込んだ文字列を読み戻せる", ({ expect, storage }) => {
    // 準備と実行
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("空文字を保存したキーの read は空文字を返す", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "");

    // 実行と検証
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(true);
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("");
  });

  test("上書きした値が読める", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v2");

    // 検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v2");
  });

  test("区切り文字を含むキーを符号化して扱える", ({ expect }) => {
    // 準備
    const storage = new Cookies({ store: createFakeCookieStore() });
    const key = "a b;=c";

    // 実行
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v");

    // 検証
    expect(storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)).toBe("v");
    expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(true);
  });

  test("マーカー接頭辞を含む文字列もそのまま往復する", ({ expect, storage }) => {
    // 実行
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "s:raw");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "b:raw");

    // 検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("s:raw");
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("b:raw");
  });

  test("マーカーのない値はそのまま返す", ({ expect }) => {
    // 準備
    const store = createFakeCookieStore();
    store.entries.set(encodeURIComponent("k1"), encodeURIComponent("legacy"));
    const storage = new Cookies({ store });

    // 実行と検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("legacy");
  });
});

describe("バイト列の往復", () => {
  test("書き込んだ Uint8Array を読み戻せる", ({ expect, storage }) => {
    // 準備
    const data = new Uint8Array([0, 1, 2, 255, 128]);

    // 実行
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, data);

    // 検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toEqual(data);
  });

  test("空の Uint8Array を読み戻せる", ({ expect, storage }) => {
    // 実行
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, new Uint8Array(0));

    // 検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toEqual(
      new Uint8Array(0),
    );
  });

  test("全バイト値が壊れずに往復する", ({ expect, storage }) => {
    // 準備
    const data = new Uint8Array(256).map((_, index) => index);

    // 実行
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, data);

    // 検証
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toEqual(data);
  });
});

describe("欠番の扱い", () => {
  test("欠番の read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証
    expect(() =>
      storage.read(createGetContext("unknown", { signal }) as IStorage.ReadContext),
    ).toThrow(KeyNotFoundError);
  });

  test("欠番の exists は false を返す", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.exists(createHasContext("unknown", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("欠番の delete は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証
    expect(() =>
      storage.delete(createDeleteContext("unknown", { signal }) as IStorage.DeleteContext),
    ).toThrow(KeyNotFoundError);
  });
});
