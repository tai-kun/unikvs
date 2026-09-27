import { tryCaptureStackTrace } from "try-capture-stack-trace";

import { InvalidFilenameError } from "./errors.js";
import isValidFilename from "./is-valid-filename.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#assert-valid-filename)
 */
export default function assertValidFilename(filename: string): void {
  if (isValidFilename(filename)) {
    return;
  }

  const error = new InvalidFilenameError({ filename });
  tryCaptureStackTrace(error, assertValidFilename);
  throw error;
}
