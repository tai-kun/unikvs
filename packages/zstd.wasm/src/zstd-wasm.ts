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
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  public readonly name: string = "ZstdWasm";

  /**
   * 実行環境です。
   */
  #env: IEnv | null;

  /**
   * 圧縮レベルです。
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

  public get isOpen(): boolean {
    return this.#env !== null;
  }

  // 開いている実行環境を返します。
  // 未オープン時は `TypeError` を投げます。
  #getEnv(): IEnv {
    const env = this.#env;

    if (env === null) {
      throw new TypeError("ZstdWasm is not open. Call open() first.");
    }

    return env;
  }

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
}
