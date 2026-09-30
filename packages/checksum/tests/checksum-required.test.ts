import { describe, test } from "vitest";

import {
  type ChecksumOptions,
  ChecksumMd5,
  ChecksumRequiredError,
  ChecksumSha1,
  ChecksumSha224,
  ChecksumSha256,
  ChecksumSha384,
  ChecksumSha512,
} from "../src/index.js";

const ABC = Uint8Array.from(new TextEncoder().encode("abc"));

const ALGORITHMS = [
  {
    label: "MD5",
    varName: "@unikvs/checksum:md5",
    abcDigest: "900150983cd24fb0d6963f7d28e17f72",
    create: (options?: ChecksumOptions) => new ChecksumMd5(options),
  },
  {
    label: "SHA-1",
    varName: "@unikvs/checksum:sha1",
    abcDigest: "a9993e364706816aba3e25717850c26c9cd0d89d",
    create: (options?: ChecksumOptions) => new ChecksumSha1(options),
  },
  {
    label: "SHA-224",
    varName: "@unikvs/checksum:sha224",
    abcDigest: "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7",
    create: (options?: ChecksumOptions) => new ChecksumSha224(options),
  },
  {
    label: "SHA-256",
    varName: "@unikvs/checksum:sha256",
    abcDigest: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    create: (options?: ChecksumOptions) => new ChecksumSha256(options),
  },
  {
    label: "SHA-384",
    varName: "@unikvs/checksum:sha384",
    abcDigest:
      "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
    create: (options?: ChecksumOptions) => new ChecksumSha384(options),
  },
  {
    label: "SHA-512",
    varName: "@unikvs/checksum:sha512",
    abcDigest:
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    create: (options?: ChecksumOptions) => new ChecksumSha512(options),
  },
] as const;

describe("required を省略した場合", () => {
  test.for(ALGORITHMS)(
    "$label はチェックサム未指定でも encode がデータをそのまま返す",
    ({ create }, { expect }) => {
      // 準備
      const checksum = create();

      // 実行
      const result = checksum.encode({ vars: {}, data: ABC });

      // 検証
      expect(result).toBe(ABC);
    },
  );

  test.for(ALGORITHMS)(
    "$label はチェックサム未指定でも decode がデータをそのまま返す",
    ({ create }, { expect }) => {
      // 準備
      const checksum = create();

      // 実行
      const result = checksum.decode({ vars: {}, data: ABC });

      // 検証
      expect(result).toBe(ABC);
    },
  );
});

describe("required を有効にした場合", () => {
  test.for(ALGORITHMS)(
    "$label はチェックサム未指定で encode すると ChecksumRequiredError を投げる",
    ({ create }, { expect }) => {
      // 準備
      const checksum = create({ required: true });

      // 実行と検証
      expect(() => checksum.encode({ vars: {}, data: ABC })).toThrow(ChecksumRequiredError);
    },
  );

  test.for(ALGORITHMS)(
    "$label はチェックサム未指定で decode すると ChecksumRequiredError を投げる",
    ({ create }, { expect }) => {
      // 準備
      const checksum = create({ required: true });

      // 実行と検証
      expect(() => checksum.decode({ vars: {}, data: ABC })).toThrow(ChecksumRequiredError);
    },
  );

  test.for(ALGORITHMS)(
    "$label はチェックサムの値が文字列以外でも ChecksumRequiredError を投げる",
    ({ create, varName }, { expect }) => {
      // 準備
      const checksum = create({ required: true });
      const vars = { [varName]: 12345 };

      // 実行と検証
      expect(() => checksum.encode({ vars, data: ABC })).toThrow(ChecksumRequiredError);
    },
  );

  test.for(ALGORITHMS)(
    "$label は正しいチェックサムが指定されていれば検証に成功する",
    ({ create, varName, abcDigest }, { expect }) => {
      // 準備
      const checksum = create({ required: true });
      const vars = { [varName]: abcDigest };

      // 実行
      const result = checksum.encode({ vars, data: ABC });

      // 検証
      expect(result).toBe(ABC);
    },
  );

  test.for(ALGORITHMS)(
    "$label は getEncodable で ChecksumRequiredError を投げる",
    ({ create }, { expect }) => {
      // 準備
      const checksum = create({ required: true });

      // 実行と検証
      expect(() => checksum.getEncodable({ vars: {} })).toThrow(ChecksumRequiredError);
    },
  );

  test.for(ALGORITHMS)(
    "$label は getDecodable で ChecksumRequiredError を投げる",
    ({ create }, { expect }) => {
      // 準備
      const checksum = create({ required: true });

      // 実行と検証
      expect(() => checksum.getDecodable({ vars: {} })).toThrow(ChecksumRequiredError);
    },
  );
});
