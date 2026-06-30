import { afterEach, beforeEach, describe, test, vi } from "vitest";

import Checksum, { type IHash, type IHasher } from "../src/checksum.js";
import {
  ChecksumMismatchError,
  ChecksumRequiredError,
  ChecksumInvalidContextKeyError,
} from "../src/errors.js";

class TestChecksum extends Checksum {
  public static override CHECKSUM_CONTEXT_KEY: string = "x-test-checksum";
}

let mockHash: IHash;
let mockHasher: IHasher;

beforeEach(() => {
  const checksum = new Uint8Array([0xab, 0xcd, 0xef]);
  mockHasher = {
    update: vi.fn<IHasher["update"]>(),
    digest: vi.fn<IHasher["digest"]>().mockReturnValue(checksum),
  };
  mockHash = vi.fn<IHash>().mockReturnValue(checksum);
  mockHash.create = vi.fn<IHash["create"]>(() => mockHasher);
});

afterEach(() => {
  TestChecksum.CHECKSUM_CONTEXT_KEY = "x-test-checksum";
});

describe("初期化と基本プロパティの検証", () => {
  test("インスタンスを作成したとき、指定した名前が name プロパティに正しく設定される", ({
    expect,
  }) => {
    // 準備
    const dummyHash = vi.fn<IHash>();

    // 実行
    const checksum = new TestChecksum("sha256", dummyHash);

    // 検証
    expect(checksum.name).toBe("sha256");
  });

  test("isOpen プロパティを参照したとき、常に true が返される", ({ expect }) => {
    // 準備
    const dummyHash = vi.fn<IHash>() as any;
    const checksum = new TestChecksum("sha256", dummyHash);

    // 実行
    const result = checksum.isOpen;

    // 検証
    expect(result).toBe(true);
  });
});

describe("一括データ検証における挙動の検証", () => {
  test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const data = new Uint8Array([1, 2, 3]);
    const context = { "x-test-checksum": "abcdef" };

    // 実行
    const result = checksum.encode({ context, data });

    // 検証
    expect(result).toStrictEqual(data);
    expect(mockHash).toHaveBeenCalledTimes(1);
  });

  test("context にチェックサムキーが存在しないとき、ハッシュ計算を行わずにデータをそのまま返す", ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const data = new Uint8Array([1, 2, 3]);
    const context = {};

    // 実行
    const result = checksum.encode({ context, data });

    // 検証
    expect(result).toStrictEqual(data);
    expect(mockHash).not.toHaveBeenCalled();
  });

  test("チェックサムを必須にして context にチェックサムキーが存在しないときに encode すると ChecksumRequiredError を投げる", ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash, { required: true });
    const data = new Uint8Array([1, 2, 3]);
    const context = {};

    // 実行と検証
    expect(() => {
      checksum.encode({ context, data });
    }).toThrow(ChecksumRequiredError);
  });

  test("context のチェックサム値が文字列以外であるとき、ハッシュ計算を行わずにデータをそのまま返す", ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const data = new Uint8Array([1, 2, 3]);
    const context = { "x-test-checksum": 12345 };

    // 実行
    const result = checksum.encode({ context, data });

    // 検証
    expect(result).toStrictEqual(data);
    expect(mockHash).not.toHaveBeenCalled();
  });

  test("context に不正なハッシュ値が含まれるとき、encode で ChecksumMismatchError が発生する", ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const data = new Uint8Array([1, 2, 3]);
    const context = { "x-test-checksum": "incorrecthash" };

    // 実行と検証
    expect(() => {
      checksum.encode({ context, data });
    }).toThrow(ChecksumMismatchError);

    try {
      checksum.encode({ context, data });
    } catch (ex) {
      expect((ex as ChecksumMismatchError).meta).toStrictEqual({
        actual: "abcdef",
        expected: "incorrecthash",
      });
    }
  });

  test("CHECKSUM_CONTEXT_KEY が未定義のとき、encode 実行時に ChecksumInvalidContextKeyError が発生する", ({
    expect,
  }) => {
    // 準備
    // @ts-expect-error
    TestChecksum.CHECKSUM_CONTEXT_KEY = undefined;
    const checksum = new TestChecksum("sha256", mockHash);
    const data = new Uint8Array([1, 2, 3]);
    const context = { "x-test-checksum": "abcdef" };

    // 実行と検証
    expect(() => {
      checksum.encode({ context, data });
    }).toThrow(ChecksumInvalidContextKeyError);
  });
});

