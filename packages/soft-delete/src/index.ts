export type {
  KeyNotFoundErrorArgs,
  KeyNotFoundErrorMeta,
  TombstoneNotFoundErrorArgs,
  TombstoneNotFoundErrorMeta,
  SoftDeleteInvalidRetentionErrorArgs,
  SoftDeleteInvalidRetentionErrorMeta,
} from "./errors.js";
export {
  KeyNotFoundError,
  TombstoneNotFoundError,
  SoftDeleteInvalidRetentionError,
} from "./errors.js";

export type * from "./soft-delete.js";
export { default as SoftDelete } from "./soft-delete.js";
