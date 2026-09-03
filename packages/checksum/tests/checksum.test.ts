import { afterEach, describe, test, vi } from "vitest";

import Checksum, { type IHash, type IHasher } from "../src/checksum.js";
import {
  ChecksumInvalidVarNameError,
  ChecksumMismatchError,
  ChecksumRequiredError,
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
function createHashMock() {
  const update = vi.fn<IHasher["update"]>();
  const digest = vi.fn<IHasher["digest"]>().mockReturnValue(CHECKSUM_BYTES);
  const create = vi.fn<IHash["create"]>(() => ({ update, digest }));
  const hash = vi.fn<IHash>().mockReturnValue(CHECKSUM_BYTES);
  hash.create = create;

  return { hash, create, update, digest };
}

/**
 * 変換ストリームにチャンクを順に書き込み、読み取れるデータをすべて読み取る補助関数です。
 * バックプレッシャーによるデッドロックを避けるため、書き込みと読み取りを並行して行います。
 */
async function runTransform(
  stream: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
  inputChunks: Uint8Array<ArrayBuffer>[],
): Promise<{ outputChunks: Uint8Array<ArrayBuffer>[]; closeError: unknown }> {
  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let closeError: unknown;
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();

  const pumping = (async () => {
    for (const chunk of inputChunks) {
      await writer.write(chunk);
    }

    try {
      await writer.close();
    } catch (error) {
      closeError = error;
    }
  })();

  while (true) {
    try {
      const { done, value } = await reader.read();
      if (done) break;
      outputChunks.push(value);
    } catch (error) {
      closeError ??= error;
      break;
    }
  }

  await pumping;

  return { outputChunks, closeError };
}

afterEach(() => {
  TestChecksum.CHECKSUM_VAR_NAME = VAR_NAME;
});

describe("初期化と基本プロパティ", () => {
  test("指定した名前が name プロパティに設定される", ({ expect }) => {
    // 準備
    const { hash } = createHashMock();

    // 実行
    const checksum = new TestChecksum("sha256", hash);

    // 検証
    expect(checksum.name).toBe("sha256");
  });

  test("isOpen プロパティは常に true を返す", ({ expect }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);

    // 実行と検証
    expect(checksum.isOpen).toBe(true);
  });

  test("required オプションの指定内容が required プロパティに反映される", ({ expect }) => {
    // 準備と実行
    const { hash } = createHashMock();
    const defaultValue = new TestChecksum("sha256", hash);
    const requiredValue = new TestChecksum("sha256", hash, { required: true });

    // 検証
    expect(defaultValue.required).toBe(false);
    expect(requiredValue.required).toBe(true);
  });
});

