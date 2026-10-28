import type { IStorage } from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import Cookies from "../src/cookies.js";
import { KeyNotFoundError } from "../src/errors.js";
import { createFakeCookieStore } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空の Cookies インスタンスを提供します。
 * コピーと移動の振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: Cookies }>({
  async storage({}, use) {
    await use(new Cookies({ store: createFakeCookieStore() }));
  },
});
describe("コピー", () => {
  test("コピー元を残したままコピー先へ文字列を複製する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("k1", "k2", { signal }) as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("コピー元を残したままコピー先へバイト列を複製する", ({ expect, storage }) => {
    // 準備：
    const data = new Uint8Array([0, 1, 2, 255]);
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, data);

    // 実行：
    storage.copy(createCopyContext("k1", "k2", { signal }) as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toEqual(data);
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toEqual(data);
  });

  test("コピー先の既存値を上書きする", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "old");

    // 実行：
    storage.copy(createCopyContext("k1", "k2", { signal }) as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("存在しないキーの copy は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.copy(createCopyContext("unknown", "k2", { signal }) as IStorage.CopyContext);
    }).toThrow(KeyNotFoundError);
  });

  test("同じキーへの copy は値を削除せず成功する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("k1", "k1", { signal }) as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("copy はコピー先のキーを符号化して保存する", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const storage = new Cookies({ store });
    storage.write(createSetContext("a b", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("a b", "c d", { signal }) as IStorage.CopyContext);

    // 検証：
    expect(store.entries.get(encodeURIComponent("c d"))).toBe(encodeURIComponent("s:v1"));
  });
});
describe("移動", () => {
  test("移動先へ文字列を移し移動元を削除する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.move(createMoveContext("k1", "k2", { signal }) as IStorage.MoveContext);

    // 検証：
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("移動先の既存値を上書きする", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "old");

    // 実行：
    storage.move(createMoveContext("k1", "k2", { signal }) as IStorage.MoveContext);

    // 検証：
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("存在しないキーの move は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.move(createMoveContext("unknown", "k2", { signal }) as IStorage.MoveContext);
    }).toThrow(KeyNotFoundError);
  });

  test("同じキーへの move は値を削除せず成功する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.move(createMoveContext("k1", "k1", { signal }) as IStorage.MoveContext);

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("移動先への書き込みが失敗したとき移動元を残す", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const storage = new Cookies({ store });
    store.entries.set(encodeURIComponent("k1"), encodeURIComponent("s:v1"));
    store.set = (): void => {
      throw new Error("write failed");
    };

    // 実行：
    const error = captureThrown(() => {
      storage.move(createMoveContext("k1", "k2", { signal }) as IStorage.MoveContext);
    });

    // 検証：
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("write failed");

    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
    expect(storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });
});
