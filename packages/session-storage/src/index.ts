export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "./errors.js";
export {
  KeyNotFoundError,
  SessionStorageNotAvailableError,
  ClearWithoutPrefixNotAllowedError,
} from "./errors.js";

export type * from "./sessionstorage.js";
export { default as SessionStorage } from "./sessionstorage.js";
