import { type IMiddleware, KeyNotFoundError } from "@unikvs/core";

import { ExpiryInvalidExpiresAtError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expires-at-input)
 */
export type ExpiresAtInput = Date | number | string;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-expired-info)
 */
export type ExpiryExpiredInfo = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-expired-info-key)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-expired-info-expires-at)
   */
  readonly expiresAt: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-options)
 */
export type ExpiryOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-options-default-expires-at)
   */
  readonly defaultExpiresAt?: ExpiresAtInput | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-options-now)
   */
  readonly now?: (() => number) | undefined;

  /**
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
    const record = value as Record<string, unknown>;

    if (
      Object.keys(record).length === 3 &&
      EXPIRY_MARKER in record &&
      "expiresAt" in record &&
      "data" in record &&
      record[EXPIRY_MARKER] === EXPIRY_VERSION &&
      (record["expiresAt"] === null || typeof record["expiresAt"] === "number")
    ) {
      envelope = record as ExpiryEnvelope;
    }
  }

  return envelope;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry)
 */
export default class Expiry implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry)
   */
  public readonly name: string = "Expiry";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry)
   */
  public readonly defaultExpiresAt: ExpiresAtInput | undefined;

  readonly #defaultExpiresAt: number | null;

  readonly #now: () => number;

  readonly #onExpire: ((info: ExpiryExpiredInfo) => void) | undefined;

  /**
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
      this.#throwExpired(c.key, envelope.expiresAt);
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
    const key = c.key;
    c.destination = c.source.pipeThrough(
      new TransformStream({
        transform: (chunk, controller): void => {
          const envelope = asEnvelope(chunk);

          if (envelope === undefined) {
            controller.enqueue(chunk);

            return;
          }

          if (envelope.expiresAt !== null && now() >= envelope.expiresAt) {
            this.#throwExpired(key, envelope.expiresAt);
          }

          controller.enqueue(envelope.data);
        },
      }),
    );

    await next();
  }

  /**
   * 失効を通知してから、存在しないキーとして投げます。
   *
   * @param key 失効したキーです。
   * @param expiresAt 失効時刻です。
   */
  #throwExpired(key: string, expiresAt: number): never {
    this.#onExpire?.({
      key,
      expiresAt,
    });

    throw new KeyNotFoundError({ key });
  }

  #resolveExpiresAt(c: IMiddleware.EncodeContext | IMiddleware.EncodeStreamContext): number | null {
    const raw: unknown = c.get(EXPIRES_AT_VAR);

    if (raw === undefined || raw === null) {
      return this.#defaultExpiresAt;
    }

    return toEpochMs(raw, c.key);
  }
}
