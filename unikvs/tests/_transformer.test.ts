import type { Variables, IDecodable, ITransformer, IEncodable } from "@unikvs/core";
import { describe, test } from "vitest";

import UniKvsTransformer from "../src/_transformer.js";
import {
  InvalidOutputError,
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

/**
 * getEncodable / getDecodable が任意の値を返すトランスフォーマーモックです。
 */
class MockStreamTransformer extends MockTransformer {
  readonly encodableOutput: unknown;
  readonly decodableOutput: unknown;

  public constructor(
    encodableOutput: unknown = new TransformStream(),
    decodableOutput: unknown = new TransformStream(),
  ) {
    super();
    this.encodableOutput = encodableOutput;
    this.decodableOutput = decodableOutput;
  }

  public async getEncodable(_args: ITransformer.GetEncodableArgs): Promise<IEncodable> {
    return this.encodableOutput as IEncodable;
  }

  public async getDecodable(_args: ITransformer.GetDecodableArgs): Promise<IDecodable> {
    return this.decodableOutput as IDecodable;
  }
}

/**
 * `TransformStream` 互換のインターフェースを満たさない戻り値の一覧です。
 */
const INVALID_TRANSFORM_STREAM_OUTPUTS: readonly (readonly [string, unknown])[] = [
  ["null", null],
  ["文字列", "not-a-transform-stream"],
  ["空のオブジェクト", {}],
  ["readable と writable が null", { readable: null, writable: null }],
  ["readable が不正", { readable: {}, writable: new WritableStream() }],
  ["writable が不正", { readable: new ReadableStream(), writable: {} }],
];

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

describe("UniKvsTransformer - ストリーム戻り値の検証", () => {
  test("getEncodable が TransformStream を返すとき、その値を返す", async ({ expect }) => {
    // 準備
    const encodable = new TransformStream();
    const transformer = new UniKvsTransformer(new MockStreamTransformer(encodable));
    await transformer.open(TEST_VARS, TEST_SIGNAL);

    // 実行
    const result = await transformer.getEncodable(TEST_VARS, TEST_SIGNAL);

    // 検証
    expect(result).toBe(encodable);
  });

  test("getDecodable が TransformStream を返すとき、その値を返す", async ({ expect }) => {
    // 準備
    const decodable = new TransformStream();
    const transformer = new UniKvsTransformer(new MockStreamTransformer(undefined, decodable));
    await transformer.open(TEST_VARS, TEST_SIGNAL);

    // 実行
    const result = await transformer.getDecodable(TEST_VARS, TEST_SIGNAL);

    // 検証
    expect(result).toBe(decodable);
  });

  for (const [label, value] of INVALID_TRANSFORM_STREAM_OUTPUTS) {
    test(`getEncodable が ${label} を返すと InvalidOutputError を投げる`, async ({ expect }) => {
      // 準備
      const transformer = new UniKvsTransformer(new MockStreamTransformer(value));
      await transformer.open(TEST_VARS, TEST_SIGNAL);

      // 実行と検証
      await expect(transformer.getEncodable(TEST_VARS, TEST_SIGNAL)).rejects.toThrow(
        InvalidOutputError,
      );
    });

    test(`getDecodable が ${label} を返すと InvalidOutputError を投げる`, async ({ expect }) => {
      // 準備
      const transformer = new UniKvsTransformer(new MockStreamTransformer(undefined, value));
      await transformer.open(TEST_VARS, TEST_SIGNAL);

      // 実行と検証
      await expect(transformer.getDecodable(TEST_VARS, TEST_SIGNAL)).rejects.toThrow(
        InvalidOutputError,
      );
    });
  }
});
