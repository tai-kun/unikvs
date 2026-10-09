import {
  KeyNotFoundError,
  RepairNotAllowedError,
  type IStorage,
  type Variables,
} from "@unikvs/core";

import { ClearWithoutPrefixNotAllowedError, LocalStorageNotAvailableError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
 */
export type LocalStorageOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  readonly allowRepair?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  readonly allowClearWithoutPrefix?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  readonly storage?: Storage | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
 */
export default class LocalStorage implements IStorage<string> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public readonly allowRepair: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public readonly allowClearWithoutPrefix: boolean;

  // 注入された `Storage` です。
  // 未指定の場合は `globalThis.localStorage` を使います。
  private readonly injectedStorage: Storage | undefined;

  // すべてのキーに付与する接頭辞です。
  private readonly keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public constructor(options: LocalStorageOptions = {}) {
    const {
      keyPrefix = "unikvs:",
      allowRepair = false,
      allowClearWithoutPrefix = false,
      storage,
    } = options;
    this.name = "LocalStorage";
    this.allowRepair = allowRepair;
    this.allowClearWithoutPrefix = allowClearWithoutPrefix;
    this.injectedStorage = storage;
    this.keyPrefix = keyPrefix;
  }

  // 書き戻しが許可されていることを検証します。
  private assertRepairAllowed(args: { vars: Variables }): void {
    if (args.vars["unikvs:repair"] === true && !this.allowRepair) {
      throw new RepairNotAllowedError({ name: this.name });
    }
  }

  // 使用する `Storage` を解決します。
  // 実行時の意味は `injectedStorage ?? globalThis.localStorage` です。
  private backend(): Storage {
    const backend =
      this.injectedStorage ?? (globalThis as { localStorage?: Storage | undefined }).localStorage;

    if (!backend) {
      throw new LocalStorageNotAvailableError();
    }

    return backend;
  }

  // 論理キーに接頭辞を付与して実キーに変換します。
  private toRealKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public open(args: Pick<IStorage.OpenArgs, "signal">): void {
    const { signal } = args;

    signal.throwIfAborted();
    this.backend();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public close(args: Pick<IStorage.CloseArgs, "signal">): void {
    const { signal } = args;

    signal.throwIfAborted();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public write(args: Pick<IStorage.WriteArgs<string>, "key" | "data" | "vars" | "signal">): void {
    this.assertRepairAllowed(args);
    const { key, data, signal } = args;

    signal.throwIfAborted();
    this.backend().setItem(this.toRealKey(key), data);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public read(args: Pick<IStorage.ReadArgs, "key" | "signal">): string {
    const { key, signal } = args;

    signal.throwIfAborted();
    const value = this.backend().getItem(this.toRealKey(key));

    if (value === null) {
      throw new KeyNotFoundError({ key });
    }

    return value;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): boolean {
    const { key, signal } = args;

    signal.throwIfAborted();

    return this.backend().getItem(this.toRealKey(key)) !== null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): void {
    const { key, signal } = args;

    signal.throwIfAborted();
    const backend = this.backend();

    if (backend.getItem(this.toRealKey(key)) === null) {
      throw new KeyNotFoundError({ key });
    }

    backend.removeItem(this.toRealKey(key));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public clear(args: Pick<IStorage.ClearArgs, "signal">): void {
    const { signal } = args;

    // 空 prefix での無条件全削除の事故を防ぐため走査前に拒否します。
    // `http` と同形の初期中断検証である。
    if (this.keyPrefix === "" && !this.allowClearWithoutPrefix) {
      throw new ClearWithoutPrefixNotAllowedError();
    }

    signal.throwIfAborted();
    const backend = this.backend();

    // 走査中の削除による添字ずれを避けるため削除対象を先に収集します。
    const targets: string[] = [];

    for (let index = 0; index < backend.length; index += 1) {
      signal.throwIfAborted();
      const found = backend.key(index);

      if (found !== null && found.startsWith(this.keyPrefix)) {
        targets.push(found);
      }
    }

    for (const target of targets) {
      signal.throwIfAborted();
      backend.removeItem(target);
    }
  }
}
