import { tryCaptureStackTrace } from "try-capture-stack-trace";

import { InvalidDirnameError } from "./errors.js";
import isValidDirname from "./is-valid-dirname.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#assert-valid-dirname)
 */
export default function assertValidDirname(dirname: string): void {
  if (isValidDirname(dirname)) {
    return;
  }

  const error = new InvalidDirnameError({ dirname });
  tryCaptureStackTrace(error, assertValidDirname);
  throw error;
}
