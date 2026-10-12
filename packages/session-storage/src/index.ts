export type { KeyNotFoundErrorMeta, KeyNotFoundErrorArgs } from "./errors.js";
export {
  ClearWithoutPrefixNotAllowedError,
  KeyNotFoundError,
  SessionStorageNotAvailableError,
} from "./errors.js";

export type * from "./sessionstorage.js";
export { default as SessionStorage } from "./sessionstorage.js";
