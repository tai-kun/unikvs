import { describe, test } from "vitest";

import chunks from "../src/chunks.js";
import { forCases } from "./_random.js";

const SEED = 20260930;
const FRACTIONAL_SIZES = [0.5, 1.5, 2.5, 3.9, 7.25, 15.99] as const;

describe("chunks (決定的ファズ)", () => {
  test("任意の Uint8Array と正のチャンクサイズでチャンクを連結すると元データに戻る", ({
    expect,
  }) => {
    forCases(SEED, 100, (random) => {
      // 準備
      const data = random.bytes(random.uint(256));
      const maxChunkByteSize = random.int(1, 512);

      // 実行
      const parts = [...chunks(data, maxChunkByteSize)];

      // 検証: 各チャンクがサイズと範囲を守り、連結すると元データになる
      const joined = new Uint8Array(data.length);
      let offset = 0;
      for (const part of parts) {
        expect(part.byteLength).toBeGreaterThan(0);
        expect(part.byteLength).toBeLessThanOrEqual(maxChunkByteSize);
        expect(part.buffer).toBe(data.buffer);
        expect(part.byteOffset).toBeGreaterThanOrEqual(data.byteOffset);
        expect(part.byteOffset + part.byteLength).toBeLessThanOrEqual(
          data.byteOffset + data.byteLength,
        );
        joined.set(part, offset);
        offset += part.byteLength;
      }

      expect(offset).toBe(data.length);
      expect(joined).toStrictEqual(data);
    });
  });

  test("任意の Int32Array とチャンクサイズで要素と順序が保たれる", ({ expect }) => {
    forCases(SEED + 1, 100, (random) => {
      // 準備
      const values = random.array(random.uint(64), () => random.int(-1_000_000, 1_000_000));
      const maxChunkByteSize = random.int(1, 64);

      // 実行
      const data = Int32Array.from(values);
      const parts = [...chunks(data, maxChunkByteSize)];

      // 検証
      const maxElements = Math.max(1, Math.floor(maxChunkByteSize / Int32Array.BYTES_PER_ELEMENT));
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0);
        expect(part.length).toBeLessThanOrEqual(maxElements);
        expect(part.buffer).toBe(data.buffer);
      }

      expect(parts.flatMap((part) => [...part])).toStrictEqual([...data]);
    });
  });

  test("任意の範囲の DataView を分割してもバイト列と範囲が保たれる", ({ expect }) => {
    forCases(SEED + 2, 100, (random) => {
      // 準備
      const backing = random.bytes(random.int(1, 64));
      const offset = random.int(0, 8);
      const chunkSize = random.int(1, 32);

      // 実行
      const byteOffset = Math.min(offset, backing.byteLength - 1);
      const view = new DataView(
        backing.buffer,
        backing.byteOffset + byteOffset,
        backing.byteLength - byteOffset,
      );
      const parts = [...chunks(view, chunkSize)];

      // 検証
      const joined: number[] = [];
      let nextOffset = backing.byteOffset + byteOffset;
      for (const part of parts) {
        expect(part.buffer).toBe(backing.buffer);
        expect(part.byteOffset).toBe(nextOffset);
        expect(part.byteLength).toBeGreaterThan(0);
        expect(part.byteLength).toBeLessThanOrEqual(chunkSize);
        joined.push(...new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
        nextOffset += part.byteLength;
      }

      const expected = new Uint8Array(
        backing.buffer,
        backing.byteOffset + byteOffset,
        backing.byteLength - byteOffset,
      );
      expect(joined).toStrictEqual([...expected]);
      expect(nextOffset).toBe(backing.byteOffset + backing.byteLength);
    });
  });

  test("任意のバイト列と小数のチャンクサイズで切り捨てサイズ以下になる", ({ expect }) => {
    forCases(SEED + 3, 50, (random) => {
      // 準備
      const data = random.bytes(random.uint(128));
      const maxChunkByteSize = random.pick(FRACTIONAL_SIZES);

      // 実行
      const parts = [...chunks(data, maxChunkByteSize)];

      // 検証
      const maxSize = Math.max(1, Math.floor(maxChunkByteSize));
      for (const part of parts) {
        expect(part.byteLength).toBeGreaterThan(0);
        expect(part.byteLength).toBeLessThanOrEqual(maxSize);
      }

      expect(parts.flatMap((part) => [...part])).toStrictEqual([...data]);
    });
  });
});
