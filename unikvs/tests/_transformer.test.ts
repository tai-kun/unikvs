import type { Variables, ITransformer } from "@unikvs/core";
import { describe, test } from "vitest";

import UniKvsTransformer from "../src/_transformer.js";
import {
  TransformerIsNotOpenError,
  EncodableStreamNotSupportedError,
  DecodableStreamNotSupportedError,
} from "../src/errors.js";

const TEST_VARS: Variables = {};
const TEST_SIGNAL = new AbortController().signal;

/**
 * encode 時に "encoded:" 接頭辞を付与し、decode 時に除去するトランスフォーマーモックです。
 */
class MockTransformer implements ITransformer {
  readonly name = "MockTransformer";
  isOpen = true;
  openCallCount = 0;
  closeCallCount = 0;

  async open(_args: ITransformer.OpenArgs): Promise<void> {
    this.openCallCount++;
    this.isOpen = true;
  }

  async close(_args: ITransformer.CloseArgs): Promise<void> {
    this.closeCallCount++;
    this.isOpen = false;
  }

  async encode(args: ITransformer.EncodeArgs): Promise<unknown> {
    return `encoded:${args.data}`;
  }

  async decode(args: ITransformer.DecodeArgs): Promise<unknown> {
    const str = args.data as string;
    return str.replace(/^encoded:/, "");
  }
}

describe("UniKvsTransformer - 初期化と接続管理", () => {
  test("ラップしたトランスフォーマーがオープンされているとき、open で open が呼ばれない", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockTransformer();
    mock.isOpen = true;
    const transformer = new UniKvsTransformer(mock);

    // 実行
    await transformer.open(TEST_VARS, TEST_SIGNAL);

    // 検証
    expect(mock.openCallCount).toBe(0);
  });

  test("ラップしたトランスフォーマーがクローズされているとき、open で open が呼ばれる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockTransformer();
    mock.isOpen = false;
    const transformer = new UniKvsTransformer(mock);

    // 実行
    await transformer.open(TEST_VARS, TEST_SIGNAL);

    // 検証
    expect(mock.openCallCount).toBe(1);
  });
});

describe("UniKvsTransformer - エンコード / デコード", () => {
  test("エンコードしたデータをデコードすると元の値に戻る", async ({ expect }) => {
    // 準備
    const transformer = new UniKvsTransformer(new MockTransformer());
    await transformer.open(TEST_VARS, TEST_SIGNAL);

    // 実行
    const encoded = await transformer.encode(TEST_VARS, TEST_SIGNAL, "hello");
    const decoded = await transformer.decode(TEST_VARS, TEST_SIGNAL, encoded);

    // 検証
    expect(decoded).toBe("hello");
  });
});

describe("UniKvsTransformer - 異常系・エラーハンドリング", () => {
  test("encode 時にトランスフォーマーが閉じていると TransformerIsNotOpenError を投げる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockTransformer();
    mock.isOpen = false;
    const transformer = new UniKvsTransformer(mock);

    // 実行と検証
    await expect(transformer.encode(TEST_VARS, TEST_SIGNAL, "data")).rejects.toThrow(
      TransformerIsNotOpenError,
    );
  });

  test("decode 時にトランスフォーマーが閉じていると TransformerIsNotOpenError を投げる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockTransformer();
    mock.isOpen = false;
    const transformer = new UniKvsTransformer(mock);

    // 実行と検証
    await expect(transformer.decode(TEST_VARS, TEST_SIGNAL, "data")).rejects.toThrow(
      TransformerIsNotOpenError,
    );
  });

  test("getEncodable でサポートしていないとき EncodableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const transformer = new UniKvsTransformer(new MockTransformer());
    await transformer.open(TEST_VARS, TEST_SIGNAL);

    // 実行と検証
    await expect(transformer.getEncodable(TEST_VARS, TEST_SIGNAL)).rejects.toThrow(
      EncodableStreamNotSupportedError,
    );
  });

  test("getDecodable でサポートしていないとき DecodableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const transformer = new UniKvsTransformer(new MockTransformer());
    await transformer.open(TEST_VARS, TEST_SIGNAL);

    // 実行と検証
    await expect(transformer.getDecodable(TEST_VARS, TEST_SIGNAL)).rejects.toThrow(
      DecodableStreamNotSupportedError,
    );
  });
});
