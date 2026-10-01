import { describe, test } from "vitest";

import assertValidDirname from "../src/assert-valid-dirname.js";
import assertValidFilename from "../src/assert-valid-filename.js";
import bytesToHex from "../src/bytes-to-hex.js";
import chunks from "../src/chunks.js";
import { InvalidDirnameError, InvalidFilenameError } from "../src/errors.js";
import * as index from "../src/index.js";
import isValidDirname from "../src/is-valid-dirname.js";
import isValidFilename from "../src/is-valid-filename.js";
import toReadableStream from "../src/to-readable-stream.js";
import withReadableStreamFrom from "../src/with-readable-stream-from.js";

describe("index のエクスポート", () => {
  test("関数がエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.assertValidDirname).toBe(assertValidDirname);
    expect(index.assertValidFilename).toBe(assertValidFilename);
    expect(index.bytesToHex).toBe(bytesToHex);
    expect(index.chunks).toBe(chunks);
    expect(index.isValidDirname).toBe(isValidDirname);
    expect(index.isValidFilename).toBe(isValidFilename);
    expect(index.toReadableStream).toBe(toReadableStream);
    expect(index.withReadableStreamFrom).toBe(withReadableStreamFrom);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.InvalidDirnameError).toBe(InvalidDirnameError);
    expect(index.InvalidFilenameError).toBe(InvalidFilenameError);
  });
});
