export type {
  ReadOnlyDeleteNotAllowedErrorArgs,
  ReadOnlyDeleteNotAllowedErrorMeta,
  ReadOnlySetNotAllowedErrorArgs,
  ReadOnlySetNotAllowedErrorMeta,
} from "./errors.js";
export {
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
  ReadOnlySetNotAllowedError,
} from "./errors.js";

export type * from "./readonly.js";
export { default as ReadOnly } from "./readonly.js";
