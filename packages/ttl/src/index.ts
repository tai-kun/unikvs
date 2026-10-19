export type {
  KeyNotFoundErrorMeta,
  KeyNotFoundErrorArgs,
  TtlInvalidValueErrorMeta,
  TtlInvalidValueErrorArgs,
} from "./errors.js";
export { KeyNotFoundError, TtlInvalidValueError } from "./errors.js";

export type * from "./ttl.js";
export { default as Ttl } from "./ttl.js";
