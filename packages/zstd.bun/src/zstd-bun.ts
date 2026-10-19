import type { IMiddleware } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { UnsupportedRuntimeError, ZstdBunInvalidLevelError } from "./errors.js";

/**
 * `ZstdBun` のコンストラクターオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#usage)
 */
export type ZstdBunOptions = {
  /**
   * zstd の圧縮レベルです。1 から 22 の整数を指定します。既定値は 3 です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#usage)
   */
  readonly level?: number | undefined;
};

/**
 * Zstandard で圧縮・展開するミドルウェアです。
 *
 * Bun ランタイムでは `Bun.zstdCompressSync` と `Bun.zstdDecompressSync` を使い、
 * それ以外の環境では `node:zlib` の zstd 系 API へフォールバックします。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#usage)
 */
export default class ZstdBun implements IMiddleware {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#usage)
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#usage)
   */
  public readonly name: string = "ZstdBun";

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
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#usage)
   */
  public constructor(options: ZstdBunOptions = {}) {
    const { level = 3 } = options;
    const isValidLevel = Number.isInteger(level) && level >= 1 && level <= 22;
    if (!isValidLevel) {
      throw new ZstdBunInvalidLevelError({ actual: level });
    }

    this.#env = null;
    this.#level = level;
  }

  public get isOpen(): boolean {
    return this.#env !== null;
  }

  public async open(c: IMiddleware.OpenContext): Promise<void> {
    try {
      this.#env = await callAbortableFnOnce(
        ZstdBun.#cache,
        "api.init",
        async (signal) => {
          using abortPromise = toAbortPromise(signal);
          const env = await Promise.race([api.init(), abortPromise]);

          return env;
        },
        c.signal,
      );
    } catch (ex) {
      c.signal.throwIfAborted();
      throw new UnsupportedRuntimeError({
        name: "ZstdBun",
        cause: ex,
        runtime: "Bun",
      });
    }
  }

  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const buffer = api.compress(env, c.source, { level: this.#level });
    c.destination = toOwnedBytes(buffer);

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const buffer = api.decompress(env, c.source);
    c.destination = toOwnedBytes(buffer);

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const compress = api.createCompress(env, { level: this.#level });
    c.destination = c.source.pipeThrough(compress);

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const decompress = api.createDecompress(env);
    c.destination = c.source.pipeThrough(decompress);

    await next();
  }
}
