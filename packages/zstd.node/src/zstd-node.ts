import type { ITransformer, ITransformStream } from "@unikvs/core";
import { toOwnedBytes, proxyTransformStream } from "@unikvs/utils";
import { toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { UnsupportedRuntimeError, ZstdNodeInvalidLevelError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
 */
export type ZstdNodeOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  readonly level?: number | undefined;
};

function toOwnedBytesTransformStream(
  transform: ITransformStream<Buffer, Buffer>,
): ITransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
  return proxyTransformStream(
    transform,
    (chunk: Uint8Array<ArrayBuffer>, controller) => {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      controller.enqueue(buffer);
    },
    (buffer: Buffer, controller) => {
      const chunk = toOwnedBytes(buffer);
      controller.enqueue(chunk);
    },
  );
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
 */
export default class ZstdNode implements ITransformer {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   */
  private static readonly cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public readonly name: string = "ZstdNode";

  /**
   * 実行環境です。
   */
  private env: IEnv | null;

  /**
   * 圧縮レベルです。
   */
  private readonly level: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public constructor(options: ZstdNodeOptions = {}) {
    const { level = 3 } = options;
    const isValidLevel =
      Number.isInteger(level) && level >= 1 && level <= 22;
    if (!isValidLevel) {
      throw new ZstdNodeInvalidLevelError({ actual: level });
    }

    this.env = null;
    this.level = level;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public get isOpen(): boolean {
    return this.env !== null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public async open(args: Pick<ITransformer.OpenArgs, "signal">): Promise<void> {
    const { signal } = args;
    try {
      this.env = await callAbortableFnOnce(
        ZstdNode.cache,
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
      throw new UnsupportedRuntimeError({
        name: "ZstdNode",
        cause: ex,
        runtime: "Node.js",
      });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public async encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const { data } = args;
    const buffer = await api.compress(env, data, {
      level: this.level,
    });

    return toOwnedBytes(buffer);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public async decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const { data } = args;
    const buffer = await api.decompress(env, data);

    return toOwnedBytes(buffer);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public getEncodable(): ITransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const transform = api.createCompress(env, {
      level: this.level,
    });

    return toOwnedBytesTransformStream(transform);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
   */
  public getDecodable(): ITransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const transform = api.createDecompress(env);

    return toOwnedBytesTransformStream(transform);
  }
}
