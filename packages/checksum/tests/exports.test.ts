import { describe, test } from "vitest";

import Checksum from "../src/checksum.js";
import {
  ChecksumInvalidVarNameError,
  ChecksumMismatchError,
  ChecksumRequiredError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import ChecksumMd5 from "../src/md5.js";
import ChecksumSha1 from "../src/sha1.js";
import ChecksumSha224 from "../src/sha224.js";
import ChecksumSha256 from "../src/sha256.js";
import ChecksumSha384 from "../src/sha384.js";
import ChecksumSha512 from "../src/sha512.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Checksum).toBe(Checksum);
    expect(index.ChecksumMd5).toBe(ChecksumMd5);
    expect(index.ChecksumSha1).toBe(ChecksumSha1);
    expect(index.ChecksumSha224).toBe(ChecksumSha224);
    expect(index.ChecksumSha256).toBe(ChecksumSha256);
    expect(index.ChecksumSha384).toBe(ChecksumSha384);
    expect(index.ChecksumSha512).toBe(ChecksumSha512);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.ChecksumMismatchError).toBe(ChecksumMismatchError);
    expect(index.ChecksumRequiredError).toBe(ChecksumRequiredError);
    expect(index.ChecksumInvalidVarNameError).toBe(ChecksumInvalidVarNameError);
  });
});
