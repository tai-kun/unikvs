import { describe, test } from "vitest";

import { ChecksumMismatchError } from "../src/errors.js";
import ChecksumSha256 from "../src/sha256.js";

const CHECK_SUM_KEY = "@unikvs/checksum:sha256";
const TEST_DATA = new TextEncoder().encode("test");
// "test" の SHA-256 ハッシュ値（HEX）
const VALID_HASH = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const INVALID_HASH = "wrong_hash_value";

describe("基本プロパティ", () => {
  test("識別名として ChecksumSha256 を持っている", ({ expect }) => {
    const transformer = new ChecksumSha256();
    expect(transformer.name).toBe("ChecksumSha256");
  });

  test("常にオープンな状態（isOpen が true）である", ({ expect }) => {
    const transformer = new ChecksumSha256();
    expect(transformer.isOpen).toBe(true);
  });

  test("コンテキストキーとして @unikvs/checksum:sha256 を定義している", ({ expect }) => {
    expect(ChecksumSha256.CHECKSUM_CONTEXT_KEY).toBe(CHECK_SUM_KEY);
  });
});

describe("一括処理（encode / decode）", () => {
  test("期待されるハッシュ値が一致するとき、入力データをそのまま返す", async ({ expect }) => {
    // Arrange
    const transformer = new ChecksumSha256();
    const context = { [CHECK_SUM_KEY]: VALID_HASH };

    // Act
    const result = transformer.encode({ data: TEST_DATA, context });

    // Assert
    expect(result).toStrictEqual(TEST_DATA);
  });

  test("期待されるハッシュ値が一致しないとき、ChecksumMismatchError をスローする", async ({
    expect,
  }) => {
    // Arrange
    const transformer = new ChecksumSha256();
    const context = { [CHECK_SUM_KEY]: INVALID_HASH };

    // Act & Assert
    try {
      transformer.encode({ data: TEST_DATA, context });
      expect.unreachable("ChecksumMismatchError が投げられているべき");
    } catch (error) {
      expect(error).toBeInstanceOf(ChecksumMismatchError);
      const mismatchError = error as ChecksumMismatchError;
      expect(mismatchError.meta.expected).toBe(INVALID_HASH);
      expect(mismatchError.meta.actual).toBe(VALID_HASH);
    }
  });

  test("コンテキストにハッシュ値が含まれていないとき、検証をスキップしてデータを透過する", async ({
    expect,
  }) => {
    // Arrange
    const transformer = new ChecksumSha256();
    const context = {};

    // Act
    const result = transformer.decode({ data: TEST_DATA, context });

    // Assert
    expect(result).toStrictEqual(TEST_DATA);
  });

  test("コンテキストのハッシュ値が文字列ではないとき、検証をスキップしてデータを透過する", async ({
    expect,
  }) => {
    // Arrange
    const transformer = new ChecksumSha256();
    const context = { [CHECK_SUM_KEY]: 12345 };

    // Act
    const result = transformer.encode({ data: TEST_DATA, context });

    // Assert
    expect(result).toStrictEqual(TEST_DATA);
  });

  test("空のデータに対しても、正確な SHA-256 ハッシュを計算・検証する", async ({ expect }) => {
    // Arrange
    const emptyData = new Uint8Array(0);
    const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const transformer = new ChecksumSha256();
    const context = { [CHECK_SUM_KEY]: emptyHash };

    // Act
    const result = transformer.encode({ data: emptyData, context });

    // Assert
    expect(result).toStrictEqual(emptyData);
  });
});

describe("ストリーム処理（getEncodable / getDecodable）", () => {
  test("ストリームで分割されたデータのハッシュ値が一致するとき、全てのデータを正常に透過する", async ({
    expect,
  }) => {
    // Arrange
    const transformer = new ChecksumSha256();
    const context = { [CHECK_SUM_KEY]: VALID_HASH };
    const stream = transformer.getEncodable({ context });
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    const chunks = [new TextEncoder().encode("te"), new TextEncoder().encode("st")];

    // Act
    const readerPromise = (async () => {
      const results: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        results.push(value);
      }

      return results;
    })();
    await writer.write(chunks[0]!);
    await writer.write(chunks[1]!);
    await writer.close();
    const results = await readerPromise;

    // Assert
    const merged = new Uint8Array(results.reduce((acc, c) => acc + c.length, 0));
    let offset = 0;
    for (const chunk of results) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    expect(merged).toStrictEqual(TEST_DATA);
  });

  test("ストリーム処理においてハッシュ値が不一致のとき、flush 時に ChecksumMismatchError をスローする", async ({
    expect,
  }) => {
    // Arrange
    const transformer = new ChecksumSha256();
    const context = { [CHECK_SUM_KEY]: INVALID_HASH };
    const stream = transformer.getEncodable({ context });
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // Act & Assert
    const readerPromise = (async () => {
      while (!(await reader.read()).done) {}
    })();
    await writer.write(TEST_DATA);
    await expect(writer.close()).rejects.toThrow(ChecksumMismatchError);
    await expect(readerPromise).rejects.toThrow(ChecksumMismatchError);
  });

  test("コンテキストがない場合、ストリームは単純な透過として動作する", async ({ expect }) => {
    // Arrange
    const transformer = new ChecksumSha256();
    const context = {};
    const stream = transformer.getDecodable({ context });
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // Act
    const readerPromise = (async () => {
      const results: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        results.push(value);
      }

      return results;
    })();
    await writer.write(TEST_DATA);
    await writer.close();

    // Assert
    await expect(readerPromise).resolves.toStrictEqual([TEST_DATA]);
  });
});

// describe("大規模データへの対応", () => {
//   test("4GB を超える巨大なチャンクが入力されたとき、内部で分割してハッシュ計算を継続する")
// });
