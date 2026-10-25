// oxlint-disable unicorn/number-literal-case
import type { IMiddleware } from "@unikvs/core";
import {
  type TestContextValues,
  createNext,
  sourceFrom,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { vi, test, describe, afterEach } from "vite-plus/test";

import Checksum, { type IHash, type IHasher } from "../src/checksum.js";
import {
  ChecksumMismatchError,
  ChecksumRequiredError,
  ChecksumInvalidVarNameError,
} from "../src/errors.js";

const VAR_NAME = "x-test-checksum";
const CHECKSUM_BYTES = new Uint8Array([0xab, 0xcd, 0xef]);
const CHECKSUM_HEX = "abcdef";

/**
 * 抽象クラスの Checksum をインスタンス化できるようにするための具象クラスです。
 */
class TestChecksum extends Checksum {
  public static override CHECKSUM_VAR_NAME: string = VAR_NAME;
}

/**
 * IHash と IHasher の呼び出しを記録するモックを作成します。
 */
function createHashMock(): {
  hash: IHash;
  create: IHash["create"];
  digest: IHasher["digest"];
  update: IHasher["update"];
} {
  const update = vi.fn<IHasher["update"]>();
  const digest = vi.fn<IHasher["digest"]>().mockReturnValue(CHECKSUM_BYTES);
  const create = vi.fn<IHash["create"]>(() => ({
    digest,
    update,
  }));
  const hash = vi.fn<IHash>().mockReturnValue(CHECKSUM_BYTES);
  hash.create = create;

  return {
    hash,
    create,
    digest,
    update,
  };
}

/**
 * データを検証してそのまま返します。
 */
async function encode(
  checksum: TestChecksum,
  data: Uint8Array<ArrayBuffer>,
  values?: TestContextValues,
): Promise<Uint8Array<ArrayBuffer>> {
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
  checksum: TestChecksum,
  data: Uint8Array<ArrayBuffer>,
  values?: TestContextValues,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data, "", { values });
  await checksum.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * チャンク列を検証ストリームに流し、出力されたチャンクと終了時のエラーを返します。
 */
async function runEncodeStream(
  checksum: TestChecksum,
  inputChunks: readonly Uint8Array<ArrayBuffer>[],
  values?: TestContextValues,
): Promise<{
  closeError: unknown;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createEncodeStreamContext(sourceFrom(inputChunks), "", { values });
  await checksum.encodeStream(
    c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let closeError: unknown;

  try {
    const reader = (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    }
  } catch (error) {
    closeError = error;
  }

  return {
    closeError,
    outputChunks,
  };
}

/**
 * チャンク列を検証ストリームに流し、出力されたチャンクと終了時のエラーを返します。
 */
async function runDecodeStream(
  checksum: TestChecksum,
  inputChunks: readonly Uint8Array<ArrayBuffer>[],
  values?: TestContextValues,
): Promise<{
  closeError: unknown;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createDecodeStreamContext(sourceFrom(inputChunks), "", { values });
  await checksum.decodeStream(
    c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let closeError: unknown;

  try {
    const reader = (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    }
  } catch (error) {
    closeError = error;
  }

  return {
    closeError,
    outputChunks,
  };
}

describe("Checksum", () => {
  afterEach(() => {
    TestChecksum.CHECKSUM_VAR_NAME = VAR_NAME;
  });

  describe("初期化と基本プロパティ", () => {
    test("指定した名前が name プロパティに設定される", ({ expect }) => {
      // 準備：
      const { hash } = createHashMock();

      // 実行：
      const checksum = new TestChecksum("sha256", hash);

      // 検証：
      expect(checksum.name).toBe("sha256");
    });

    test("isOpen プロパティは常に true を返す", ({ expect }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);

      // 実行と検証：
      expect(checksum.isOpen).toBe(true);
    });

    test("required オプションの指定内容が required プロパティに反映される", ({ expect }) => {
      // 準備と実行：
      const { hash } = createHashMock();
      const defaultValue = new TestChecksum("sha256", hash);
      const requiredValue = new TestChecksum("sha256", hash, { required: true });

      // 検証：
      expect(defaultValue.required).toBe(false);
      expect(requiredValue.required).toBe(true);
    });
  });

  describe("一括データの検証", () => {
    test("期待値と一致するチェックサムを指定して encode すると、ハッシュを計算してデータをそのまま返す", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const data = new Uint8Array([1, 2, 3]);

      // 実行：
      const result = await encode(checksum, data, { [VAR_NAME]: CHECKSUM_HEX });

      // 検証：
      expect(result).toStrictEqual(data);
      expect(hash).toHaveBeenCalledTimes(1);
    });

    test("チェックサムが指定されていなければ encode はハッシュを計算せずにデータをそのまま返す", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const data = new Uint8Array([1, 2, 3]);

      // 実行：
      const result = await encode(checksum, data);

      // 検証：
      expect(result).toStrictEqual(data);
      expect(hash).not.toHaveBeenCalled();
    });

    test("チェックサムの値が文字列以外であれば encode はハッシュを計算せずにデータをそのまま返す", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const data = new Uint8Array([1, 2, 3]);

      // 実行：
      const result = await encode(checksum, data, { [VAR_NAME]: 12_345 });

      // 検証：
      expect(result).toStrictEqual(data);
      expect(hash).not.toHaveBeenCalled();
    });

    test("検証が必須のときにチェックサムが指定されていなければ encode は ChecksumRequiredError を投げる", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash, { required: true });
      const data = new Uint8Array([1, 2, 3]);

      // 実行と検証：
      await expect(encode(checksum, data)).rejects.toThrow(ChecksumRequiredError);
    });

    test("検証が必須のときにチェックサムの値が文字列以外であれば encode は ChecksumRequiredError を投げる", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash, { required: true });
      const data = new Uint8Array([1, 2, 3]);

      // 実行と検証：
      await expect(encode(checksum, data, { [VAR_NAME]: 12_345 })).rejects.toThrow(
        ChecksumRequiredError,
      );
    });

    test("期待値と一致しないチェックサムを指定して encode すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const data = new Uint8Array([1, 2, 3]);

      // 実行：
      let thrown: unknown;

      try {
        await encode(checksum, data, { [VAR_NAME]: "incorrect" });
      } catch (error) {
        thrown = error;
      }

      // 検証：
      expect(thrown).toBeInstanceOf(ChecksumMismatchError);
      expect((thrown as ChecksumMismatchError).meta).toStrictEqual({
        actual: CHECKSUM_HEX,
        expected: "incorrect",
      });
    });

    test("期待値と一致するチェックサムを指定して decode すると、データをそのまま返す", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const data = new Uint8Array([1, 2, 3]);

      // 実行：
      const result = await decode(checksum, data, { [VAR_NAME]: CHECKSUM_HEX });

      // 検証：
      expect(result).toStrictEqual(data);
      expect(hash).toHaveBeenCalledTimes(1);
    });

    test("期待値と一致しないチェックサムを指定して decode すると ChecksumMismatchError を投げる", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const data = new Uint8Array([1, 2, 3]);

      // 実行と検証：
      await expect(decode(checksum, data, { [VAR_NAME]: "incorrect" })).rejects.toThrow(
        ChecksumMismatchError,
      );
    });

    test("検証が必須のときにチェックサムが指定されていなければ decode は ChecksumRequiredError を投げる", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash, { required: true });
      const data = new Uint8Array([1, 2, 3]);

      // 実行と検証：
      await expect(decode(checksum, data)).rejects.toThrow(ChecksumRequiredError);
    });

    test("CHECKSUM_VAR_NAME が文字列でなければ encode は ChecksumInvalidVarNameError を投げる", async ({
      expect,
    }) => {
      // 準備：
      // @ts-expect-error テストのために静的プロパティーを書き換える。
      TestChecksum.CHECKSUM_VAR_NAME = undefined;
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const data = new Uint8Array([1, 2, 3]);

      // 実行と検証：
      await expect(encode(checksum, data, { [VAR_NAME]: CHECKSUM_HEX })).rejects.toThrow(
        ChecksumInvalidVarNameError,
      );
    });
  });

  describe("ストリームによる検証", () => {
    test("期待値と一致するチェックサムを指定して encodeStream すると、全チャンクを透過させて正常に閉じる", async ({
      expect,
    }) => {
      // 準備：
      const { hash, digest, update } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const chunk1 = new Uint8Array([1, 2]);
      const chunk2 = new Uint8Array([3, 4]);

      // 実行：
      const { closeError, outputChunks } = await runEncodeStream(checksum, [chunk1, chunk2], {
        [VAR_NAME]: CHECKSUM_HEX,
      });

      // 検証：
      expect(closeError).toBeUndefined();
      expect(outputChunks).toStrictEqual([chunk1, chunk2]);
      expect(update).toHaveBeenCalledTimes(2);
      expect(digest).toHaveBeenCalledTimes(1);
    });

    test("チェックサムが指定されていなければ encodeStream はハッシュ関数を使わない透過ストリームを返す", async ({
      expect,
    }) => {
      // 準備：
      const { hash, create } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const chunk = new Uint8Array([1, 2, 3]);

      // 実行：
      const { closeError, outputChunks } = await runEncodeStream(checksum, [chunk]);

      // 検証：
      expect(closeError).toBeUndefined();
      expect(outputChunks).toStrictEqual([chunk]);
      expect(create).not.toHaveBeenCalled();
    });

    test("チェックサムの値が文字列以外であれば encodeStream はハッシュ関数を使わない透過ストリームを返す", async ({
      expect,
    }) => {
      // 準備：
      const { hash, create } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const chunk = new Uint8Array([1, 2, 3]);

      // 実行：
      const { closeError, outputChunks } = await runEncodeStream(checksum, [chunk], {
        [VAR_NAME]: 123,
      });

      // 検証：
      expect(closeError).toBeUndefined();
      expect(outputChunks).toStrictEqual([chunk]);
      expect(create).not.toHaveBeenCalled();
    });

    test("検証が必須のときにチェックサムが指定されていなければ encodeStream は ChecksumRequiredError を投げる", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash, { required: true });

      // 実行と検証：
      const c = createEncodeStreamContext(sourceFrom([]));
      await expect(
        checksum.encodeStream(
          c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
          createNext(),
        ),
      ).rejects.toThrow(ChecksumRequiredError);
    });

    test("期待値と一致しないチェックサムを指定して encodeStream すると、ストリームを閉じたときに ChecksumMismatchError で失敗する", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);

      // 実行：
      const { closeError } = await runEncodeStream(checksum, [new Uint8Array([1, 2, 3])], {
        [VAR_NAME]: "incorrect",
      });

      // 検証：
      expect(closeError).toBeInstanceOf(ChecksumMismatchError);
    });

    test("期待値と一致するチェックサムを指定して decodeStream すると、全チャンクを透過させて正常に閉じる", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const chunk1 = new Uint8Array([1, 2]);
      const chunk2 = new Uint8Array([3, 4]);

      // 実行：
      const { closeError, outputChunks } = await runDecodeStream(checksum, [chunk1, chunk2], {
        [VAR_NAME]: CHECKSUM_HEX,
      });

      // 検証：
      expect(closeError).toBeUndefined();
      expect(outputChunks).toStrictEqual([chunk1, chunk2]);
    });

    test("期待値と一致しないチェックサムを指定して decodeStream すると、ストリームを閉じたときに ChecksumMismatchError で失敗する", async ({
      expect,
    }) => {
      // 準備：
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);

      // 実行：
      const { closeError } = await runDecodeStream(checksum, [new Uint8Array([1, 2, 3])], {
        [VAR_NAME]: "incorrect",
      });

      // 検証：
      expect(closeError).toBeInstanceOf(ChecksumMismatchError);
    });

    test("CHECKSUM_VAR_NAME が文字列でなければ encodeStream は ChecksumInvalidVarNameError を投げる", async ({
      expect,
    }) => {
      // 準備：
      // @ts-expect-error テストのために静的プロパティーを書き換える。
      TestChecksum.CHECKSUM_VAR_NAME = undefined;
      const { hash } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);

      // 実行と検証：
      const c = createEncodeStreamContext(sourceFrom([]), "", {
        values: { [VAR_NAME]: CHECKSUM_HEX },
      });
      await expect(
        checksum.encodeStream(
          c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
          createNext(),
        ),
      ).rejects.toThrow(ChecksumInvalidVarNameError);
    });
  });

  describe("大きなチャンクの分割処理", () => {
    test("4 GB ちょうどのチャンクは分割せずに 1 回の更新処理に渡される", async ({ expect }) => {
      // 準備：
      const { hash, update } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      // メモリーの枯渇を避けるため、length を偽装した Uint8Array のようなオブジェクトを使用する。
      const subarray = vi.fn<(start: number, end: number) => Uint8Array<ArrayBuffer>>(
        () => new Uint8Array([1]),
      );
      const fakeChunk = {
        length: 4_000_000_000,
        subarray,
      } as unknown as Uint8Array<ArrayBuffer>;

      // 実行：
      const { closeError } = await runEncodeStream(checksum, [fakeChunk], {
        [VAR_NAME]: CHECKSUM_HEX,
      });

      // 検証：
      expect(closeError).toBeUndefined();
      expect(update).toHaveBeenCalledTimes(1);
    });

    test("4 GB を超えるチャンクは 4 GB ごとに分割されて更新処理に渡される", async ({ expect }) => {
      // 準備：
      const { hash, update } = createHashMock();
      const checksum = new TestChecksum("sha256", hash);
      const subarray = vi.fn<(start: number, end: number) => Uint8Array<ArrayBuffer>>(
        () => new Uint8Array([1]),
      );
      const fakeChunk = {
        length: 4_000_000_000 + 1,
        subarray,
      } as unknown as Uint8Array<ArrayBuffer>;

      // 実行：
      const { closeError } = await runEncodeStream(checksum, [fakeChunk], {
        [VAR_NAME]: CHECKSUM_HEX,
      });

      // 検証：
      expect(closeError).toBeUndefined();
      expect(update).toHaveBeenCalledTimes(2);
      expect(subarray).toHaveBeenNthCalledWith(1, 0, 4_000_000_000);
      expect(subarray).toHaveBeenNthCalledWith(2, 4_000_000_000, 4_000_000_001);
    });
  });
});
