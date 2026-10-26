import { type IMiddleware, type IPipelineContext, KeyNotFoundError } from "@unikvs/core";

import { TtlInvalidValueError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl-input)
 */
export type TtlInput =
  | number
  | Date
  | {
      readonly ttl?: number | undefined;
      readonly expiresAt?: number | Date | undefined;
    };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl-options)
 */
export type TtlOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl-options-default-ttl)
   */
  readonly defaultTtl?: TtlInput | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl-options-now)
   */
  readonly now?: (() => number) | undefined;
};

/**
 * エンベロープの識別子です。
 */
const TTL_MARKER = "@unikvs/ttl";

/**
 * エンベロープの版数です。
 */
const TTL_VERSION = 1;

/**
 * 失効済みであることを写像に伝える操作内変数の名前です。
 */
const EXPIRED_FLAG = "@unikvs/ttl:expired";

/**
 * 失効済みキーの写像先に付ける接尾辞です。実在しないキーへの写像に使います。
 */
const DEAD_KEY_SUFFIX = "\0@unikvs/ttl:expired";

/**
 * プレーン値に付ける有効期限エンベロープです。
 */
type TtlEnvelope = {
  readonly data: unknown;
  readonly expiresAt: number;
  readonly "@unikvs/ttl": 1;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
 */
export default class Ttl implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public static readonly TTL_VAR_NAME: string = "@unikvs/ttl:ttl";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public static readonly EXPIRES_AT_VAR_NAME: string = "@unikvs/ttl:expiresAt";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public readonly name: string = "Ttl";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public readonly defaultTtl: TtlInput | undefined;

  /**
   * 現在時刻 (epoch ミリ秒) を返す関数です。
   */
  readonly #now: () => number;

  /**
   * 論理キーごとの失効時刻 (epoch ミリ秒) の記録です。
   *
   * 読み取り前の `use` で失効を判定し、存在確認を不発にするために使います。
   * 永続側の真実はデータに同梱したエンベロープであり、こちらは操作内の高速判定用です。
   */
  readonly #expiry: Map<string, number>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public constructor(options: TtlOptions = {}) {
    const { now = Date.now, defaultTtl } = options;

    if (typeof now !== "function") {
      throw new TtlInvalidValueError({ actual: now });
    }

    if (defaultTtl !== undefined) {
      // 値の形状を構築時に検証します (相対値は解決し直すため結果は捨てます)。
      toExpiresAt(defaultTtl, now());
    }

    this.defaultTtl = defaultTtl;
    this.#now = now;
    this.#expiry = new Map();
  }

  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public mapKey(c: IMiddleware.MapKeyContext): string {
    // 失効済みの読み取り・存在確認は実在しないキーへ写像し、読み取りを不発にします。
    if (c.get(EXPIRED_FLAG) === true) {
      return `${c.key}${DEAD_KEY_SUFFIX}`;
    }

    return c.key;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    switch (c.action) {
      case "has":
      case "get":
      case "stream": {
        // 記録上で失効済みなら写像で不発にします。実判定は decode でも行います。
        const expiresAt = this.#expiry.get(c.key);

        if (expiresAt !== undefined && this.#now() >= expiresAt) {
          c.set(EXPIRED_FLAG, true);
        }

        break;
      }

      case "set":
      case "delete":
      case "clear": {
        break;
      }
    }

    await next();
  }

  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    const expiresAt = this.#expiresAtFor(c);

    if (expiresAt === undefined) {
      // TTL なしの上書きでは記録を消し、データを透過させます。
      this.#expiry.delete(c.key);
      c.destination = c.source;
    } else {
      this.#expiry.set(c.key, expiresAt);
      c.destination = Object.freeze({
        [TTL_MARKER]: TTL_VERSION,
        expiresAt,
        data: c.source,
      });
    }

    await next();
  }

  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    const envelope = isEnvelope(c.source) ? c.source : undefined;
    const expiresAt = envelope?.expiresAt ?? this.#expiry.get(c.key);

    if (expiresAt === undefined) {
      c.destination = c.source;

      await next();

      return;
    }

    // 遅延失効 : 読み取り時に期限切れを検出し、KeyNotFound 相当として扱います。
    if (this.#now() >= expiresAt) {
      this.#expiry.delete(c.key);

      throw new KeyNotFoundError({ key: c.key });
    }

    // 再起動後など記録が欠けているときは、エンベロープから記録を復元します。
    this.#expiry.set(c.key, expiresAt);
    c.destination = envelope === undefined ? c.source : envelope.data;

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    // ストリームは塊の型がストレージごとに制約されるため、帯域内に期限を埋め込まず、記録だけで管理します。いかなるストレージでも透過するためです。
    const expiresAt = this.#expiresAtFor(c);

    if (expiresAt === undefined) {
      this.#expiry.delete(c.key);
    } else {
      this.#expiry.set(c.key, expiresAt);
    }

    c.destination = c.source;

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    // 記録上で期限切れなら、ストリームを開く前に確定させます。
    const expiresAt = this.#expiry.get(c.key);

    if (expiresAt !== undefined && this.#now() >= expiresAt) {
      this.#expiry.delete(c.key);

      throw new KeyNotFoundError({ key: c.key });
    }

    c.destination = c.source;

    await next();
  }

  /**
   * 操作内変数と既定値から失効時刻 (epoch ミリ秒) を解決します。
   *
   * @param c 操作内変数を保持するコンテキストです。
   *
   * @returns 失効時刻を返します。TTL の指定がないときは `undefined` を返します。
   */
  #expiresAtFor(c: IPipelineContext): number | undefined {
    const ttl = firstDefined(c.get(Ttl.TTL_VAR_NAME), c.get("ttl"));
    let expiresAt: number | undefined = undefined;

    if (ttl !== undefined) {
      expiresAt = toExpiresAt(ttl as TtlInput, this.#now());
    } else {
      const rawExpiresAt = firstDefined(c.get(Ttl.EXPIRES_AT_VAR_NAME), c.get("expiresAt"));

      if (rawExpiresAt !== undefined) {
        expiresAt = toAbsolute(rawExpiresAt as number | Date);
      } else if (this.defaultTtl !== undefined) {
        expiresAt = toExpiresAt(this.defaultTtl, this.#now());
      }
    }

    return expiresAt;
  }
}

