import type { IMiddleware } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { BrotliWasmInitError, BrotliWasmInvalidLevelError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
 */
export type BrotliWasmOptions = {
  /**
   * 圧縮レベルです。0 から 11 までの整数を指定します。
   * 値が大きいほど圧縮率は高くなりますが、処理時間も長くなります。
   * 省略した場合は既定値である 11 を使用します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
   */
  readonly level?: number | undefined;
};

// 理由: 一括変換 (compress/decompress) のみを提供し、
// ストリーミング API は提供しません。
// 上流の CompressStream/DecompressStream は低水準なチャンク API であり、
// バッファー管理の実装が別途必要になるため対象外とします。
// テストでも非提供が契約として検証されています。

/**
 * WASM 実装の brotli で圧縮・展開するミドルウェアです。
 *
 * `brotli-wasm` を動的 import し、圧縮・展開のたびに同期的な API を使います。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
 */
export default class BrotliWasm implements IMiddleware {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#usage)
   */
  public readonly name: string = "BrotliWasm";

  /**
   * 実行環境です。
   */
  #env: IEnv | null;

  /**
   * 圧縮レベルです。
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

  public get isOpen(): boolean {
    return this.#env !== null;
  }

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
      c.signal.throwIfAborted();

      throw new BrotliWasmInitError({ cause: ex });
    }
  }

  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const view = api.compress(env, c.source, {
      level: this.#level,
    });
    c.destination = toOwnedBytes(view);

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const view = api.decompress(env, c.source);
    c.destination = toOwnedBytes(view);

    await next();
  }
}
