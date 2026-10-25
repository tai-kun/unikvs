import { Buffer } from "node:buffer";

import { forCases } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import bytesToHex from "../src/bytes-to-hex.js";

describe("bytesToHex (server)", () => {
  test("任意のバイト列で Buffer の hex 表現と一致する", ({ expect }) => {
    forCases(424_242, 100, (random) => {
      // 準備：
      const bytes = random.bytes(random.uint(1024));

      // 実行と検証：
      expect(bytesToHex(bytes)).toBe(Buffer.from(bytes).toString("hex"));
    });
  });
});
