import { type IMiddleware, KeyNotFoundError } from "@unikvs/core";

import { ExpiryInvalidExpiresAtError } from "./errors.js";

/**
 * 有効期限として指定できる値です。
 *
 * - `Date` は絶対失効時刻です。
 * - `number` は epoch ミリ秒です。
 * - `string` は ISO 8601 形式の絶対失効時刻です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expires-at-input)
 */
export type ExpiresAtInput = Date | number | string;

/**
 * 期限切れを検出したときに通知される情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-expired-info)
 */
export type ExpiryExpiredInfo = {
  /**
   * 期限切れだったキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-expired-info-key)
   */
  readonly key: string;

  /**
   * 失効時刻 (epoch ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-expired-info-expires-at)
   */
  readonly expiresAt: number;
};

/**
 * Expiry ミドルウェアのオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-options)
 */
export type ExpiryOptions = {
  /**
   * 書き込みごとの指定がないときに使う既定の有効期限です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-options-default-expires-at)
   */
  readonly defaultExpiresAt?: ExpiresAtInput | undefined;

  /**
   * 現在時刻 (epoch ミリ秒) を返す関数です。既定値は `Date.now` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-options-now)
   */
  readonly now?: (() => number) | undefined;

  /**
   * 期限切れを検出したときに呼び出される通知です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-options-on-expire)
   */
  readonly onExpire?: ((info: ExpiryExpiredInfo) => void) | undefined;
};

/**
 * エンベロープの識別子です。
 */
const EXPIRY_MARKER = "@unikvs/expiry";

/**
 * エンベロープの版数です。
 */
const EXPIRY_VERSION = 1;

/**
 * プレーン値に付ける有効期限エンベロープです。
 */
type ExpiryEnvelope = {
  readonly "@unikvs/expiry": 1;

  readonly expiresAt: number | null;

  readonly data: unknown;
};

const EXPIRES_AT_VAR = "@unikvs/expiry:expiresAt";

function toEpochMs(input: unknown, key?: string): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new ExpiryInvalidExpiresAtError({
        key,
        actual: input,
      });
    }

    return input;
  }

  if (input instanceof Date) {
    const ms = input.getTime();

    if (Number.isNaN(ms)) {
      throw new ExpiryInvalidExpiresAtError({
        key,
        actual: input,
      });
    }

    return ms;
  }

  if (typeof input === "string") {
    const ms = Date.parse(input);

    if (Number.isNaN(ms)) {
      throw new ExpiryInvalidExpiresAtError({
        key,
        actual: input,
      });
    }

    return ms;
  }

  throw new ExpiryInvalidExpiresAtError({
    key,
    actual: input,
  });
}

function asEnvelope(value: unknown): ExpiryEnvelope | undefined {
  let envelope: ExpiryEnvelope | undefined = undefined;

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    if (
      EXPIRY_MARKER in value &&
      "expiresAt" in value &&
      "data" in value &&
      Object.keys(value).length === 3
    ) {
      const { expiresAt } = value as { readonly expiresAt: unknown };

      if (
        (value as { readonly [EXPIRY_MARKER]?: unknown })[EXPIRY_MARKER] === EXPIRY_VERSION &&
        (expiresAt === null || typeof expiresAt === "number")
      ) {
        envelope = value as ExpiryEnvelope;
      }
    }
  }

  return envelope;
}

/**
 * 有効期限付きのエンベロープで値を包み、読み出し時に期限切れを判定するミドルウェアです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry)
 */
export default class Expiry implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry)
   */
  public readonly name: string = "Expiry";

  /**
   * コンストラクターに指定された既定の有効期限です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry)
   */
  public readonly defaultExpiresAt: ExpiresAtInput | undefined;

  readonly #defaultExpiresAt: number | null;

  readonly #now: () => number;

  readonly #onExpire: ((info: ExpiryExpiredInfo) => void) | undefined;

  /**
   * Expiry ミドルウェアを作成します。
   *
   * @param options 既定の有効期限と時刻の取得方法です。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry)
   */
  public constructor(options: ExpiryOptions = {}) {
    const { now = Date.now, onExpire, defaultExpiresAt } = options;
    this.defaultExpiresAt = defaultExpiresAt;
    this.#defaultExpiresAt = defaultExpiresAt === undefined ? null : toEpochMs(defaultExpiresAt);
    this.#now = now;
    this.#onExpire = onExpire;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = Object.freeze({
      [EXPIRY_MARKER]: EXPIRY_VERSION,
      expiresAt: this.#resolveExpiresAt(c),
      data: c.source,
    });

    await next();
  }

  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    const envelope = asEnvelope(c.source);

    if (envelope === undefined) {
      c.destination = c.source;

      await next();

      return;
    }

    if (envelope.expiresAt !== null && this.#now() >= envelope.expiresAt) {
      this.#onExpire?.({
        key: c.key,
        expiresAt: envelope.expiresAt,
      });

      throw new KeyNotFoundError({ key: c.key });
    }

    c.destination = envelope.data;

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    const expiresAt = this.#resolveExpiresAt(c);
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform(chunk, controller): void {
          controller.enqueue(
            Object.freeze({
              [EXPIRY_MARKER]: EXPIRY_VERSION,
              expiresAt,
              data: chunk,
            }),
          );
        },
      }),
    );

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    const now = this.#now;
    const onExpire = this.#onExpire;
    const key = c.key;
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform(chunk, controller): void {
          const envelope = asEnvelope(chunk);

          if (envelope === undefined) {
            controller.enqueue(chunk);

            return;
          }

          if (envelope.expiresAt !== null && now() >= envelope.expiresAt) {
            onExpire?.({
              key,
              expiresAt: envelope.expiresAt,
            });

            throw new KeyNotFoundError({ key });
          }

          controller.enqueue(envelope.data);
        },
      }),
    );

    await next();
  }

  #resolveExpiresAt(c: IMiddleware.EncodeContext | IMiddleware.EncodeStreamContext): number | null {
    const raw: unknown = c.get(EXPIRES_AT_VAR);

    if (raw === undefined || raw === null) {
      return this.#defaultExpiresAt;
    }

    return toEpochMs(raw, c.key);
  }
}
