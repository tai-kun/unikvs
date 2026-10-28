import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";

import { InvalidBindingError, InvalidKeyPrefixError, InvalidTtlSecondsError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv)
 */
export interface KVNamespaceListKey {
  /**
   * 列挙したキー名です。
   */
  readonly name: string;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv)
 */
export interface KVNamespaceListResult {
  /**
   * 取得したキーの一覧です。
   */
  readonly keys: readonly KVNamespaceListKey[];

  /**
   * 列挙が完了したかどうかです。
   */
  readonly list_complete: boolean;

  /**
   * 次のページを取得するためのカーソルです。
   */
  readonly cursor: string;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv)
 */
export interface KVNamespaceLike {
  /**
   * キーの値をバイト列で取得します。
   *
   * @param key 取得するキーです。
   * @param type 取得形式です。
   *
   * @returns 取得したバイト列です。欠番時は null です。
   */
  get(
    key: string,
    type: "arrayBuffer" | { readonly type: "arrayBuffer" },
  ): Promise<ArrayBuffer | null>;

  /**
   * キーに値を保存します。
   *
   * @param key 保存先のキーです。
   * @param value 保存するバイト列です。
   * @param options 保存に渡す任意項目です。
   *
   * @returns 保存が完了したら解決します。
   */
  put(
    key: string,
    value: ArrayBuffer,
    options?: { readonly expirationTtl?: number },
  ): Promise<void>;

  /**
   * キーを削除します。
   *
   * @param key 削除するキーです。
   *
   * @returns 削除が完了したら解決します。
   */
  delete(key: string): Promise<void>;

  /**
   * キーを頁単位で列挙します。
   *
   * @param options 列挙に渡す任意項目です。
   *
   * @returns 列挙したページです。
   */
  list(options?: {
    readonly cursor?: string | undefined;
    readonly prefix?: string | undefined;
  }): Promise<KVNamespaceListResult>;
}

/**
 * 必須メソッドをすべて備えた KV binding かどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns 必須メソッドをすべて備えていれば真です。
 */
function isKVNamespaceLike(value: unknown): value is KVNamespaceLike {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  for (const name of ["get", "put", "delete", "list"] as const) {
    if (typeof record[name] !== "function") {
      return false;
    }
  }

  return true;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv)
 */
export type CloudflareKvOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv-binding)
   */
  readonly binding: KVNamespaceLike;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv-key-prefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv-ttl-seconds)
   */
  readonly ttlSeconds?: number | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv)
 */
