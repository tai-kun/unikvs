import type { IMiddleware } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { ZstdWasmInitError, ZstdWasmInvalidLevelError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-wasm#usage)
 */
export type ZstdWasmOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-wasm#level)
   */
  readonly level?: number | undefined;
};

// 理由 : 上流の @bokuweb/zstd-wasm には一括変換 (compress/decompress) のみがあり、ストリーミング API が存在しないため、encodeStream/decodeStream は提供しません。
// テストでも非提供が契約として検証されています。

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-wasm#usage)
 */
export default class ZstdWasm implements IMiddleware {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   *
   * 同じ実行環境を使い回すために利用します。
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-wasm#usage)
   */
  public readonly name: string = "ZstdWasm";

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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-wasm#usage)
   */
  public constructor(options: ZstdWasmOptions = {}) {
    const { level = 3 } = options;
    const isValidLevel = Number.isInteger(level) && level >= 1 && level <= 22;

    if (!isValidLevel) {
      throw new ZstdWasmInvalidLevelError({ actual: level });
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
   * zstd-wasm の実行環境を解決します。
   *
   * @param c オープン時のコンテキストです。
   *
   * @returns 初期化が完了したら解決するプロミスを返します。
   */
  public async open(c: IMiddleware.OpenContext): Promise<void> {
    try {
      this.#env = await callAbortableFnOnce(
        ZstdWasm.#cache,
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

      throw new ZstdWasmInitError({ cause: ex });
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
   * zstd で圧縮されたバイト列を展開します。
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
      throw new TypeError("ZstdWasm is not open. Call open() first.");
    }

    return env;
  }
}
