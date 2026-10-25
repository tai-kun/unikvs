import { sha256 } from "@noble/hashes/sha2.js";
import type { IMiddleware } from "@unikvs/core";
import {
  type TestContextValues,
  toHex,
  createNext,
  sourceFrom,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { ChecksumSha256, ChecksumMismatchError, ChecksumRequiredError } from "../src/index.js";

const DATA = Uint8Array.from(new TextEncoder().encode("checksum-transparency"));
const DIGEST = toHex(sha256(DATA));
const WRONG_DIGEST = "0".repeat(DIGEST.length);
const VAR_NAME = ChecksumSha256.CHECKSUM_VAR_NAME;

/**
 * データを検証してそのまま返します。
 */
async function encode(
  data: Uint8Array<ArrayBuffer>,
  values?: TestContextValues,
  required = false,
): Promise<Uint8Array<ArrayBuffer>> {
  const checksum = new ChecksumSha256(required ? { required: true } : undefined);
  const c = createEncodeContext(data, "", { values });
  await checksum.encode(
    c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * データを検証してそのまま返します。
 */
async function decode(
  data: Uint8Array<ArrayBuffer>,
  values?: TestContextValues,
): Promise<Uint8Array<ArrayBuffer>> {
  const checksum = new ChecksumSha256();
  const c = createDecodeContext(data, "", { values });
  await checksum.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * チャンク列を検証ストリームに流し、終了時のエラーを返します。
 */
async function runStream(
  chunks: readonly Uint8Array<ArrayBuffer>[],
  values: TestContextValues | undefined,
  isDecode: boolean,
): Promise<unknown> {
  const checksum = new ChecksumSha256();
  const c = isDecode
    ? createDecodeStreamContext(sourceFrom(chunks), "", { values })
    : createEncodeStreamContext(sourceFrom(chunks), "", { values });
  await checksum[isDecode ? "decodeStream" : "encodeStream"](
    c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> &
      IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  let result: unknown;

  try {
    const reader = (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();

    for (;;) {
      const { done } = await reader.read();

      if (done) {
        break;
      }
    }

    result = undefined;
  } catch (error) {
    result = error;
  }

  return result;
}

describe("データの透過", () => {
  test("encode は検証に成功すると入力データと同じ参照を返す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    const c = createEncodeContext(DATA, "", { values: { [VAR_NAME]: DIGEST } });
    await checksum.encode(
      c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    );

    // 検証：
    expect(c.destination).toBe(DATA);
  });

  test("decode は検証に成功すると入力データと同じ参照を返す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    const c = createDecodeContext(DATA, "", { values: { [VAR_NAME]: DIGEST } });
    await checksum.decode(
      c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    );

    // 検証：
    expect(c.destination).toBe(DATA);
  });

  test("チェックサム未指定の encode は入力データと同じ参照を返す", async ({ expect }) => {
    // 実行：
    const result = await encode(DATA);

    // 検証：
    expect(result).toBe(DATA);
  });

  test("チェックサム未指定の decode は入力データと同じ参照を返す", async ({ expect }) => {
    // 実行：
    const result = await decode(DATA);

    // 検証：
    expect(result).toBe(DATA);
  });
});

describe("副作用のなさ", () => {
  test("encode はコンテキストの変数を変更しない", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const c = createEncodeContext(DATA, "", { values: { [VAR_NAME]: DIGEST } });

    // 実行：
    await checksum.encode(
      c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    );

    // 検証：
    expect(c.get(VAR_NAME)).toBe(DIGEST);
  });

  test("encode は入力データの内容を変更しない", async ({ expect }) => {
    // 準備：
    const data = Uint8Array.from(DATA);
    const before = Array.from(data);

    // 実行：
    await encode(data, { [VAR_NAME]: DIGEST });

    // 検証：
    expect(Array.from(data)).toStrictEqual(before);
  });
});

describe("失敗後の再利用", () => {
  test("不一致エラーの後でも同じインスタンスで再検証できる", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    let thrown: unknown;

    try {
      const c = createEncodeContext(DATA, "", { values: { [VAR_NAME]: WRONG_DIGEST } });
      await checksum.encode(
        c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
        createNext(),
      );
    } catch (error) {
      thrown = error;
    }

    const result = await decode(DATA, { [VAR_NAME]: DIGEST });

    // 検証：
    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect(result).toBe(DATA);
  });

  test("必須エラーの後でも同じインスタンスで再検証できる", async ({ expect }) => {
    // 実行：
    let thrown: unknown;

    try {
      await encode(DATA, undefined, true);
    } catch (error) {
      thrown = error;
    }

    const result = await encode(DATA, { [VAR_NAME]: DIGEST });

    // 検証：
    expect(thrown).toBeInstanceOf(ChecksumRequiredError);
    expect(result).toBe(DATA);
  });

  test("ストリームで不一致になった後でも同じインスタンスで再検証できる", async ({ expect }) => {
    // 実行：
    const first = await runStream([DATA], { [VAR_NAME]: WRONG_DIGEST }, false);
    const second = await runStream([DATA], { [VAR_NAME]: DIGEST }, true);

    // 検証：
    expect(first).toBeInstanceOf(ChecksumMismatchError);
    expect(second).toBeUndefined();
  });
});
