import type { ITransformer } from "@unikvs/core";
import { toOwnedView } from "@unikvs/utils";
import { callAsyncableFnOnce } from "call-fn-once";

import { wasmBridge } from "./_zstd-wasm.js";
import { ZstdWasmDecompressError, ZstdWasmInitError, ZstdWasmInvalidLevelError } from "./errors.js";

// WASM 初期化の共有キャッシュを保持します。
const initCache: callAsyncableFnOnce.CacheMap = new Map();

// WASM の初期化を1回だけ実行します。
async function ensureInit(): Promise<void> {
  try {
    await callAsyncableFnOnce(initCache, "init", () => wasmBridge.init());
  } catch (error) {
    throw new ZstdWasmInitError({ cause: error });
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
 */
export type ZstdWasmOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  readonly level?: number | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
 */
export default class ZstdWasm implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public readonly name: string;

  // 圧縮レベルを保持します。
  private readonly level: number;

  // 初期化が完了したかどうかを保持します。
  private opened = false;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public constructor(options: ZstdWasmOptions = {}) {
    const level = options.level ?? 3;

    if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 22) {
      throw new ZstdWasmInvalidLevelError({ actual: options.level });
    }

    this.name = "ZstdWasm";
    this.level = level;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public get isOpen(): boolean {
    return this.opened;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public async open(args: Pick<ITransformer.OpenArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();
    await this.ensureOpened();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public async encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const view = wasmBridge.compress(args.data, this.level);

    return toOwnedView(view);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#usage)
   */
  public async decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    let view: Uint8Array;

    try {
      view = wasmBridge.decompress(args.data);
    } catch (error) {
      throw new ZstdWasmDecompressError({ cause: error });
    }

    return toOwnedView(view);
  }

  // 初期化が成功したら開済みにします。
  private async ensureOpened(): Promise<void> {
    await ensureInit();
    this.opened = true;
  }
}
