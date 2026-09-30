import { sha256 } from "@noble/hashes/sha2.js";
import { describe, test } from "vitest";

import { ChecksumMismatchError, ChecksumRequiredError, ChecksumSha256 } from "../src/index.js";
import { runTransform, toHex } from "./_helpers.js";

const DATA = Uint8Array.from(new TextEncoder().encode("checksum-transparency"));
const DIGEST = toHex(sha256(DATA));
const WRONG_DIGEST = "0".repeat(DIGEST.length);
const VAR_NAME = ChecksumSha256.CHECKSUM_VAR_NAME;

describe("データの透過", () => {
  test("encode は検証に成功すると入力データと同じ参照を返す", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();

    // 実行
    const result = checksum.encode({ vars: { [VAR_NAME]: DIGEST }, data: DATA });

    // 検証
    expect(result).toBe(DATA);
  });

  test("decode は検証に成功すると入力データと同じ参照を返す", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();

    // 実行
    const result = checksum.decode({ vars: { [VAR_NAME]: DIGEST }, data: DATA });

    // 検証
    expect(result).toBe(DATA);
  });

  test("チェックサム未指定の encode は入力データと同じ参照を返す", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();

    // 実行
    const result = checksum.encode({ vars: {}, data: DATA });

    // 検証
    expect(result).toBe(DATA);
  });

  test("チェックサム未指定の decode は入力データと同じ参照を返す", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();

    // 実行
    const result = checksum.decode({ vars: {}, data: DATA });

    // 検証
    expect(result).toBe(DATA);
  });
});

describe("副作用のなさ", () => {
  test("encode は vars を変更しない", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const vars = Object.freeze({ [VAR_NAME]: DIGEST });

    // 実行
    checksum.encode({ vars, data: DATA });

    // 検証
    expect(Object.keys(vars)).toStrictEqual([VAR_NAME]);
    expect(vars[VAR_NAME]).toBe(DIGEST);
  });

  test("encode は入力データの内容を変更しない", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const data = Uint8Array.from(DATA);
    const before = Array.from(data);

    // 実行
    checksum.encode({ vars: { [VAR_NAME]: DIGEST }, data });

    // 検証
    expect(Array.from(data)).toStrictEqual(before);
  });
});

describe("失敗後の再利用", () => {
  test("不一致エラーの後でも同じインスタンスで再検証できる", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();

    // 実行
    let thrown: unknown;
    try {
      checksum.encode({ vars: { [VAR_NAME]: WRONG_DIGEST }, data: DATA });
    } catch (error) {
      thrown = error;
    }
    const result = checksum.decode({ vars: { [VAR_NAME]: DIGEST }, data: DATA });

    // 検証
    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect(result).toBe(DATA);
  });

  test("必須エラーの後でも同じインスタンスで再検証できる", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256({ required: true });

    // 実行
    let thrown: unknown;
    try {
      checksum.encode({ vars: {}, data: DATA });
    } catch (error) {
      thrown = error;
    }
    const result = checksum.encode({ vars: { [VAR_NAME]: DIGEST }, data: DATA });

    // 検証
    expect(thrown).toBeInstanceOf(ChecksumRequiredError);
    expect(result).toBe(DATA);
  });

  test("ストリームで不一致になった後でも同じインスタンスで再検証できる", async ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();

    // 実行
    const first = await runTransform(
      checksum.getEncodable({ vars: { [VAR_NAME]: WRONG_DIGEST } }),
      [DATA],
    );
    const second = await runTransform(checksum.getDecodable({ vars: { [VAR_NAME]: DIGEST } }), [
      DATA,
    ]);

    // 検証
    expect(first.closeError).toBeInstanceOf(ChecksumMismatchError);
    expect(second.closeError).toBeUndefined();
  });
});
