import { describe, test } from "vitest";

import bytesToHex from "../src/bytes-to-hex.js";

describe("bytesToHex", () => {
  test("空のバイト配列を16進数に変換する", ({ expect }) => {
    // 実行と検証
    expect(bytesToHex(new Uint8Array(0))).toBe("");
  });

  test("バイト配列を16進数に変換する", ({ expect }) => {
    // 実行と検証
    expect(bytesToHex(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]))).toBe("48656c6c6f");
  });

  test("先頭が0x00のバイト配列を正しく変換する", ({ expect }) => {
    // 実行と検証
    expect(bytesToHex(new Uint8Array([0x00, 0x01, 0xff]))).toBe("0001ff");
  });

  test("すべてのバイト値 (0-255) を正しく変換する", ({ expect }) => {
    // 準備
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const expected = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0")).join(
      "",
    );

    // 実行と検証
    expect(bytesToHex(bytes)).toBe(expected);
  });

  test("単一バイトを変換する", ({ expect }) => {
    // 実行と検証
    expect(bytesToHex(new Uint8Array([0x00]))).toBe("00");
    expect(bytesToHex(new Uint8Array([0x0f]))).toBe("0f");
    expect(bytesToHex(new Uint8Array([0xff]))).toBe("ff");
  });
});
