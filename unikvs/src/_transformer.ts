import type { Variables, IDecodable, IEncodable, ITransformer } from "@unikvs/core";

import { isReadableStream, isWritableStream } from "./_streams.js";
import * as v from "./_valibot.js";
import {
  DecodableStreamNotSupportedError,
  EncodableStreamNotSupportedError,
  TransformerIsNotOpenError,
} from "./errors.js";

/**
 * 値が `TransformStream` 互換、つまり `readable` と `writable` を持つかどうかを判定します。
 *
 * クロスレルムでも機能するよう、`instanceof` ではなく `isReadableStream` と `isWritableStream` による構造判定に委譲します。
 *
 * @param input 判定する値です。
 * @returns `TransformStream` 互換の場合は `true` を返します。
 */
function isTransformStream(input: unknown): input is IEncodable & IDecodable {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const stream = input as Partial<IEncodable & IDecodable>;

  return isReadableStream(stream.readable) && isWritableStream(stream.writable);
}

/**
 * `getEncodable` の戻り値が `TransformStream` 互換かを検証するためのスキーマです。
 */
const EncodableSchema = v.custom<IEncodable>(
  isTransformStream,
  "Expected a transform stream compatible value",
);

/**
 * `getDecodable` の戻り値が `TransformStream` 互換かを検証するためのスキーマです。
 */
const DecodableSchema = v.custom<IDecodable>(
  isTransformStream,
  "Expected a transform stream compatible value",
);

/**
 * 同じオブジェクトに対して同じ UniKvsTransformer インスタンスを返すためのメモです。
 */
const memoizedMap = /*#__PURE__*/ new WeakMap<ITransformer, UniKvsTransformer>();

export default class UniKvsTransformer {
  public static from(transformer: ITransformer): UniKvsTransformer {
    let memoized = memoizedMap.get(transformer);
    if (!memoized) {
      memoized = new UniKvsTransformer(transformer);
      memoizedMap.set(transformer, memoized);
    }

    return memoized;
  }

  private readonly tf: ITransformer;

  private managed: boolean;

  public constructor(tf: ITransformer) {
    this.tf = tf;
    this.managed = false;
  }

  public get name(): string {
    return this.tf.name;
  }

  public async open(vars: Variables, signal: AbortSignal): Promise<void> {
    if (typeof this.tf.open !== "function") {
      return;
    }

    if (!this.tf.isOpen) {
      this.managed = true;
      await this.tf.open({ vars, signal });
    }
  }

  public async close(vars: Variables, signal: AbortSignal): Promise<void> {
    if (typeof this.tf.close !== "function") {
      return;
    }

    if (this.tf.isOpen && this.managed) {
      await this.tf.close({ vars, signal });
    }
  }

  public async encode(vars: Variables, signal: AbortSignal, data: any): Promise<unknown> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    const output = await this.tf.encode({ data, vars, signal });

    return output;
  }

  public async decode(vars: Variables, signal: AbortSignal, data: any): Promise<unknown> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    const output = await this.tf.decode({ data, vars, signal });

    return output;
  }

  public async getEncodable(vars: Variables, signal: AbortSignal): Promise<IEncodable> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.getEncodable !== "function") {
      throw new EncodableStreamNotSupportedError({ name: this.tf.name });
    }

    const output = await this.tf.getEncodable({ vars, signal });
    const parsed = v.parseOutput(EncodableSchema, output);

    return parsed;
  }

  public async getDecodable(vars: Variables, signal: AbortSignal): Promise<IDecodable> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.getDecodable !== "function") {
      throw new DecodableStreamNotSupportedError({ name: this.tf.name });
    }

    const output = await this.tf.getDecodable({ vars, signal });
    const parsed = v.parseOutput(DecodableSchema, output);

    return parsed;
  }

  public async mapKey(vars: Variables, signal: AbortSignal, key: string): Promise<string> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.mapKey !== "function") {
      return key;
    }

    return await this.tf.mapKey({ key, vars, signal });
  }

  public async onExists(vars: Variables, signal: AbortSignal, key: string): Promise<void> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.onExists !== "function") {
      return;
    }

    await this.tf.onExists({ key, vars, signal });
  }

  public async onDelete(vars: Variables, signal: AbortSignal, key: string): Promise<void> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.onDelete !== "function") {
      return;
    }

    await this.tf.onDelete({ key, vars, signal });
  }

  public async onClear(vars: Variables, signal: AbortSignal): Promise<void> {
    if (!this.tf.isOpen) {
      throw new TransformerIsNotOpenError({ name: this.tf.name });
    }

    if (typeof this.tf.onClear !== "function") {
      return;
    }

    await this.tf.onClear({ vars, signal });
  }
}
