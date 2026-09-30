import { describe, test } from "vitest";

import Compression from "../src/compression.js";
import { FORMATS, createPseudoRandomBytes } from "./helpers.js";

describe("インスタンスの状態", () => {
  test("encode と decode の後も name と isOpen は変化しない", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(128, 31);

    // 実行
    const encoded = await compression.encode({ data: input });
    await compression.decode({ data: encoded });

    // 検証
    expect(compression.name).toBe("Compression");
    expect(compression.isOpen).toBe(true);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(compression.decode({ data: invalidData })).rejects.toThrow(Error);
    expect(compression.isOpen).toBe(true);
  });
});

describe("インスタンスの独立性", () => {
  test("異なる形式の複数インスタンスを同時に使っても互いに影響しない", async ({ expect }) => {
    // 準備
    const instances = FORMATS.map((format) => new Compression(format));
    const input = createPseudoRandomBytes(2048, 32);

    // 実行
    const decodedList = await Promise.all(
      instances.map(async (compression) =>
        compression.decode({ data: await compression.encode({ data: input }) }),
      ),
    );

    // 検証
    for (const [index, decoded] of decodedList.entries()) {
      expect(decoded, FORMATS[index]).toStrictEqual(input);
    }

    for (const compression of instances) {
      expect(compression.name).toBe("Compression");
      expect(compression.isOpen).toBe(true);
    }
  });
});

describe("入力データの非破壊性", () => {
  test("encode と decode は引数の data を変更しない", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(1024, 33);
    const inputSnapshot = input.slice();

    // 実行
    const encoded = await compression.encode({ data: input });
    const encodedSnapshot = encoded.slice();
    const decoded = await compression.decode({ data: encoded });

    // 検証
    expect(input).toStrictEqual(inputSnapshot);
    expect(encoded).toStrictEqual(encodedSnapshot);
    expect(decoded).toStrictEqual(input);
  });
});