describe("一括データの検証", () => {
  test("期待値と一致するチェックサムを指定して encode すると、ハッシュを計算してデータをそのまま返す", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const data = new Uint8Array([1, 2, 3]);
    const vars = { [VAR_NAME]: CHECKSUM_HEX };

    // 実行
    const result = checksum.encode({ vars, data });

    // 検証
    expect(result).toStrictEqual(data);
    expect(hash).toHaveBeenCalledTimes(1);
  });

  test("チェックサムが指定されていなければ encode はハッシュを計算せずにデータをそのまま返す", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const result = checksum.encode({ vars: {}, data });

    // 検証
    expect(result).toStrictEqual(data);
    expect(hash).not.toHaveBeenCalled();
  });

  test("チェックサムの値が文字列以外であれば encode はハッシュを計算せずにデータをそのまま返す", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const data = new Uint8Array([1, 2, 3]);
    const vars = { [VAR_NAME]: 12345 };

    // 実行
    const result = checksum.encode({ vars, data });

    // 検証
    expect(result).toStrictEqual(data);
    expect(hash).not.toHaveBeenCalled();
  });

  test("検証が必須のときにチェックサムが指定されていなければ encode は ChecksumRequiredError を投げる", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash, { required: true });
    const data = new Uint8Array([1, 2, 3]);

    // 実行と検証
    expect(() => checksum.encode({ vars: {}, data })).toThrow(ChecksumRequiredError);
  });

  test("検証が必須のときにチェックサムの値が文字列以外であれば encode は ChecksumRequiredError を投げる", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash, { required: true });
    const data = new Uint8Array([1, 2, 3]);
    const vars = { [VAR_NAME]: 12345 };

    // 実行と検証
    expect(() => checksum.encode({ vars, data })).toThrow(ChecksumRequiredError);
  });

  test("期待値と一致しないチェックサムを指定して encode すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const data = new Uint8Array([1, 2, 3]);
    const vars = { [VAR_NAME]: "incorrect" };

    // 実行
    let thrown: unknown;
    try {
      checksum.encode({ vars, data });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({
      actual: CHECKSUM_HEX,
      expected: "incorrect",
    });
  });

  test("期待値と一致するチェックサムを指定して decode すると、データをそのまま返す", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const data = new Uint8Array([1, 2, 3]);
    const vars = { [VAR_NAME]: CHECKSUM_HEX };

    // 実行
    const result = checksum.decode({ vars, data });

    // 検証
    expect(result).toStrictEqual(data);
    expect(hash).toHaveBeenCalledTimes(1);
  });

  test("期待値と一致しないチェックサムを指定して decode すると ChecksumMismatchError を投げる", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const data = new Uint8Array([1, 2, 3]);
    const vars = { [VAR_NAME]: "incorrect" };

    // 実行と検証
    expect(() => checksum.decode({ vars, data })).toThrow(ChecksumMismatchError);
  });

  test("検証が必須のときにチェックサムが指定されていなければ decode は ChecksumRequiredError を投げる", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash, { required: true });
    const data = new Uint8Array([1, 2, 3]);

    // 実行と検証
    expect(() => checksum.decode({ vars: {}, data })).toThrow(ChecksumRequiredError);
  });

  test("CHECKSUM_VAR_NAME が文字列でなければ encode は ChecksumInvalidVarNameError を投げる", ({
    expect,
  }) => {
    // 準備
    // @ts-expect-error テストのために静的プロパティーを書き換える。
    TestChecksum.CHECKSUM_VAR_NAME = undefined;
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const data = new Uint8Array([1, 2, 3]);
    const vars = { [VAR_NAME]: CHECKSUM_HEX };

    // 実行と検証
    expect(() => checksum.encode({ vars, data })).toThrow(ChecksumInvalidVarNameError);
  });
});

