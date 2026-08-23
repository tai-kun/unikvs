import { tryCaptureStackTrace } from "try-capture-stack-trace";

import { InvalidDirnameError } from "./errors.js";
import isValidDirname from "./is-valid-dirname.js";

/**
 * 有効なディレクトリー名であるか検証します。
 *
 * 無効なディレクトリー名の場合は {@link InvalidDirnameError} を投げます。
 *
 * @param dirname ディレクトリー名です。
 */
export default function assertValidDirname(dirname: string): void {
  if (isValidDirname(dirname)) {
    return;
  }

  const error = new InvalidDirnameError({ dirname });
  tryCaptureStackTrace(error, assertValidDirname);
  throw error;
}
