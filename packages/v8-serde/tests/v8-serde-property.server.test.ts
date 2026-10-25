import type { IMiddleware } from "@unikvs/core";
import {
  type Random,
  createNext,
  sourceFrom,
  concatBytes,
  forCasesAsync,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import V8Serde from "../src/v8-serde.js";

const SEED = 20_240_927;
const CASE_COUNT = 50;
const STREAM_CASE_COUNT = 30;

/**
 * 開済みのターゲットを作成します。
 */
async function createOpenedTarget(signal: AbortSignal): Promise<V8Serde> {
  const target = new V8Serde();
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

  return target;
}

/**
 * 値をシリアライズしてバイト列で返します。
 */
async function encode(target: V8Serde, data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(
    c as IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * バイト列をデシリアライズして値を返します。
 */
async function decode(target: V8Serde, data: Uint8Array<ArrayBuffer>): Promise<unknown> {
  const c = createDecodeContext(data);
  await target.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, unknown>,
    createNext(),
  );

  return c.destination;
}

/**
 * 往復対象になる決定的なランダム値を生成します。
 * v8.serialize が拒否する値は生成せず、undefined は含めます。
 * ネストが深くなりすぎないよう、深さ 3 に達したらプリミティブのみを選びます。
 */
function generateValue(random: Random, depth = 0): unknown {
  const primitiveKinds = [
    "null",
    "bool",
    "int",
    "float",
    "string",
    "bigint",
    "bytes",
    "undefined",
  ] as const;
  const compositeKinds = ["array", "object", "map", "set", "date", "regexp", "typedArray"] as const;
  const kinds = depth >= 3 ? primitiveKinds : ([...primitiveKinds, ...compositeKinds] as const);
  const kind = random.pick(kinds);
  let value: unknown;

  switch (kind) {
    case "null": {
      value = null;
      break;
    }

    case "undefined": {
      value = undefined;
      break;
    }

    case "bool": {
      value = random.bool();
      break;
    }

    case "int": {
      value = random.int(-1000, 1000);
      break;
    }

    case "float": {
      value = random.next() * 1000 - 500;
      break;
    }

    case "string": {
      value = random.string(random.uint(12));
      break;
    }

    case "bigint": {
      // 任意の大きさの bigint が bigint のまま往復することを確認します。
      if (random.bool()) {
        value = BigInt(random.int(-1_000_000, 1_000_000));
      } else {
        value =
          ((BigInt(random.uint(0xff_ff_ff_ff)) << 64n) + BigInt(random.uint(0xff_ff_ff_ff))) *
          (random.bool() ? 1n : -1n);
      }

      break;
    }

    case "bytes": {
      value = random.bytes(random.uint(16));
      break;
    }

    case "array": {
      value = random.array(random.uint(4), (childRandom) => generateValue(childRandom, depth + 1));
      break;
    }

    case "object": {
      value = Object.fromEntries(
        random.array(random.uint(4), (childRandom): [string, unknown] => [
          `k${childRandom.string(1 + childRandom.uint(4))}`,
          generateValue(childRandom, depth + 1),
        ]),
      );
      break;
    }

    case "map": {
      value = new Map(
        random.array(random.uint(4), (childRandom): [unknown, unknown] => [
          generateValue(childRandom, depth + 1),
          generateValue(childRandom, depth + 1),
        ]),
      );
      break;
    }

    case "set": {
      value = new Set(
        random.array(random.uint(4), (childRandom) => generateValue(childRandom, depth + 1)),
      );
      break;
    }

    case "date": {
      value = new Date(random.int(-4_000_000_000_000, 4_000_000_000_000));
      break;
    }

    case "regexp": {
      value = new RegExp(
        random.string(1 + random.uint(6)),
        random.pick(["", "g", "i", "m", "s", "u", "y", "gi", "gimsuy"]),
      );
      break;
    }

    case "typedArray": {
      const length = random.uint(8);
      const typedArrayKind = random.pick(["int16", "float64"] as const);

      if (typedArrayKind === "int16") {
        value = new Int16Array(
          random.array(length, (childRandom) => childRandom.int(-32_768, 32_767)),
        );
      } else {
        value = new Float64Array(
          random.array(length, (childRandom) => childRandom.next() * 1000 - 500),
        );
      }

      break;
    }

    default: {
      throw new Error(`Unknown kind: ${String(kind)}`);
    }
  }

  return value;
}

/**
 * バイト列を 1 バイト以上 8 バイト以下のランダムな長さで分割します。
 */
function splitRandomly(random: Random, bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const size = 1 + random.uint(8);
    chunks.push(bytes.subarray(offset, Math.min(offset + size, bytes.length)));
    offset += size;
  }

  return chunks;
}

/**
 * 値を 4 バイトの長さヘッダー付きフレームへ変換します。
 */
async function encodeFrame(target: V8Serde, data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeStreamContext(sourceFrom([data]));
  await target.encodeStream(
    c as IMiddleware.EncodeStreamContext<unknown, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  const reader = (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    outputChunks.push(value);
  }

  return concatBytes(outputChunks);
}

/**
 * チャンク列をデコードストリームに流し、出力された値を返します。
 */
async function pumpDecode(
  target: V8Serde,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: unknown[];
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await target.decodeStream(
    c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, unknown>,
    createNext(),
  );

  const outputChunks: unknown[] = [];
  let readError: unknown;

  try {
    const reader = (c.destination as ReadableStream<unknown>).getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    }
  } catch (ex) {
    readError = ex;
  }

  return {
    readError,
    writeError: undefined,
    outputChunks,
  };
}

describe("決定的ファズテスト", () => {
  test("ランダムな値を一括で往復すると元の値に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行と検証：
    await forCasesAsync(SEED, CASE_COUNT, async (random, index) => {
      const value = generateValue(random);

      const encoded = await encode(target, value);
      const decoded = await decode(target, encoded);
      expect(decoded, `case ${index}`).toStrictEqual(value);
    });
  });

  test("ランダムな値をランダムなチャンクに分割してストリームで往復すると元の値に戻る", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行と検証：
    await forCasesAsync(SEED + 1, STREAM_CASE_COUNT, async (random, index) => {
      const value = generateValue(random);
      const frame = await encodeFrame(target, value);
      const chunks = splitRandomly(random, frame);

      const decoded = await pumpDecode(target, chunks);
      expect(decoded.writeError, `case ${index}`).toBeUndefined();
      expect(decoded.readError, `case ${index}`).toBeUndefined();
      expect(decoded.outputChunks, `case ${index}`).toStrictEqual([value]);
    });
  });

  test("ランダムな値のシーケンスをストリームで往復すると元の値に戻る", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行と検証：
    await forCasesAsync(SEED + 2, STREAM_CASE_COUNT, async (random, index) => {
      const values = random.array(random.uint(6), (childRandom) => generateValue(childRandom));
      const frames = await Promise.all(values.map((value) => encodeFrame(target, value)));
      const chunks = splitRandomly(random, concatBytes(frames));

      const decoded = await pumpDecode(target, chunks);
      expect(decoded.writeError, `case ${index}`).toBeUndefined();
      expect(decoded.readError, `case ${index}`).toBeUndefined();
      expect(decoded.outputChunks, `case ${index}`).toStrictEqual(values);
    });
  });
});
