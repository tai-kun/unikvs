export type {
  KeyNotFoundErrorArgs,
  KeyNotFoundErrorMeta,
  InvalidLeaseTtlErrorArgs,
  InvalidLeaseTtlErrorMeta,
  InvalidEndpointsErrorArgs,
  InvalidEndpointsErrorMeta,
} from "./errors.js";
export { KeyNotFoundError, InvalidLeaseTtlError, InvalidEndpointsError } from "./errors.js";
export type * from "./etcd.js";
export { wrapNativeEtcdClient, default as Etcd } from "./etcd.js";
