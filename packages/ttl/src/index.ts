export type {
  KeyNotFoundErrorArgs,
  KeyNotFoundErrorMeta,
  TtlInvalidValueErrorArgs,
  TtlInvalidValueErrorMeta,
} from "./errors.js";
export { KeyNotFoundError, TtlInvalidValueError } from "./errors.js";

export type * from "./ttl.js";
export { default as Ttl } from "./ttl.js";
