export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "./errors.js";
export {
  KeyNotFoundError,
  LocalStorageNotAvailableError,
  ClearWithoutPrefixNotAllowedError,
} from "./errors.js";

export type * from "./localstorage.js";
export { default as LocalStorage } from "./localstorage.js";
