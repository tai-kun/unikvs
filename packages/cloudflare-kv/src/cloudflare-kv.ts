import { KeyNotFoundError, type IStorage } from "@unikvs/core";

import { InvalidBindingError, InvalidKeyPrefixError, InvalidTtlSecondsError } from "./errors.js";

/**
 * `KVNamespace.list` が返すキーの最小形状です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
 */
export interface KVNamespaceListKey {
  readonly name: string;
}

/**
 * `KVNamespace.list` が返すページの最小形状です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
 */
export interface KVNamespaceListResult {
  readonly keys: readonly KVNamespaceListKey[];
  readonly list_complete: boolean;
  readonly cursor: string;
}

/**
 * Cloudflare Workers の `KVNamespace` binding の最小形状です。
 *
 * `wrangler` への依存を避けるため、必要な `get` / `put` / `delete` / `list` だけを定義します。
 * 実物の binding はこの形状を満たすため、そのまま渡せます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
 */
export interface KVNamespaceLike {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  get(key: string, options: { readonly type: "arrayBuffer" }): Promise<ArrayBuffer | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options?: { readonly expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    readonly prefix?: string | undefined;
    readonly cursor?: string | undefined;
  }): Promise<KVNamespaceListResult>;
}

/**
 * `CloudflareKv` の構築引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
 */
export type CloudflareKvOptions = {
  /**
   * 注入する KV binding です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
   */
  readonly binding: KVNamespaceLike;

  /**
   * すべてのキーに付与する接頭辞です。既定値は `"unikvs:"` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * 書き込み時に付与する有効期限 (秒) です。未指定なら無期限です。
   * `put` の `expirationTtl` としてそのまま渡します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
   */
  readonly ttlSeconds?: number | undefined;
};

/**
 * Cloudflare KV binding 上のストレージです。
 *
 * 注意: Cloudflare KV は結果整合性 (eventual consistency) のストレージです。
 * 書き込み・削除の直後に別ロケーションから読むと古い値が見えることがあります。
 * 同一コロケーション内からの読み取りは強い一貫性が保たれます。
 * `clear` 直後の `list` / `read` も古い結果を返すことがあるため、
 * 厳密な一貫性が必要な用途には使わないでください。
 *
 * 値はバイナリーセーフな `ArrayBuffer` としてそのまま `put` / `get` します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
 */
export default class CloudflareKv implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
   */
  public readonly name: string;

  // 注入された KV binding です。
  readonly #binding: KVNamespaceLike;

  // すべてのキーに付与する接頭辞です。
  readonly #keyPrefix: string;

  // 書き込み時に付与する有効期限 (秒) です。
  // 未指定なら無期限です。
  readonly #ttlSeconds: number | undefined;

  /**
   * Cloudflare KV binding 上のストレージです。
   *
   * 注意: Cloudflare KV は結果整合性 (eventual consistency) のストレージです。
   * 書き込み・削除の直後に別ロケーションから読むと古い値が見えることがあります。
   * 同一コロケーション内からの読み取りは強い一貫性が保たれます。
   * `clear` 直後の `list` / `read` も古い結果を返すことがあるため、
   * 厳密な一貫性が必要な用途には使わないでください。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#usage)
   */
  public constructor(options: CloudflareKvOptions) {
    if (options === null || typeof options !== "object") {
      throw new InvalidBindingError({ actual: options });
    }

    const { binding, keyPrefix = "unikvs:", ttlSeconds } = options;

    if (
      binding === null ||
      typeof binding !== "object" ||
      typeof (binding as Partial<KVNamespaceLike>).get !== "function" ||
      typeof (binding as Partial<KVNamespaceLike>).put !== "function" ||
      typeof (binding as Partial<KVNamespaceLike>).delete !== "function" ||
      typeof (binding as Partial<KVNamespaceLike>).list !== "function"
    ) {
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

  // 論理キーに接頭辞を付けた実キーを組み立てます。
  #fullKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    c.signal.throwIfAborted();
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    c.signal.throwIfAborted();
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    c.signal.throwIfAborted();

    // ビューの `byteOffset` を持ち込まないよう正確な長さで複製します。
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);

    await this.#binding.put(
      this.#fullKey(c.key),
      buffer,
      this.#ttlSeconds === undefined ? undefined : { expirationTtl: this.#ttlSeconds },
    );
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const buffer = await this.#binding.get(this.#fullKey(c.key), "arrayBuffer");

    if (buffer === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return new Uint8Array(buffer);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    // KV に `head` 相当の API がないため `get` で存在を確認します。
    const buffer = await this.#binding.get(this.#fullKey(c.key), "arrayBuffer");

    return buffer !== null;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    // 削除は冪等とし存在しないキーも成功扱いにします。
    await this.#binding.delete(this.#fullKey(c.key));
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    c.signal.throwIfAborted();

    // 接頭辞配下のキーを `list` の頁送りで列挙します。
    // 列挙しながら削除すると頁送りがずれて取りこぼすため、先に全件集めてから削除します。
    const names: string[] = [];
    let cursor: string | undefined = undefined;

    do {
      const page = await this.#binding.list(
        cursor === undefined ? { prefix: this.#keyPrefix } : { prefix: this.#keyPrefix, cursor },
      );

      for (const key of page.keys) {
        names.push(key.name);
      }

      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor !== undefined);

    for (const name of names) {
      c.signal.throwIfAborted();
      await this.#binding.delete(name);
    }
  }
}
