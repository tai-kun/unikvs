import { tryCaptureStackTrace } from "try-capture-stack-trace";

import { InvalidFilenameError } from "./errors.js";
import isValidFilename from "./is-valid-filename.js";

/**
 * ファイル名が有効かどうかを検証します。
 *
 * 無効なファイル名の場合は {@link InvalidFilenameError} を投げます。
 *
 * @param filename 検証対象のファイル名です。
 */
export default function assertValidFilename(filename: string): void {
  if (isValidFilename(filename)) {
    return;
  }

  const error = new InvalidFilenameError({ filename });
  tryCaptureStackTrace(error, assertValidFilename);
  throw error;
}
