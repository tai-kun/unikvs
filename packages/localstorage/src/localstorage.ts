import { type IStorage, KeyNotFoundError } from "@unikvs/core";

import { LocalStorageNotAvailableError, ClearWithoutPrefixNotAllowedError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
 */
export type LocalStorageOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#key-prefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#allow-clear-without-prefix)
   */
  readonly allowClearWithoutPrefix?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#storage)
   */
  readonly storage?: Storage | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
 */
export default class LocalStorage implements IStorage<string> {
  /**
   * ストレージ名です。常に `LocalStorage` を返します。
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#allow-clear-without-prefix)
   */
  public readonly allowClearWithoutPrefix: boolean;

  /**
   * 注入された Storage です。未指定の場合は `globalThis.localStorage` を使います。
   */
  readonly #injectedStorage: Storage | undefined;

  /**
   * すべてのキーに付与する接頭辞です。
   */
  readonly #keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#usage)
   */
  public constructor(options: LocalStorageOptions = {}) {
    const { storage, keyPrefix = "unikvs:", allowClearWithoutPrefix = false } = options;

    this.name = "LocalStorage";
    this.allowClearWithoutPrefix = allowClearWithoutPrefix;
    this.#injectedStorage = storage;
    this.#keyPrefix = keyPrefix;
  }

  /**
   * ストレージが利用可能かどうかを返します。LocalStorage は常に利用可能です。
   *
   * @returns 常に true を返します。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * ストレージを開き localStorage が使えることを確認します。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   */
  public open(c: IStorage.OpenContext): void {
    c.signal.throwIfAborted();
    this.#backend();
  }

  /**
   * ストレージを閉じます。保持する状態がないため何もしません。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   */
  public close(c: IStorage.CloseContext): void {
    c.signal.throwIfAborted();
  }

  /**
   * 指定したキーに文字列を保存します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   * @param data 保存する文字列です。
   */
  public write(c: IStorage.WriteContext, data: string): void {
    c.signal.throwIfAborted();
    this.#writeValue(c.key, data);
  }

  /**
   * 指定したキーの文字列を読み出します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns 保存されている文字列です。
   */
  public read(c: IStorage.ReadContext): string {
    c.signal.throwIfAborted();

    const value = this.#backend().getItem(this.#toRealKey(c.key));

    if (value === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return value;
  }

  /**
   * 指定したキーが存在するかどうかを返します。
   *
   * @param c 確認するキーを持つコンテキストです。
   *
   * @returns キーが存在すれば true を返します。
   */
  public exists(c: IStorage.ExistsContext): boolean {
    c.signal.throwIfAborted();

    return this.#backend().getItem(this.#toRealKey(c.key)) !== null;
  }

  /**
   * 指定したキーを削除します。
   *
   * @param c 削除するキーを持つコンテキストです。
   */
  public delete(c: IStorage.DeleteContext): void {
    c.signal.throwIfAborted();

    const backend = this.#backend();

    if (backend.getItem(this.#toRealKey(c.key)) === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    backend.removeItem(this.#toRealKey(c.key));
  }

  /**
   * 指定したキーの値を別のキーへ複製します。コピー先の既存値は上書きします。
   *
   * @param c コピー元とコピー先のキーを持つコンテキストです。
   */
  public copy(c: IStorage.CopyContext): void {
    c.signal.throwIfAborted();

    const data = this.read(c);

    // 同じキーへのコピーは値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    this.#writeValue(c.destinationKey, data);
  }

  /**
   * 指定したキーの値を別のキーへ移動します。移動先の既存値は上書きします。
   *
   * 移動先への書き込みが成功した後に移動元を削除します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   */
  public move(c: IStorage.MoveContext): void {
    c.signal.throwIfAborted();

    const data = this.read(c);

    // 同じキーへの移動は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    this.#writeValue(c.destinationKey, data);
    this.delete(c);
  }

  /**
   * 接頭辞に一致するキーをすべて削除します。空の接頭辞では既定で拒否します。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   */
  public clear(c: IStorage.ClearContext): void {
    // 空 prefix での無条件全削除の事故を防ぐため走査前に拒否します。
    // `http` と同形の初期中断検証である。
    if (this.#keyPrefix === "" && !this.allowClearWithoutPrefix) {
      throw new ClearWithoutPrefixNotAllowedError();
    }

    c.signal.throwIfAborted();

    const backend = this.#backend();

    // 走査中の削除による添字ずれを避けるため削除対象を先に収集します。
    const targets: string[] = [];

    for (let index = 0; index < backend.length; index += 1) {
      c.signal.throwIfAborted();
      const found = backend.key(index);

      if (found !== null && found.startsWith(this.#keyPrefix)) {
        targets.push(found);
      }
    }

    for (const target of targets) {
      c.signal.throwIfAborted();
      backend.removeItem(target);
    }
  }

  /**
   * 使用する Storage を解決します。未注入時は `globalThis.localStorage` を使います。
   *
   * @returns 使用する Storage です。利用できない場合はエラーを投げます。
   */
  #backend(): Storage {
    const backend =
      this.#injectedStorage ?? (globalThis as { localStorage?: Storage | undefined }).localStorage;

    if (!backend) {
      throw new LocalStorageNotAvailableError();
    }

    return backend;
  }

  /**
   * 論理キーに接頭辞を付与して実キーに変換します。
   *
   * @param key 変換する論理キーです。
   *
   * @returns 接頭辞付きの実キーです。
   */
  #toRealKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  /**
   * 論理キーに接頭辞を付けて文字列を保存します。
   *
   * @param key 保存先の論理キーです。
   * @param data 保存する文字列です。
   */
  #writeValue(key: string, data: string): void {
    this.#backend().setItem(this.#toRealKey(key), data);
  }
}
