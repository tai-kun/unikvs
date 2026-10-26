import type { IMiddleware, ITransformStream } from "@unikvs/core";
import { toOwnedBytes, proxyTransformStream } from "@unikvs/utils";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { UnsupportedRuntimeError, ZstdNodeInvalidLevelError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#usage)
 */
export type ZstdNodeOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#level)
   */
  readonly level?: number | undefined;
};

/**
 * バイト列と所有化バイト列の変換を中継するストリームを作成します。
 *
 * Node の Buffer ストリームと Web の `Uint8Array` ストリームの差を吸収します。
 *
 * @param transform 変換元の Node ストリームです。
 *
 * @returns 所有化バイト列を扱うストリームを返します。
 */
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#usage)
 */
export default class ZstdNode implements IMiddleware {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   *
   * 同じ実行環境を使い回すために利用します。
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#usage)
   */
  public readonly name: string = "ZstdNode";

  /**
   * 解決済みの実行環境です。
   *
   * `open()` で解決されるまでは null です。
   */
  #env: IEnv | null;

  /**
   * 圧縮レベルです。
   *
   * 1 から 22 の整数を保持します。
   */
  readonly #level: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#usage)
   */
  public constructor(options: ZstdNodeOptions = {}) {
    const { level = 3 } = options;
    const isValidLevel = Number.isInteger(level) && level >= 1 && level <= 22;

    if (!isValidLevel) {
      throw new ZstdNodeInvalidLevelError({ actual: level });
    }

    this.#env = null;
    this.#level = level;
  }

  /**
   * 開いているかどうかを表します。
   *
   * @returns 実行環境が設定済みなら true を返します。
   */
  public get isOpen(): boolean {
    return this.#env !== null;
  }

  /**
   * `node:zlib` の実行環境を解決します。
   *
   * @param c オープン時のコンテキストです。
   *
   * @returns 初期化が完了したら解決するプロミスを返します。
   */
  public async open(c: IMiddleware.OpenContext): Promise<void> {
    try {
      this.#env = await callAbortableFnOnce(
        ZstdNode.#cache,
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
        name: "ZstdNode",
        cause: ex,
        runtime: "Node.js",
      });
    }
  }

  /**
   * バイト列を zstd で圧縮します。
   *
   * @param c エンコード対象のバイト列を持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換が完了したら解決するプロミスを返します。
   */
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

  /**
   * zstd で圧縮されたバイト列を展開します。
   *
   * @param c デコード対象のバイト列を持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換が完了したら解決するプロミスを返します。
   */
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

  /**
   * バイト列ストリームを zstd で圧縮したストリームへ変換します。
   *
   * @param c エンコード対象のバイト列ストリームを持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換の設定が完了したら解決するプロミスを返します。
   */
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

  /**
   * zstd で圧縮されたバイト列ストリームを展開したストリームへ変換します。
   *
   * @param c デコード対象のバイト列ストリームを持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換の設定が完了したら解決するプロミスを返します。
   */
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

  /**
   * 開いている実行環境を返します。
   *
   * 未オープン時は `TypeError` を投げます。
   *
   * @returns 開いている実行環境を返します。
   */
  #getEnv(): IEnv {
    const env = this.#env;

    if (env === null) {
      throw new TypeError("ZstdNode is not open. Call open() first.");
    }

    return env;
  }
}
