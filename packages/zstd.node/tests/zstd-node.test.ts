import { describe, test } from "vitest";

import ZstdNode from "../src/zstd-node.js";
import { bytesEqual, createPseudoRandomBytes } from "./helpers.js";

/**
 * 反復テキストの入力データを作成します。
 */
function createRepetitiveInput(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    "Repeat this text multiple times to ensure compression efficiency. ".repeat(100),
  );
}

describe("往復", () => {
  test("反復テキストを既定レベルで往復すると元のデータに戻る", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createRepetitiveInput();

    // 実行
    const encoded = await target.encode({ data: input });
    const decoded = await target.decode({ data: encoded });

    // 検証
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(encoded.byteOffset).toBe(0);
    expect(decoded).toStrictEqual(input);
  });

  test("疑似乱数を既定レベルで往復すると元のデータに戻る", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(4096, 11);

    // 実行
    const decoded = await target.decode({ data: await target.encode({ data: input }) });

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("空入力を往復すると空出力に戻る", async ({ expect }) => {
    // 準備
    // 上流の実測では空入力の圧縮は空フレームを返し、展開で空出力に戻る。
    const target = new ZstdNode();
    const input = new Uint8Array(0);

    // 実行
    const encoded = await target.encode({ data: input });
    const decoded = await target.decode({ data: encoded });

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("明示レベルで往復すると元のデータに戻る", async ({ expect }) => {
    // 準備
    const input = createPseudoRandomBytes(4096, 12);

    // 実行と検証
    for (const level of [1, 10, 22]) {
      const target = new ZstdNode({ level });
      const decoded = await target.decode({ data: await target.encode({ data: input }) });
      expect(decoded, `level=${level}`).toStrictEqual(input);
    }
  });

  test("1 MiB のランダムデータを往復しても元のデータに戻る", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(1024 * 1024, 13);

    // 実行
    const decoded = await target.decode({ data: await target.encode({ data: input }) });

    // 検証
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);

  test("4 MiB の反復データを往復しても元のデータに戻る", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = new TextEncoder().encode("0123456789abcdef".repeat((4 * 1024 * 1024) / 16));

    // 実行
    const decoded = await target.decode({ data: await target.encode({ data: input }) });

    // 検証
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);
});

describe("圧縮率の健全性", () => {
  test("反復テキストは入力より小さくなる", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createRepetitiveInput();

    // 実行
    const encoded = await target.encode({ data: input });

    // 検証
    expect(encoded.byteLength).toBeLessThan(input.byteLength);
  });
});

describe("余剰キー", () => {
  test("vars と signal を付けても無視して往復できる", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(128, 14);
    const args = { data: input, vars: {}, signal: new AbortController().signal };

    // 実行
    const decoded = await target.decode({ data: await target.encode(args) });

    // 検証
    expect(decoded).toStrictEqual(input);
  });
});
