import { KeyNotFoundError, type IStorage } from "@unikvs/core";

import { ClearWithoutPrefixNotAllowedError, SessionStorageNotAvailableError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
 */
export type SessionStorageOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  readonly allowClearWithoutPrefix?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  readonly storage?: Storage | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
 */
export default class SessionStorage implements IStorage<string> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public readonly allowClearWithoutPrefix: boolean;

  // 注入された `Storage` です。
  // 未指定の場合は `globalThis.sessionStorage` を使います。
  private readonly injectedStorage: Storage | undefined;

  // すべてのキーに付与する接頭辞です。
  private readonly keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public constructor(options: SessionStorageOptions = {}) {
    const { keyPrefix = "unikvs:", allowClearWithoutPrefix = false, storage } = options;
    this.name = "SessionStorage";
    this.allowClearWithoutPrefix = allowClearWithoutPrefix;
    this.injectedStorage = storage;
    this.keyPrefix = keyPrefix;
  }

  // 使用する `Storage` を解決します。
  // 実行時の意味は `injectedStorage ?? globalThis.sessionStorage` です。
  private backend(): Storage {
    const backend =
      this.injectedStorage ??
      (globalThis as { sessionStorage?: Storage | undefined }).sessionStorage;

    if (!backend) {
      throw new SessionStorageNotAvailableError();
    }

    return backend;
  }

  // 論理キーに接頭辞を付与して実キーに変換します。
  private toRealKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public open(args: Pick<IStorage.OpenArgs, "signal">): void {
    const { signal } = args;

    signal.throwIfAborted();
    this.backend();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public close(args: Pick<IStorage.CloseArgs, "signal">): void {
    const { signal } = args;

    signal.throwIfAborted();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public write(args: Pick<IStorage.WriteArgs<string>, "key" | "data" | "vars" | "signal">): void {
    const { key, data, signal } = args;

    signal.throwIfAborted();
    this.backend().setItem(this.toRealKey(key), data);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): boolean {
    const { key, signal } = args;

    signal.throwIfAborted();

    return this.backend().getItem(this.toRealKey(key)) !== null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#usage)
   */
  public clear(args: Pick<IStorage.ClearArgs, "signal">): void {
    const { signal } = args;

    // 空 prefix での無条件全削除の事故を防ぐため、走査前に拒否します。
    // `http` と同形の初期中断検証である。
    if (this.keyPrefix === "" && !this.allowClearWithoutPrefix) {
      throw new ClearWithoutPrefixNotAllowedError();
    }

    signal.throwIfAborted();
    const backend = this.backend();

    // 走査中の削除による添字ずれを避けるため、削除対象を先に収集します。
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
