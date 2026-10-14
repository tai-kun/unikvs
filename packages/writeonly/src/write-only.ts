import { KeyNotFoundError, type ITransformer, type Variables } from "@unikvs/core";

import { WriteOnlyClearNotAllowedError, WriteOnlyDeleteNotAllowedError } from "./errors.js";

/**
 * vars から論理キーを解決します。
 *
 * @param vars 解決元となる実行時変数です。
 * @param fallback キーがない場合や値が文字列でない場合に返す代替名です。
 */
function resolveKey(vars: Variables, fallback: string): string {
  const key = vars.get("unikvs:key");

  return typeof key === "string" ? key : fallback;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
 */
export type WriteOnlyOptions = {
  readonly allowDelete?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
 */
export default class WriteOnly implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public readonly name: string = "WriteOnly";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public readonly allowDelete: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public constructor(options?: WriteOnlyOptions) {
    this.allowDelete = Boolean(options?.allowDelete);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public encode<TData>(args: Pick<ITransformer.EncodeArgs<TData>, "data">): TData {
    return args.data;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public decode<TData>(args: Pick<ITransformer.DecodeArgs<TData>, "vars" | "data">): never {
    throw new KeyNotFoundError({ key: resolveKey(args.vars, "(unknown)") });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#streams)
   */
  public getEncodable(): TransformStream<any, any> {
    return new TransformStream();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#streams)
   */
  public getDecodable(args: Pick<ITransformer.GetDecodableArgs, "vars">): never {
    throw new KeyNotFoundError({ key: resolveKey(args.vars, "(unknown)") });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
   */
  public onExists(args: Pick<ITransformer.ExistsHookArgs, "key">): never {
    throw new KeyNotFoundError({ key: args.key });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
   */
  public onDelete(args: Pick<ITransformer.DeleteHookArgs, "key">): void {
    // 削除が許可されていない場合は delete を拒否します。
    if (!this.allowDelete) {
      throw new WriteOnlyDeleteNotAllowedError({ key: args.key });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
   */
  public onClear(): void {
    // 削除が許可されていない場合は clear を拒否します。
    if (!this.allowDelete) {
      throw new WriteOnlyClearNotAllowedError();
    }
  }
}