describe("ストリームによる検証", () => {
  test("期待値と一致するチェックサムを指定して getEncodable すると、全チャンクを透過させて正常に閉じる", async ({
    expect,
  }) => {
    // 準備
    const { hash, update, digest } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const transformStream = checksum.getEncodable({ vars: { [VAR_NAME]: CHECKSUM_HEX } });
    const chunk1 = new Uint8Array([1, 2]);
    const chunk2 = new Uint8Array([3, 4]);

    // 実行
    const { outputChunks, closeError } = await runTransform(transformStream, [chunk1, chunk2]);

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([chunk1, chunk2]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(1);
  });

  test("チェックサムが指定されていなければ getEncodable はハッシュ関数を使わない透過ストリームを返す", async ({
    expect,
  }) => {
    // 準備
    const { hash, create } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const transformStream = checksum.getEncodable({ vars: {} });
    const chunk = new Uint8Array([1, 2, 3]);

    // 実行
    const { outputChunks, closeError } = await runTransform(transformStream, [chunk]);

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([chunk]);
    expect(create).not.toHaveBeenCalled();
  });

  test("チェックサムの値が文字列以外であれば getEncodable はハッシュ関数を使わない透過ストリームを返す", async ({
    expect,
  }) => {
    // 準備
    const { hash, create } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const transformStream = checksum.getEncodable({ vars: { [VAR_NAME]: 123 } });
    const chunk = new Uint8Array([1, 2, 3]);

    // 実行
    const { outputChunks, closeError } = await runTransform(transformStream, [chunk]);

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([chunk]);
    expect(create).not.toHaveBeenCalled();
  });

  test("検証が必須のときにチェックサムが指定されていなければ getEncodable は ChecksumRequiredError を投げる", ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash, { required: true });

    // 実行と検証
    expect(() => checksum.getEncodable({ vars: {} })).toThrow(ChecksumRequiredError);
  });

  test("期待値と一致しないチェックサムを指定して getEncodable すると、ストリームを閉じたときに ChecksumMismatchError で失敗する", async ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const transformStream = checksum.getEncodable({
      vars: { [VAR_NAME]: "incorrect" },
    });

    // 実行
    const { closeError } = await runTransform(transformStream, [new Uint8Array([1, 2, 3])]);

    // 検証
    expect(closeError).toBeInstanceOf(ChecksumMismatchError);
  });

  test("期待値と一致するチェックサムを指定して getDecodable すると、全チャンクを透過させて正常に閉じる", async ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const transformStream = checksum.getDecodable({ vars: { [VAR_NAME]: CHECKSUM_HEX } });
    const chunk1 = new Uint8Array([1, 2]);
    const chunk2 = new Uint8Array([3, 4]);

    // 実行
    const { outputChunks, closeError } = await runTransform(transformStream, [chunk1, chunk2]);

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([chunk1, chunk2]);
  });

  test("期待値と一致しないチェックサムを指定して getDecodable すると、ストリームを閉じたときに ChecksumMismatchError で失敗する", async ({
    expect,
  }) => {
    // 準備
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const transformStream = checksum.getDecodable({
      vars: { [VAR_NAME]: "incorrect" },
    });

    // 実行
    const { closeError } = await runTransform(transformStream, [new Uint8Array([1, 2, 3])]);

    // 検証
    expect(closeError).toBeInstanceOf(ChecksumMismatchError);
  });

  test("CHECKSUM_VAR_NAME が文字列でなければ getEncodable は ChecksumInvalidVarNameError を投げる", ({
    expect,
  }) => {
    // 準備
    // @ts-expect-error テストのために静的プロパティーを書き換える。
    TestChecksum.CHECKSUM_VAR_NAME = undefined;
    const { hash } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);

    // 実行と検証
    expect(() => checksum.getEncodable({ vars: { [VAR_NAME]: CHECKSUM_HEX } })).toThrow(
      ChecksumInvalidVarNameError,
    );
  });
});

describe("大きなチャンクの分割処理", () => {
  test("4 GB ちょうどのチャンクは分割せずに 1 回の更新処理に渡される", async ({ expect }) => {
    // 準備
    const { hash, update } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const transformStream = checksum.getEncodable({ vars: { [VAR_NAME]: CHECKSUM_HEX } });
    // メモリーの枯渇を避けるため、length を偽装した Uint8Array のようなオブジェクトを使用する。
    const subarray = vi.fn<(start: number, end: number) => Uint8Array<ArrayBuffer>>(
      () => new Uint8Array([1]),
    );
    const fakeChunk = { length: 4_000_000_000, subarray } as unknown as Uint8Array<ArrayBuffer>;

    // 実行
    const { closeError } = await runTransform(transformStream, [fakeChunk]);

    // 検証
    expect(closeError).toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("4 GB を超えるチャンクは 4 GB ごとに分割されて更新処理に渡される", async ({ expect }) => {
    // 準備
    const { hash, update } = createHashMock();
    const checksum = new TestChecksum("sha256", hash);
    const transformStream = checksum.getEncodable({ vars: { [VAR_NAME]: CHECKSUM_HEX } });
    const subarray = vi.fn<(start: number, end: number) => Uint8Array<ArrayBuffer>>(
      () => new Uint8Array([1]),
    );
    const fakeChunk = {
      length: 4_000_000_000 + 1,
      subarray,
    } as unknown as Uint8Array<ArrayBuffer>;

    // 実行
    const { closeError } = await runTransform(transformStream, [fakeChunk]);

    // 検証
    expect(closeError).toBeUndefined();
    expect(update).toHaveBeenCalledTimes(2);
    expect(subarray).toHaveBeenNthCalledWith(1, 0, 4_000_000_000);
    expect(subarray).toHaveBeenNthCalledWith(2, 4_000_000_000, 4_000_000_001);
  });
});
