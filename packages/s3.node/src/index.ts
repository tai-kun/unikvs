export type {
  InvalidPartSizeErrorMeta,
  InvalidPartSizeErrorArgs,
  StorageAbortedErrorMeta,
  StorageAbortedErrorArgs,
} from "./errors.js";
export { InvalidPartSizeError, StorageAbortedError } from "./errors.js";

export type * from "./s3.js";
export { default as S3 } from "./s3.js";