/**
 * 名前空間付き変数を優先して、最初に定義されている値を返します。
 *
 * @param primary 名前空間付き変数の値です。
 * @param fallback 非名前空間名の値です。
 *
 * @returns 定義されている方の値を返します。
 */
function firstDefined<A, B>(primary: A | undefined, fallback: B | undefined): A | B | undefined {
  return primary ?? fallback;
}

/**
 * TTL 値を失効時刻 (epoch ミリ秒) に変換します。
 *
 * @param input 変換する TTL 値です。
 * @param now 現在時刻 (epoch ミリ秒) です。
 *
 * @returns 失効時刻を返します。
 */
function toExpiresAt(input: TtlInput, now: number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new TtlInvalidValueError({ actual: input });
    }

    const expiresAt = now + input * 1000;

    if (!Number.isFinite(expiresAt)) {
      throw new TtlInvalidValueError({ actual: input });
    }

    return expiresAt;
  }

  if (input instanceof Date) {
    return toAbsolute(input);
  }

  if (typeof input === "object" && input !== null) {
    const { ttl, expiresAt } = input;

    if (expiresAt !== undefined) {
      return toAbsolute(expiresAt);
    }

    if (ttl !== undefined) {
      if (typeof ttl !== "number" || !Number.isFinite(ttl)) {
        throw new TtlInvalidValueError({ actual: input });
      }

      const resolved = now + ttl * 1000;

      if (!Number.isFinite(resolved)) {
        throw new TtlInvalidValueError({ actual: input });
      }

      return resolved;
    }
  }

  throw new TtlInvalidValueError({ actual: input });
}

/**
 * 絶対失効時刻を epoch ミリ秒に変換します。
 *
 * @param input 変換する値です。
 *
 * @returns 失効時刻を返します。
 */
function toAbsolute(input: number | Date): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new TtlInvalidValueError({ actual: input });
    }

    return input;
  }

  if (input instanceof Date) {
    const time = input.getTime();

    if (Number.isNaN(time)) {
      throw new TtlInvalidValueError({ actual: input });
    }

    return time;
  }

  throw new TtlInvalidValueError({ actual: input });
}

/**
 * プレーンオブジェクトかどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns レコードとして扱えるとき `true` を返します。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * プレーン値の有効期限エンベロープかどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns エンベロープのとき `true` を返します。
 */
function isEnvelope(value: unknown): value is TtlEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Object.keys(value).length === 3 &&
    value[TTL_MARKER] === TTL_VERSION &&
    typeof value["expiresAt"] === "number" &&
    "data" in value
  );
}
