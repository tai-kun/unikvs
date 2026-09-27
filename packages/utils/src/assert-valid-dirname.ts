import { tryCaptureStackTrace } from "try-capture-stack-trace";

import { InvalidDirnameError } from "./errors.js";
import isValidDirname from "./is-valid-dirname.js";

/**
 * ディレクトリー名が有効かどうかを検証します。
 *
 * 無効なディレクトリー名の場合は {@link InvalidDirnameError} を投げます。
 *
 * @param dirname 検証対象のディレクトリー名です。
 */
export default function assertValidDirname(dirname: string): void {
  if (isValidDirname(dirname)) {
    return;
  }

  const error = new InvalidDirnameError({ dirname });
  tryCaptureStackTrace(error, assertValidDirname);
  throw error;
}
