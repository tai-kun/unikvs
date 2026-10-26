import type { IMiddleware } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { BrotliWasmInitError, BrotliWasmInvalidLevelError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
 */
export type BrotliWasmOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#level)
   */
  readonly level?: number | undefined;
};

// 理由 : 一括変換 (compress/decompress) のみを提供し、ストリーミング API は提供しません。
// 上流の CompressStream/DecompressStream は低水準なチャンク API であり、バッファー管理の実装が別途必要になるため対象外とします。
// テストでも非提供が契約として検証されています。

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
 */
export default class BrotliWasm implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
   */
  public readonly name: string = "BrotliWasm";

  /**
   * 解決済みの実行環境です。
   *
   * `open()` で解決されるまでは null です。
   */
  #env: IEnv | null;

  /**
   * 圧縮レベルです。
   *
   * 0 から 11 の整数を保持します。
   */
  readonly #level: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
   */
  public constructor(options: BrotliWasmOptions = {}) {
    const { level = 11 } = options;
    const isValidLevel = Number.isInteger(level) && level >= 0 && level <= 11;

    if (!isValidLevel) {
      throw new BrotliWasmInvalidLevelError({ actual: level });
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
   * brotli-wasm の実行環境を解決します。
   *
   * @param c オープン時のコンテキストです。
   *
   * @returns 初期化が完了したら解決するプロミスを返します。
   */
  public async open(c: IMiddleware.OpenContext): Promise<void> {
    try {
      this.#env = await callAbortableFnOnce(
        BrotliWasm.#cache,
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

      throw new BrotliWasmInitError({ cause: ex });
    }
  }

  /**
   * バイト列を brotli で圧縮します。
   *
   * @param c エンコード対象のバイト列を持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換が完了したら解決するプロミスを返します。
   */
  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const env = this.#getEnv();
    const view = api.compress(env, c.source, {
      level: this.#level,
    });
    c.destination = toOwnedBytes(view);

    await next();
  }

  /**
   * brotli で圧縮されたバイト列を展開します。
   *
   * @param c デコード対象のバイト列を持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換が完了したら解決するプロミスを返します。
   */
  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const env = this.#getEnv();
    const view = api.decompress(env, c.source);
    c.destination = toOwnedBytes(view);

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
      throw new TypeError("BrotliWasm is not open. Call open() first.");
    }

    return env;
  }
}
