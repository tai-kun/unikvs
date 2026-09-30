import { describe, test } from "vitest";

import {
  ChecksumMd5,
  ChecksumSha1,
  ChecksumSha224,
  ChecksumSha256,
  ChecksumSha384,
  ChecksumSha512,
} from "../src/index.js";

const ABC = Uint8Array.from(new TextEncoder().encode("abc"));
const UNICODE = Uint8Array.from(new TextEncoder().encode("日本語テキスト🎉"));

const ALGORITHMS = [
  {
    label: "MD5",
    varName: "@unikvs/checksum:md5",
    create: () => new ChecksumMd5(),
    abcDigest: "900150983cd24fb0d6963f7d28e17f72",
    unicodeDigest: "af91e7698b2586a0dba9c8d6a44d1d4d",
  },
  {
    label: "SHA-1",
    varName: "@unikvs/checksum:sha1",
    create: () => new ChecksumSha1(),
    abcDigest: "a9993e364706816aba3e25717850c26c9cd0d89d",
    unicodeDigest: "921008a9914e194305da8f78d1eacbe3b0461e9a",
  },
  {
    label: "SHA-224",
    varName: "@unikvs/checksum:sha224",
    create: () => new ChecksumSha224(),
    abcDigest: "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7",
    unicodeDigest: "10afb5b89d4e3e982e190c4213111eec0ece41785014017f5746cf91",
  },
  {
    label: "SHA-256",
    varName: "@unikvs/checksum:sha256",
    create: () => new ChecksumSha256(),
    abcDigest: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    unicodeDigest: "337e902fee55bd5ebf484ac63f6ab667528fca6a2555e50ab28def8150aa4868",
  },
  {
    label: "SHA-384",
    varName: "@unikvs/checksum:sha384",
    create: () => new ChecksumSha384(),
    abcDigest:
      "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
    unicodeDigest:
      "eeaa19b0bd5941f5d012487360de661b1c244ca52552b292ad02930a9a19be994e8273fc7c1bc8ea5376a2b9ea90e17f",
  },
  {
    label: "SHA-512",
    varName: "@unikvs/checksum:sha512",
    create: () => new ChecksumSha512(),
    abcDigest:
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    unicodeDigest:
      "d0a0ea641f05cf7c01efb8480c8a87357196bcdb3b31506751d293d0ef14d03f9d71e3489af47c1c31a359af039548cb4626d678bae00a67feeab1b9784ee451",
  },
] as const;

describe("アルゴリズムのメタデータ", () => {
  test.for(ALGORITHMS)("$label の isOpen は常に true を返す", ({ create }, { expect }) => {
    // 準備
    const checksum = create();

    // 実行と検証
    expect(checksum.isOpen).toBe(true);
  });
});

describe("既知ベクターによる一括検証", () => {
  test.for(ALGORITHMS)(
    "$label は abc の既知のダイジェストで encode できる",
    ({ create, varName, abcDigest }, { expect }) => {
      // 準備
      const checksum = create();
      const vars = { [varName]: abcDigest };

      // 実行
      const result = checksum.encode({ vars, data: ABC });

      // 検証
      expect(result).toBe(ABC);
    },
  );

  test.for(ALGORITHMS)(
    "$label は Unicode 文字列のバイト列の既知のダイジェストで encode できる",
    ({ create, varName, unicodeDigest }, { expect }) => {
      // 準備
      const checksum = create();
      const vars = { [varName]: unicodeDigest };

      // 実行
      const result = checksum.encode({ vars, data: UNICODE });

      // 検証
      expect(result).toBe(UNICODE);
    },
  );

  test.for(ALGORITHMS)(
    "$label は abc の既知のダイジェストで decode できる",
    ({ create, varName, abcDigest }, { expect }) => {
      // 準備
      const checksum = create();
      const vars = { [varName]: abcDigest };

      // 実行
      const result = checksum.decode({ vars, data: ABC });

      // 検証
      expect(result).toBe(ABC);
    },
  );
});
