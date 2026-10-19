export type {
  KeyNotFoundErrorMeta,
  KeyNotFoundErrorArgs,
  TombstoneNotFoundErrorMeta,
  TombstoneNotFoundErrorArgs,
  SoftDeleteInvalidRetentionErrorMeta,
  SoftDeleteInvalidRetentionErrorArgs,
} from "./errors.js";
export {
  KeyNotFoundError,
  TombstoneNotFoundError,
  SoftDeleteInvalidRetentionError,
} from "./errors.js";

export type * from "./soft-delete.js";
export { default as SoftDelete } from "./soft-delete.js";
