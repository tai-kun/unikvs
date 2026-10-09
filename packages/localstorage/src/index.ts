export type { KeyNotFoundErrorMeta, KeyNotFoundErrorArgs } from "./errors.js";
export {
  ClearWithoutPrefixNotAllowedError,
  KeyNotFoundError,
  LocalStorageNotAvailableError,
} from "./errors.js";

export type * from "./localstorage.js";
export { default as LocalStorage } from "./localstorage.js";
