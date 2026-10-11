import { createPseudoRandomBytes } from "@unikvs/testing";
import { describe, test } from "vitest";

import ZstdNode from "../src/zstd-node.js";

describe("インスタンスの状態", () => {
  test("初期状態で isOpen が true であり name は変化しない", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(128, 31);

    // 実行
    const encoded = await target.encode({ data: input });
    await target.decode({ data: encoded });

    // 検証
    expect(target.name).toBe("ZstdNode");
    expect(target.isOpen).toBe(true);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(target.decode({ data: invalidData })).rejects.toThrow(Error);
    expect(target.isOpen).toBe(true);
  });

  test("open と close を持たず常にオープン状態である", ({ expect }) => {
    // 準備
    const target = new ZstdNode();

    // 実行と検証
    expect(target.isOpen).toBe(true);
    expect("open" in target).toBe(false);
    expect("close" in target).toBe(false);
  });
});

describe("インスタンスの独立性", () => {
  test("異なるレベルの複数インスタンスを同時に使っても互いに影響しない", async ({ expect }) => {
    // 準備
    const instances = [1, 3, 10, 22].map((level) => new ZstdNode({ level }));
    const input = createPseudoRandomBytes(2048, 32);

    // 実行
    const decodedList = await Promise.all(
      instances.map(async (target) =>
        target.decode({ data: await target.encode({ data: input }) }),
      ),
    );

    // 検証
    for (const decoded of decodedList) {
      expect(decoded).toStrictEqual(input);
    }

    for (const target of instances) {
      expect(target.name).toBe("ZstdNode");
      expect(target.isOpen).toBe(true);
    }
  });

  test("同一レベルと異なるレベルのインスタンス間で展開互換がある", async ({ expect }) => {
    // 準備
    const low = new ZstdNode({ level: 1 });
    const high = new ZstdNode({ level: 22 });
    const input = createPseudoRandomBytes(512, 34);

    // 実行
    const decodedLow = await high.decode({ data: await low.encode({ data: input }) });
    const decodedHigh = await low.decode({ data: await high.encode({ data: input }) });

    // 検証
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });
});

describe("入力データの非破壊性", () => {
  test("encode と decode は引数の data を変更しない", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(1024, 33);
    const inputSnapshot = input.slice();

    // 実行
    const encoded = await target.encode({ data: input });
    const encodedSnapshot = encoded.slice();
    const decoded = await target.decode({ data: encoded });

    // 検証
    expect(input).toStrictEqual(inputSnapshot);
    expect(encoded).toStrictEqual(encodedSnapshot);
    expect(decoded).toStrictEqual(input);
  });
});

describe("ストリーム API の非提供", () => {
  test("getEncodable と getDecodable を持たない", ({ expect }) => {
    // 準備
    const target = new ZstdNode();

    // 実行と検証
    expect("getEncodable" in target).toBe(false);
    expect("getDecodable" in target).toBe(false);
    // @ts-expect-error getEncodable は提供しない。
    expect(target.getEncodable).toBeUndefined();
    // @ts-expect-error getDecodable は提供しない。
    expect(target.getDecodable).toBeUndefined();
  });
});
