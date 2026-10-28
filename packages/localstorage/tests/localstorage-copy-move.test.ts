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

import { KeyNotFoundError } from "../src/errors.js";
import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空の LocalStorage インスタンスを提供します。
 * コピーと移動の振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: LocalStorage }>({
  async storage({}, use) {
    await use(new LocalStorage({ storage: createFakeStorage() }));
  },
});
describe("コピー", () => {
  test("コピー元を残したままコピー先へ値を複製する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("k1", "k2", { signal }) as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("コピー先の既存値を上書きする", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "old");

    // 実行：
    storage.copy(createCopyContext("k1", "k2", { signal }) as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
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

  test("copy はコピー先にも接頭辞を付けて保存する", ({ expect }) => {
    // 準備：
    const backend = createFakeStorage();
    const storage = new LocalStorage({
      storage: backend,
      keyPrefix: "p:",
    });
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("k1", "k2", { signal }) as IStorage.CopyContext);

    // 検証：
    expect(backend.getItem("p:k1")).toBe("v1");
    expect(backend.getItem("p:k2")).toBe("v1");
  });
});
describe("移動", () => {
  test("移動先へ値を移し移動元を削除する", ({ expect, storage }) => {
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
    const backend = createFakeStorage({ quotaAt: 2 });
    const storage = new LocalStorage({ storage: backend });
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    const error = captureThrown(() => {
      storage.move(createMoveContext("k1", "k2", { signal }) as IStorage.MoveContext);
    });

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("QuotaExceededError");

    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
    expect(storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });
});
