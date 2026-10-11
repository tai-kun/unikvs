import { RepairNotAllowedError } from "@unikvs/core";
import { collectChunks } from "@unikvs/testing";
import { describe, test } from "vitest";

import AllowRepair from "../src/allow-repair.js";

describe("getEncodable の透過と拒否", () => {
  test("非修復 vars では素通しの TransformStream を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const chunks = [new Uint8Array([1, 2, 3]), "text", 42];

    // 実行
    const output = await collectChunks(gate.getEncodable({ vars: {} }), chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);
    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("修復 vars でも既定状態では素通しの TransformStream を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行
    const output = await collectChunks(
      gate.getEncodable({ vars: { "unikvs:repair": true } }),
      chunks,
    );

    // 検証
    expect(output).toHaveLength(chunks.length);
    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("disable 中でも非修復 vars では素通しの TransformStream を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    const chunk = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await collectChunks(gate.getEncodable({ vars: {} }), [chunk]);

    // 検証
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });

  test("disable 後に修復 vars で RepairNotAllowedError を投げる", ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();

    // 実行と検証
    expect(() => gate.getEncodable({ vars: { "unikvs:repair": true } })).toThrow(
      RepairNotAllowedError,
    );
  });

  test("enable 後に修復 vars で再び素通しの TransformStream を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    gate.enable();
    const chunk = new Uint8Array([1]);

    // 実行
    const output = await collectChunks(gate.getEncodable({ vars: { "unikvs:repair": true } }), [
      chunk,
    ]);

    // 検証
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });

  test("空チャンク列でも順序を保って出力する", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();

    // 実行
    const output = await collectChunks(gate.getEncodable({ vars: {} }), []);

    // 検証
    expect(output).toStrictEqual([]);
  });
});

describe("getDecodable の透過", () => {
  test("常に素通しの TransformStream を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }];

    // 実行
    const output = await collectChunks(gate.getDecodable(), chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);
    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("disable 中でも投げずに素通しの TransformStream を返す", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    gate.disable();
    const chunk = new Uint8Array([1]);

    // 実行
    const output = await collectChunks(gate.getDecodable(), [chunk]);

    // 検証
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });
});
