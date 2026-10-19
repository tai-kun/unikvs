export type {
  KeyNotFoundErrorMeta,
  KeyNotFoundErrorArgs,
  InvalidLeaseTtlErrorMeta,
  InvalidLeaseTtlErrorArgs,
  InvalidEndpointsErrorMeta,
  InvalidEndpointsErrorArgs,
} from "./errors.js";
export { KeyNotFoundError, InvalidLeaseTtlError, InvalidEndpointsError } from "./errors.js";
export type * from "./etcd.js";
export { default as Etcd, wrapNativeEtcdClient } from "./etcd.js";
