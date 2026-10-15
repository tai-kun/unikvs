import type { IMiddleware, ITransformStream } from "@unikvs/core";
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
export default class ZstdNode implements IMiddleware {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  public readonly name: string = "ZstdNode";

  /**
   * 実行環境です。
   */
  #env: IEnv | null;

  /**
   * 圧縮レベルです。
   */
  readonly #level: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#usage)
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

  public get isOpen(): boolean {
    return this.#env !== null;
  }

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
      c.signal.throwIfAborted();
      throw new UnsupportedRuntimeError({
        name: "ZstdNode",
        cause: ex,
        runtime: "Node.js",
      });
    }
  }

  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const buffer = await api.compress(env, c.source, { level: this.#level });
    c.destination = toOwnedBytes(buffer);

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const buffer = await api.decompress(env, c.source);
    c.destination = toOwnedBytes(buffer);

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const compress = api.createCompress(env, { level: this.#level });
    const transform = toOwnedBytesTransformStream(compress);
    c.destination = c.source.pipeThrough(transform);

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    const env = this.#env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const decompress = api.createDecompress(env);
    const transform = toOwnedBytesTransformStream(decompress);
    c.destination = c.source.pipeThrough(transform);

    await next();
  }
}
