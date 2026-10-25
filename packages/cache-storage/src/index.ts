export type { InvalidChunkTypeErrorArgs, InvalidChunkTypeErrorMeta } from "./errors.js";
export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "./errors.js";
export {
  KeyNotFoundError,
  InvalidChunkTypeError,
  CacheStorageNotAvailableError,
} from "./errors.js";

export type * from "./cache-storage.js";
export { default as CacheStorage } from "./cache-storage.js";
