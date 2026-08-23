import { tryCaptureStackTrace } from "try-capture-stack-trace";

import { InvalidFilenameError } from "./errors.js";
import isValidFilename from "./is-valid-filename.js";

/**
 * 有効なファイル名であるか検証します。
 *
 * 無効なファイル名の場合は {@link InvalidFilenameError} を投げます。
 *
 * @param filename ファイル名です。
 */
export default function assertValidFilename(filename: string): void {
  if (isValidFilename(filename)) {
    return;
  }

  const error = new InvalidFilenameError({ filename });
  tryCaptureStackTrace(error, assertValidFilename);
  throw error;
}