describe("ストリーム検証における挙動の検証", () => {
  test("getEncodable に正確なハッシュ値が渡されたとき、ストリーム書き込みが正常終了し、データが透過される", async ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const context = { "x-test-checksum": "abcdef" };
    const transformStream = checksum.getEncodable({ context });

    const chunk1 = new Uint8Array([1, 2]);
    const chunk2 = new Uint8Array([3, 4]);

    const writer = transformStream.writable.getWriter();
    const reader = transformStream.readable.getReader();

    // 実行
    const writePromise = (async () => {
      await writer.write(chunk1);
      await writer.write(chunk2);
      await writer.close();
    })();

    const outputChunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputChunks.push(value);
    }

    await writePromise;

    // 検証
    expect(outputChunks).toStrictEqual([chunk1, chunk2]);
    // oxlint-disable-next-line typescript/unbound-method
    expect(mockHasher.update).toHaveBeenCalledTimes(2);
    // oxlint-disable-next-line typescript/unbound-method
    expect(mockHasher.digest).toHaveBeenCalledTimes(1);
  });

  test("getEncodable にチェックサムキーが存在しないとき、IHasher を作成せずに透過ストリームを返す", async ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const context = {};
    const transformStream = checksum.getEncodable({ context });

    const chunk = new Uint8Array([1, 2, 3]);
    const writer = transformStream.writable.getWriter();
    const reader = transformStream.readable.getReader();

    // 実行
    const writePromise = (async () => {
      await writer.write(chunk);
      await writer.close();
    })();

    const outputChunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputChunks.push(value);
    }

    await writePromise;

    // 検証
    expect(outputChunks).toStrictEqual([chunk]);
    // oxlint-disable-next-line typescript/unbound-method
    expect(mockHash.create).not.toHaveBeenCalledTimes(1);
  });

  test("チェックサムを必須にして context にチェックサムキーが存在しないときに getEncodable すると ChecksumRequiredError を投げる", ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash, { required: true });
    const context = {};

    // 実行と検証
    expect(() => {
      checksum.getEncodable({ context });
    }).toThrow(ChecksumRequiredError);
  });

  test("getEncodable のチェックサム値が文字列以外であるとき、IHasher を作成せずに透過ストリームを返す", async ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const context = { "x-test-checksum": 123 };
    const transformStream = checksum.getEncodable({ context });

    const chunk = new Uint8Array([1, 2, 3]);
    const writer = transformStream.writable.getWriter();
    const reader = transformStream.readable.getReader();

    // 実行
    const writePromise = (async () => {
      await writer.write(chunk);
      await writer.close();
    })();

    const outputChunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputChunks.push(value);
    }

    await writePromise;

    // 検証
    expect(outputChunks).toStrictEqual([chunk]);
    // oxlint-disable-next-line typescript/unbound-method
    expect(mockHash.create).not.toHaveBeenCalledTimes(1);
  });

  test("getEncodable に不正なハッシュ値が含まれるとき、ストリームのフラッシュ時に ChecksumMismatchError が発生する", async ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const context = { "x-test-checksum": "incorrecthash" };
    const transformStream = checksum.getEncodable({ context });

    const chunk = new Uint8Array([1, 2, 3]);
    const writer = transformStream.writable.getWriter();
    const reader = transformStream.readable.getReader();

    // 実行
    const writePromise = (async () => {
      await writer.write(chunk);
    })();
    await reader.read();
    await writePromise;

    // 検証
    await expect(async () => {
      await writer.close();
    }).rejects.toThrow(ChecksumMismatchError);
  });

  test("getEncodable 呼び出し時に CHECKSUM_CONTEXT_KEY が未定義のとき、ストリーム作成時に ChecksumInvalidContextKeyError が発生する", ({
    expect,
  }) => {
    // 準備
    // @ts-expect-error
    TestChecksum.CHECKSUM_CONTEXT_KEY = undefined;
    const checksum = new TestChecksum("sha256", mockHash);
    const context = { "x-test-checksum": "abcdef" };

    // 実行と検証
    expect(() => {
      checksum.getEncodable({ context });
    }).toThrow(ChecksumInvalidContextKeyError);
  });
});

describe("ストリーム処理における境界値・特殊ケースの検証", () => {
  test("チャンクサイズが 4 GB と等しいとき、hasher.update が 1 回のみ呼び出される", async ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const context = { "x-test-checksum": "abcdef" };
    const transformStream = checksum.getEncodable({ context });

    // メモリーの枯渇を避けるため、length を偽装した Uint8Array のようなオブジェクトを使用する。
    const fakeChunk = {
      length: 4_000_000_000, // 4 GB
      subarray: vi.fn<() => Uint8Array>().mockImplementation(() => new Uint8Array([1])),
    } as unknown as Uint8Array<ArrayBuffer>;

    const writer = transformStream.writable.getWriter();
    const reader = transformStream.readable.getReader();

    // 実行
    const writePromise = (async () => {
      await writer.write(fakeChunk);
      await writer.close();
    })();
    await reader.read();
    await writePromise;

    // 検証
    // oxlint-disable-next-line typescript/unbound-method
    expect(mockHasher.update).toHaveBeenCalledTimes(1);
  });

  test("チャンクサイズが 4 GB を超えるとき、データが 2 つに分割されて hasher.update が 2 回呼び出される", async ({
    expect,
  }) => {
    // 準備
    const checksum = new TestChecksum("sha256", mockHash);
    const context = { "x-test-checksum": "abcdef" };
    const transformStream = checksum.getEncodable({ context });

    const fakeChunk = {
      length: 4_000_000_000 + 1, // 4 GB + 1 B
      subarray: vi.fn<() => Uint8Array>().mockImplementation(() => new Uint8Array([1])),
    } as unknown as Uint8Array<ArrayBuffer>;

    const writer = transformStream.writable.getWriter();
    const reader = transformStream.readable.getReader();

    // 実行
    const writePromise = (async () => {
      await writer.write(fakeChunk);
      await writer.close();
    })();
    await reader.read();
    await writePromise;

    // 検証
    // oxlint-disable-next-line typescript/unbound-method
    expect(mockHasher.update).toHaveBeenCalledTimes(2);
    // oxlint-disable-next-line typescript/unbound-method
    expect(fakeChunk.subarray).toHaveBeenNthCalledWith(1, 0, 4_000_000_000);
    // oxlint-disable-next-line typescript/unbound-method
    expect(fakeChunk.subarray).toHaveBeenNthCalledWith(2, 4_000_000_000, 4_000_000_001);
  });
});
