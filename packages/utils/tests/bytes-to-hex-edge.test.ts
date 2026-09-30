import { describe, test } from "vitest";

import bytesToHex from "../src/bytes-to-hex.js";
import { forCases } from "./_random.js";

/**
 * Uint8Array.prototype.toHex を一時的に無効化し、事前計算テーブルを使う実装経路を検証できるようにします。
 * 処理の終了後に元のプロパティー定義へ戻します。
 */
function withoutNativeToHex<T>(fn: () => T): T {
  const ownDescriptor = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toHex");
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    value: undefined,
    configurable: true,
    writable: true,
  });

  try {
    return fn();
  } finally {
    if (ownDescriptor === undefined) {
      delete (Uint8Array.prototype as { toHex?: unknown }).toHex;
    } else {
      Object.defineProperty(Uint8Array.prototype, "toHex", ownDescriptor);
    }
  }
}

describe("bytesToHex", () => {
  test("小文字の 16 進数文字列を返す", ({ expect }) => {
    // 準備
    const bytes = Uint8Array.from([0xab, 0xcd, 0xef, 0x00, 0x42]);

    // 実行
    const hex = bytesToHex(bytes);

    // 検証
    expect(hex).toBe("abcdef0042");
    expect(hex).not.toMatch(/[A-F]/);
  });

  test("奇数長のバイト配列を変換する", ({ expect }) => {
    // 実行と検証
    expect(bytesToHex(new Uint8Array([0x01, 0x02, 0x03]))).toBe("010203");
  });

  test("先頭が 0x00 のバイトを 2 桁で表現する", ({ expect }) => {
    // 実行と検証
    expect(bytesToHex(new Uint8Array([0x00, 0x01]))).toBe("0001");
  });

  test("大きなバイト配列を変換する", ({ expect }) => {
    // 準備
    const bytes = Uint8Array.from({ length: 65_536 }, (_, i) => i & 0xff);
    const expected = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

    // 実行と検証
    expect(bytesToHex(bytes)).toBe(expected);
  });

  test("toHex が使えない環境でも事前計算テーブルで変換する", ({ expect }) => {
    // 準備と実行
    const hex = withoutNativeToHex(() => bytesToHex(Uint8Array.from([0x00, 0x0f, 0xff])));

    // 検証
    expect(hex).toBe("000fff");
  });

  test("事前計算テーブル経路ですべてのバイト値を変換する", ({ expect }) => {
    // 準備
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const expected = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

    // 実行と検証
    expect(withoutNativeToHex(() => bytesToHex(bytes))).toBe(expected);
  });

  test("任意のバイト列を 2 桁の 16 進数へ変換する (決定的ファズ)", ({ expect }) => {
    forCases(20260930, 100, (random) => {
      // 準備
      const bytes = random.bytes(random.uint(512));
      const expected = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

      // 実行と検証
      expect(withoutNativeToHex(() => bytesToHex(bytes))).toBe(expected);
    });
  });
});
