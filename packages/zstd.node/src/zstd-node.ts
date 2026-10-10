import type { ITransformer } from "@unikvs/core";
import { callAsyncableFnOnce } from "call-fn-once";

import { zlibBridge } from "./_zlib.js";
import {
  UnsupportedRuntimeError,
  ZstdNodeDecompressError,
  ZstdNodeInvalidLevelError,
} from "./errors.js";

// node:zlib の解決結果を保持するキャッシュです。
// 同一キーへの同時呼び出しは同一の promise を共有します。
const zlibCache: callAsyncableFnOnce.CacheMap = new Map();

// node:zlib を遅延解決します。
// 解決は初回のみ実行し、失敗時はキャッシュを破棄して再試行できるようにします。
async function loadZlib(): Promise<typeof import("node:zlib")> {
  try {
    return await callAsyncableFnOnce(zlibCache, "zlib", async () => {
      const zlib = await zlibBridge.load();

      // 理由: zstd に対応しない Node.js ではプロパティーが未定義になるため、実行時に検出します。
      if (
        typeof zlib.zstdCompressSync !== "function" ||
        typeof zlib.zstdDecompressSync !== "function"
      ) {
        throw new UnsupportedRuntimeError({ name: "ZstdNode", runtime: "Node.js" });
      }

      return zlib;
    });
  } catch (error) {
    if (error instanceof UnsupportedRuntimeError) {
      throw error;
    }

    throw new UnsupportedRuntimeError({ name: "ZstdNode", runtime: "Node.js", cause: error });
  }
}

// 返却 view が ArrayBuffer を所有する素の Uint8Array であれば複写せずに返します。
// v8-serde の toAllocatedView とは異なり、共有域の公開を避けるため所有判定を行います。
// node:zlib は Buffer（Uint8Array の子クラス）を返すため、素の Uint8Array であることも確認します。
function ownBytes(view: Uint8Array): Uint8Array<ArrayBuffer> {
  if (
    view.constructor === Uint8Array &&
    view.buffer instanceof ArrayBuffer &&
    view.byteOffset === 0 &&
    view.byteLength === view.buffer.byteLength
  ) {
    return view as Uint8Array<ArrayBuffer>;
  }

  const copy = new Uint8Array(view.byteLength);
  copy.set(view);

  return copy;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
 */
export type ZstdNodeOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  readonly level?: number | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
 */
export default class ZstdNode implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public readonly name: string;

  // 圧縮レベルを保持します。
  private readonly level: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public constructor(options: ZstdNodeOptions = {}) {
    const level = options.level ?? 3;

    if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 22) {
      throw new ZstdNodeInvalidLevelError({ actual: options.level });
    }

    this.name = "ZstdNode";
    this.level = level;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public async encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const zlib = await loadZlib();
    const view = zlibBridge.compress(zlib, args.data, this.level);

    return ownBytes(view);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public async decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const zlib = await loadZlib();
    let view: Uint8Array;

    try {
      view = zlibBridge.decompress(zlib, args.data);
    } catch (error) {
      throw new ZstdNodeDecompressError({ cause: error });
    }

    return ownBytes(view);
  }
}
