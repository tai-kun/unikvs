import type { ITransformer } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { ZstdWasmInitError, ZstdWasmInvalidLevelError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
 */
export type ZstdWasmOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  readonly level?: number | undefined;
};

// 理由: 上流の @bokuweb/zstd-wasm には一括変換 (compress/decompress) のみがあり、
// ストリーミング API が存在しないため、getEncodable/getDecodable は提供しません。
// テストでも非提供が契約として検証されています。

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
 */
export default class ZstdWasm implements ITransformer {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   */
  private static readonly cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public readonly name: string = "ZstdWasm";

  /**
   * 実行環境です。
   */
  private env: IEnv | null;

  /**
   * 圧縮レベルです。
   */
  private readonly level: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public constructor(options: ZstdWasmOptions = {}) {
    const { level = 3 } = options;
    const isValidLevel = Number.isInteger(level) && level >= 1 && level <= 22;
    if (!isValidLevel) {
      throw new ZstdWasmInvalidLevelError({ actual: level });
    }

    this.env = null;
    this.level = level;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public get isOpen(): boolean {
    return this.env !== null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public async open(args: Pick<ITransformer.OpenArgs, "signal">): Promise<void> {
    const { signal } = args;
    try {
      this.env = await callAbortableFnOnce(
        ZstdWasm.cache,
        "api.init",
        async (signal) => {
          using abortPromise = toAbortPromise(signal);
          const env = await Promise.race([api.init(), abortPromise]);

          return env;
        },
        signal,
      );
    } catch (ex) {
      signal.throwIfAborted();
      throw new ZstdWasmInitError({ cause: ex });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public async encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const { data } = args;
    const view = api.compress(env, data, {
      level: this.level,
    });

    return toOwnedBytes(view);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public async decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const { data } = args;
    const view = api.decompress(env, data);

    return toOwnedBytes(view);
  }
}
