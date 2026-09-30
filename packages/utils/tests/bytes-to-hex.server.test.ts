import { Buffer } from "node:buffer";

import { describe, test } from "vitest";

import bytesToHex from "../src/bytes-to-hex.js";
import { forCases } from "./_random.js";

describe("bytesToHex (server)", () => {
  test("任意のバイト列で Buffer の hex 表現と一致する", ({ expect }) => {
    forCases(424242, 100, (random) => {
      // 準備
      const bytes = random.bytes(random.uint(1024));

      // 実行と検証
      expect(bytesToHex(bytes)).toBe(Buffer.from(bytes).toString("hex"));
    });
  });
});
