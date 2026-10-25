import type { IMiddleware, ITransformStream } from "@unikvs/core";
import { toOwnedBytes, proxyTransformStream } from "@unikvs/utils";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { BrotliInvalidLevelError, UnsupportedRuntimeError } from "./errors.js";

/**
 * Brotli ミドルウェアのオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#usage)
 */
export type BrotliOptions = {
  /**
   * 圧縮レベルです。0 から 11 までの整数を指定します。
   * 値が大きいほど圧縮率は高くなりますが、処理時間も長くなります。
   * 省略した場合は Node.js の既定値である 11 を使用します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#usage)
   */
  readonly level?: number | undefined;
};

function toOwnedBytesTransformStream(
  transform: ITransformStream<Buffer, Buffer>,
): ITransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
  return proxyTransformStream(
    transform,
    (
      chunk: Uint8Array<ArrayBuffer>,
      controller: TransformStreamDefaultController<Buffer>,
    ): void => {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      controller.enqueue(buffer);
    },
    (
      buffer: Buffer,
      controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
    ): void => {
      const chunk = toOwnedBytes(buffer);
      controller.enqueue(chunk);
    },
  );
}

/**
 * Node.js の `node:zlib` を使って Brotli で圧縮・展開するミドルウェアです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#usage)
 */
export default class Brotli implements IMiddleware {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#usage)
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#usage)
   */
  public readonly name: string = "Brotli";

  /**
   * 実行環境です。
   */
  #env: IEnv | null;

  /**
   * 圧縮レベルです。
   */
  readonly #level: number;

  /**
   * @param options コンストラクターオプションです。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#usage)
   */
  public constructor(options: BrotliOptions = {}) {
    const { level = 11 } = options;
    const isValidLevel = Number.isInteger(level) && level >= 0 && level <= 11;

    if (!isValidLevel) {
      throw new BrotliInvalidLevelError({ actual: level });
    }

    this.#env = null;
    this.#level = level;
  }

  public get isOpen(): boolean {
    return this.#env !== null;
  }

  // 開いている実行環境を返します。
  // 未オープン時は `TypeError` を投げます。
  #getEnv(): IEnv {
    const env = this.#env;

    if (env === null) {
      throw new TypeError("Brotli is not open. Call open() first.");
    }

    return env;
  }

  public async open(c: IMiddleware.OpenContext): Promise<void> {
    try {
      this.#env = await callAbortableFnOnce(
        Brotli.#cache,
        "api.init",
        async (signal) => {
          using abortPromise = toAbortPromise(signal);
          const env = await Promise.race([api.init(), abortPromise]);

          return env;
        },
        c.signal,
      );
    } catch (ex) {
      throwIfAborted(c.signal);
      throw new UnsupportedRuntimeError({
        name: "Brotli",
        cause: ex,
        runtime: "Node.js",
      });
    }
  }

  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const env = this.#getEnv();
    const buffer = await api.compress(env, c.source, { level: this.#level });
    c.destination = toOwnedBytes(buffer);

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const env = this.#getEnv();
    const buffer = await api.decompress(env, c.source);
    c.destination = toOwnedBytes(buffer);

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const env = this.#getEnv();
    const compress = api.createCompress(env, { level: this.#level });
    const transform = toOwnedBytesTransformStream(compress);
    c.destination = c.source.pipeThrough(transform);

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const env = this.#getEnv();
    const decompress = api.createDecompress(env);
    const transform = toOwnedBytesTransformStream(decompress);
    c.destination = c.source.pipeThrough(transform);

    await next();
  }
}
