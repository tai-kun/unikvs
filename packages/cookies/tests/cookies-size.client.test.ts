import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe, afterEach } from "vite-plus/test";

import Cookies from "../src/cookies.js";
import { CookieTooLargeError } from "../src/errors.js";

const { signal } = new AbortController();

const storage = new Cookies({ cookieAttributes: { path: "/" } });
const keys = new Set<string>();

function createKey(label: string): string {
  const key = `unikvs-size-${label}-${crypto.randomUUID()}`;
  keys.add(key);

  return key;
}

function cleanup(): void {
  for (const key of keys) {
    try {
      storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
    } catch {
      // 保存されていないキーの後始末は無視します。
    }
  }

  keys.clear();
}

function equals(left: string | Uint8Array, right: string | Uint8Array): boolean {
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
  }

  return left === right;
}

// 実ブラウザーの Cookie ストアは、上限超過時に代入を黙って破棄します。
// write が成功したなら必ず読み戻せ、失敗したなら CookieTooLargeError であることを検証します。
function writeAndVerify(
  key: string,
  value: string | Uint8Array,
  previous?: string | Uint8Array,
): "accepted" | "rejected" {
  let error: unknown;

  try {
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, value);
  } catch (ex) {
    error = ex;
  }

  if (error !== undefined) {
    if (!(error instanceof CookieTooLargeError)) {
      throw new Error("予期しない write エラーです。", { cause: error });
    }

    if (previous === undefined) {
      if (storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)) {
        throw new Error("CookieTooLargeError 後もキーが存在します。");
      }
    } else {
      const found = storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      if (!equals(found, previous)) {
        throw new Error("CookieTooLargeError 後に古い値が変化しています。");
      }
    }

    return "rejected";
  }

  if (!storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)) {
    throw new Error("write が成功したのに Cookie が存在しません。");
  }

  const found = storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

  if (!equals(found, value)) {
    throw new Error("write が成功したのに読み戻した値が一致しません。");
  }

  return "accepted";
}

describe("実ブラウザーの Cookie サイズ制限 (client)", () => {
  afterEach(() => {
    cleanup();
  });

  test("上限付近の ASCII 文字列は往復する", ({ expect }) => {
    // 準備：
    const key = createKey("ascii");

    // 実行：
    const result = writeAndVerify(key, "a".repeat(3800));

    // 検証：
    expect(result).toBe("accepted");
  });

  test("生サイズが上限内でも符号化後に大きくなるマルチバイト文字列は黙って破棄されない", ({
    expect,
  }) => {
    // 準備：
    const key = createKey("multibyte");

    // 実行：
    const result = writeAndVerify(key, "あ".repeat(1300));

    // 検証：
    expect(["accepted", "rejected"]).toContain(result);
  });

  test("生サイズが上限内でも符号化後に大きくなるバイト列は黙って破棄されない", ({ expect }) => {
    // 準備：
    const key = createKey("binary");

    // 実行：
    const result = writeAndVerify(key, new Uint8Array(3000).fill(255));

    // 検証：
    expect(["accepted", "rejected"]).toContain(result);
  });

  test("既存キーの更新が拒否されたとき、古い値は保持される", ({ expect }) => {
    // 準備：
    const key = createKey("update");
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "old");

    // 実行：
    const result = writeAndVerify(key, "あ".repeat(1300), "old");

    // 検証：
    expect(result).toBe("rejected");
  });

  test("空の実キーになるキーは拒否され、Cookie は保存されない", ({ expect }) => {
    // 実行：
    let error: unknown;

    try {
      storage.write(createSetContext("", { signal }) as IStorage.WriteContext, "v");
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(TypeError);
    expect(storage.exists(createHasContext("", { signal }) as IStorage.ExistsContext)).toBe(false);
  });
});