export default class CloudflareKv implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv)
   */
  public readonly name: string;

  /**
   * 注入された KV binding です。
   */
  readonly #binding: KVNamespaceLike;

  /**
   * すべてのキーに付与する接頭辞です。
   */
  readonly #keyPrefix: string;

  /**
   * 書き込み時に付与する有効期限 (秒) です。
   *
   * 未指定なら無期限です。
   */
  readonly #ttlSeconds: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#cloudflare-kv)
   */
  public constructor(options: CloudflareKvOptions) {
    if (options === null || typeof options !== "object") {
      throw new InvalidBindingError({ actual: options });
    }

    const { binding, keyPrefix = "unikvs:", ttlSeconds } = options;

    if (!isKVNamespaceLike(binding)) {
      throw new InvalidBindingError({ actual: binding });
    }

    if (typeof keyPrefix !== "string") {
      throw new InvalidKeyPrefixError({ actual: keyPrefix });
    }

    if (
      ttlSeconds !== undefined &&
      (typeof ttlSeconds !== "number" || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0)
    ) {
      throw new InvalidTtlSecondsError({ actual: ttlSeconds });
    }

    this.name = "CloudflareKv";
    this.#binding = binding;
    this.#keyPrefix = keyPrefix;
    this.#ttlSeconds = ttlSeconds;
  }

  /**
   * ストレージがオープン済みかどうかです。
   *
   * 常に真を返します。
   *
   * @returns オープン済みなら真です。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * ストレージをオープンします。
   *
   * 接続を持たないため中断確認のみ行います。
   *
   * @param c オープンコンテキストです。
   *
   * @returns オープンが完了したら解決します。
   */
  public async open(c: IStorage.OpenContext): Promise<void> {
    throwIfAborted(c.signal);
  }

  /**
   * ストレージをクローズします。
   *
   * 接続を持たないため中断確認のみ行います。
   *
   * @param c クローズコンテキストです。
   *
   * @returns クローズが完了したら解決します。
   */
  public async close(c: IStorage.CloseContext): Promise<void> {
    throwIfAborted(c.signal);
  }

  /**
   * バイト列を書き込みます。
   *
   * 期限付きなら有効期限を添えて保存します。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.#put(c.signal, c.key, data);
  }

  /**
   * バイト列を読み取ります。
   *
   * 指定したキーの値を取得します。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取ったバイト列です。
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    const buffer = await this.#getBuffer(c.signal, c.key);

    if (buffer === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return new Uint8Array(buffer);
  }

  /**
   * キーの存在を確認します。
   *
   * `get` の成否で判定します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    // KV に `head` 相当の API がないため `get` で存在を確認します。
    return (await this.#getBuffer(c.signal, c.key)) !== null;
  }

  /**
   * キーを削除します。
   *
   * 存在しないキーも成功扱いにします。
   *
   * @param c 削除コンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    throwIfAborted(c.signal);

    // 削除は冪等とし存在しないキーも成功扱いにします。
    await this.#binding.delete(this.#fullKey(c.key));
  }

  /**
   * 接頭辞配下のキーをすべて削除します。
   *
   * `list` で列挙してから削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    // 接頭辞配下のキーを `list` の頁送りで列挙します。
    // 列挙しながら削除すると頁送りがずれて取りこぼすため、先に全件集めてから削除します。
    const names: string[] = [];
    let cursor: string | undefined = undefined;

    do {
      const page: KVNamespaceListResult = await Promise.race([
        this.#binding.list({
          ...(cursor === undefined ? null : { cursor }),
          prefix: this.#keyPrefix,
        }),
        abortPromise,
      ]);

      for (const key of page.keys) {
        names.push(key.name);
      }

      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor !== undefined);

    for (const name of names) {
      throwIfAborted(c.signal);
      await this.#binding.delete(name);
    }
  }

  /**
   * 指定したキーの値を `ArrayBuffer` として取得します。
   *
   * 中断済みなら開始前に中断理由を投げ、取得中は中断と競合させます。
   *
   * @param signal 中断を知らせるシグナルです。
   * @param key 取得する論理キーです。
   *
   * @returns 取得したバイト列です。欠番時は null です。
   */
  async #getBuffer(signal: AbortSignal, key: string): Promise<ArrayBuffer | null> {
    throwIfAborted(signal);
    using abortPromise = toAbortPromise(signal);

    const buffer = await Promise.race([
      this.#binding.get(this.#fullKey(key), "arrayBuffer"),
      abortPromise,
    ]);

    return buffer;
  }

  /**
   * 指定したキーへバイト列を保存します。
   *
   * @param signal 中断を知らせるシグナルです。
   * @param key 保存先のキーです。
   * @param data 保存するバイト列です。
   *
   * @returns 保存が完了したら解決します。
   */
  async #put(signal: AbortSignal, key: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    throwIfAborted(signal);

    // ビューの `byteOffset` を持ち込まないよう正確な長さで複製します。
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    await this.#binding.put(
      this.#fullKey(key),
      buffer,
      this.#ttlSeconds === undefined ? undefined : { expirationTtl: this.#ttlSeconds },
    );
  }

  /**
   * 論理キーに接頭辞を付けた実キーを組み立てます。
   *
   * @param key 変換する論理キーです。
   *
   * @returns KV 上の実キーです。
   */
  #fullKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }
}
