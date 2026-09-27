import isValidFilename from "./is-valid-filename.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#is-valid-dirname)
 */
export default function isValidDirname(dirname: string): boolean {
  return isValidFilename(dirname);
}
