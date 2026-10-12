import { createPseudoRandomBytes } from "@unikvs/testing";
import { describe, test } from "vitest";

import ZstdNode from "../src/zstd-node.js";

/**
 * チャンク列をストリームに流し、出力チャンクを結合して返します。
 */
async function pumpThrough(
  stream: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
  chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const outputs: Array<Uint8Array<ArrayBuffer>> = [];
  const reading = (async () => {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        return;
      }

      outputs.push(value);
    }
  })();

  for (const chunk of chunks) {
    await writer.write(chunk);
  }

  await writer.close();
  await reading;

  const total = outputs.reduce((sum, output) => sum + output.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;

  for (const output of outputs) {
    joined.set(output, offset);
    offset += output.byteLength;
  }

  return joined;
}

/**
 * バイト列を指定幅で分割します。
 */
function splitIntoChunks(
  data: Uint8Array<ArrayBuffer>,
  width: number,
): Array<Uint8Array<ArrayBuffer>> {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];

  for (let offset = 0; offset < data.byteLength; offset += width) {
    chunks.push(data.slice(offset, offset + width));
  }

  return chunks;
}

describe("インスタンスの状態", () => {
  test("初期状態で isOpen が false であり open 後に true になる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(128, 31);

    // 実行
    expect(target.isOpen).toBe(false);
    await target.open({ signal });
    const encoded = await target.encode({ data: input });
    await target.decode({ data: encoded });

    // 検証
    expect(target.name).toBe("ZstdNode");
    expect(target.isOpen).toBe(true);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(target.decode({ data: invalidData })).rejects.toThrow(Error);
    expect(target.isOpen).toBe(true);
  });

  test("open 前の encode と decode は TypeError で拒否される", async ({ expect }) => {
    // 準備
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(128, 37);

    // 実行と検証
    expect(target.isOpen).toBe(false);
    await expect(target.encode({ data: input })).rejects.toThrow(TypeError);
    await expect(target.decode({ data: input })).rejects.toThrow(TypeError);
  });

  test("open を持ち close を持たない", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();

    // 実行と検証
    expect(target.isOpen).toBe(false);
    expect(typeof target.open).toBe("function");
    expect("close" in target).toBe(false);

    await target.open({ signal });
    expect(target.isOpen).toBe(true);
  });
});

describe("インスタンスの独立性", () => {
  test("異なるレベルの複数インスタンスを同時に使っても互いに影響しない", async ({
    expect,
    signal,
  }) => {
    // 準備
    const instances = [1, 3, 10, 22].map((level) => new ZstdNode({ level }));
    await Promise.all(instances.map(async (target) => await target.open({ signal })));
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

  test("同一レベルと異なるレベルのインスタンス間で展開互換がある", async ({ expect, signal }) => {
    // 準備
    const low = new ZstdNode({ level: 1 });
    const high = new ZstdNode({ level: 22 });
    await low.open({ signal });
    await high.open({ signal });
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
  test("encode と decode は引数の data を変更しない", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
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

describe("ストリーム API の提供", () => {
  test("getEncodable と getDecodable を持つ", ({ expect }) => {
    // 準備
    const target = new ZstdNode();

    // 実行と検証
    expect(typeof target.getEncodable).toBe("function");
    expect(typeof target.getDecodable).toBe("function");
  });

  test("open 前に呼ぶと TypeError で拒否される", ({ expect }) => {
    // 準備
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new ZstdNode();

    // 実行と検証
    expect(() => target.getEncodable()).toThrow(TypeError);
    expect(() => target.getDecodable()).toThrow(TypeError);
  });

  test("分割書き込みしてもストリームで往復できる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(4096, 35);

    // 実行
    const encoded = await pumpThrough(target.getEncodable(), splitIntoChunks(input, 7));
    const decoded = await pumpThrough(target.getDecodable(), splitIntoChunks(encoded, 5));

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("Buffer を書き込んでもストリームで往復できる", async ({ expect, signal }) => {
    // 準備
    // Node の Buffer 入力は複写せずそのまま渡す分岐を通る。
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(1024, 38);
    const bufferChunks = splitIntoChunks(input, 13).map(
      (chunk) =>
        Buffer.from(
          chunk.buffer,
          chunk.byteOffset,
          chunk.byteLength,
        ) as unknown as Uint8Array<ArrayBuffer>,
    );

    // 実行
    const encoded = await pumpThrough(target.getEncodable(), bufferChunks);
    const encodedBufferChunks = splitIntoChunks(encoded, 7).map(
      (chunk) =>
        Buffer.from(
          chunk.buffer,
          chunk.byteOffset,
          chunk.byteLength,
        ) as unknown as Uint8Array<ArrayBuffer>,
    );
    const decoded = await pumpThrough(target.getDecodable(), encodedBufferChunks);

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("ストリームの出力チャンクは所有化されている", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(256, 36);
    const stream = target.getEncodable();
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // 実行
    await writer.write(input);
    await writer.close();
    const outputs: Array<Uint8Array<ArrayBuffer>> = [];

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputs.push(value);
    }

    // 検証
    expect(outputs.length).toBeGreaterThan(0);

    for (const output of outputs) {
      expect(output.buffer).toBeInstanceOf(ArrayBuffer);
      expect(output.byteOffset).toBe(0);
      expect(output.byteLength).toBe(output.buffer.byteLength);
    }
  });
});
