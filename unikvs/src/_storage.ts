import type {
  IStorage,
  IReadableStream,
  IWritableStream,
} from "@unikvs/core";

import { isReadableStream, isWritableStream } from "./_streams.js";
import * as v from "./_valibot.js";
import {
  type PluginOperationAggregateError,
  StorageIsNotOpenError,
  ReadableStreamNotSupportedError,
  WritableStreamNotSupportedError,
} from "./errors.js";

/**
 * `ReadableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
const ReadableStreamSchema = v.custom<IReadableStream>(
  isReadableStream,
  "Expected a ReadableStream",
);

/**
 * `WritableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
const WritableStreamSchema = v.custom<IWritableStream>(
  isWritableStream,
  "Expected a WritableStream",
);

/**
 * 同じオブジェクトに対して同じ UniKvsStorage インスタンスを返すためのメモです。
 */
const memoizedMap = /*#__PURE__*/ new WeakMap<IStorage, UniKvsStorage>();

export default class UniKvsStorage {
  public static from(storage: IStorage): UniKvsStorage {
    let memoized = memoizedMap.get(storage);
    if (!memoized) {
      memoized = new UniKvsStorage(storage);
      memoizedMap.set(storage, memoized);
    }

    return memoized;
  }

  private readonly io: IStorage;

  private managed: boolean;

  public constructor(io: IStorage) {
    this.io = io;
    this.managed = false;
  }

  public get name(): string {
    return this.io.name;
  }

  public get raw(): IStorage {
    return this.io;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    if (typeof this.io.open !== "function") {
      return;
    }

    if (!this.io.isOpen) {
      this.managed = true;
      await this.io.open(c);
    }
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    if (typeof this.io.close !== "function") {
      return;
    }

    if (this.io.isOpen && this.managed) {
      await this.io.close(c);
    }
  }

  public async write(c: IStorage.WriteContext, data: unknown): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.write(c, data);
  }

  public async read(c: IStorage.ReadContext): Promise<unknown> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    const output = await this.io.read(c);

    return output;
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    const output = await this.io.exists(c);
    const parsed = Boolean(output);

    return parsed;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.delete(c);
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.clear(c);
  }

  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<IReadableStream> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.getReadable !== "function") {
      throw new ReadableStreamNotSupportedError({ name: this.io.name });
    }

    const output = await this.io.getReadable(c);
    const parsed = v.parseOutput(ReadableStreamSchema, output);

    return parsed;
  }

  public async getWritable(
    c: IStorage.GetWritableContext,
  ): Promise<IWritableStream> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.getWritable !== "function") {
      throw new WritableStreamNotSupportedError({ name: this.io.name });
    }

    const output = await this.io.getWritable(c);
    const parsed = v.parseOutput(WritableStreamSchema, output);

    return parsed;
  }

  public async onOtherWriteError(
    c: IStorage.OtherWriteErrorHandlerContext,
    err: PluginOperationAggregateError,
  ): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.onOtherWriteError !== "function") {
      return;
    }

    await this.io.onOtherWriteError(c, [
      {
        plugin: "storage",
        errors: (err.meta.errors as readonly {
          readonly plugin: "storage";
          readonly reason: unknown;
        }[]).map((error) => ({
          plugin: "storage" as const,
          reason: error.reason,
        })),
      },
    ]);
  }
}
