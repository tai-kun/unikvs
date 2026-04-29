import type { Context, IReadableStream, IStorage, IWritableStream } from "@unikvs/core";

import * as v from "./_valibot.js";
import {
  type PluginOperationAggregateError,
  ReadableStreamNotSupportedError,
  StorageIsNotOpenError,
  WritableStreamNotSupportedError,
} from "./errors.js";

export default class UniKvsStorage {
  private readonly io: IStorage;

  public constructor(io: IStorage) {
    this.io = io;
  }

  public async open(context: Context, signal: AbortSignal): Promise<void> {
    if (typeof this.io.open !== "function") {
      return;
    }

    if (!this.io.isOpen) {
      await this.io.open({ signal, context });
    }
  }

  public async close(context: Context, signal: AbortSignal): Promise<void> {
    if (typeof this.io.close !== "function") {
      return;
    }

    if (this.io.isOpen) {
      await this.io.close({ signal, context });
    }
  }

  public async onOtherWriteError(
    context: Context,
    signal: AbortSignal,
    key: IStorage.Key,
    error: PluginOperationAggregateError,
  ): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.onOtherWriteError !== "function") {
      return;
    }

    await this.io.onOtherWriteError({
      key,
      error: error as any,
      signal,
      context,
    });
  }

  public async write(
    context: Context,
    signal: AbortSignal,
    key: IStorage.Key,
    data: unknown,
  ): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.write({ key, data, signal, context });
  }

  public async read(context: Context, signal: AbortSignal, key: IStorage.Key): Promise<unknown> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    const output = await this.io.read({ key, signal, context });

    return output;
  }

  public async exists(context: Context, signal: AbortSignal, key: IStorage.Key): Promise<boolean> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    const output = await this.io.exists({ key, signal, context });
    const parsed = Boolean(output);

    return parsed;
  }

  public async delete(context: Context, signal: AbortSignal, key: IStorage.Key): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.delete({ key, signal, context });
  }

  public async clear(context: Context, signal: AbortSignal): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.clear({ signal, context });
  }

  public async getWritable(
    context: Context,
    signal: AbortSignal,
    key: IStorage.Key,
  ): Promise<IWritableStream> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.getWritable !== "function") {
      throw new WritableStreamNotSupportedError({ name: this.io.name });
    }

    const output = await this.io.getWritable({ key, signal, context });
    const parsed = v.parseOutput(v.instance(WritableStream), output);

    return parsed;
  }

  public async getReadable(
    context: Context,
    signal: AbortSignal,
    key: IStorage.Key,
  ): Promise<IReadableStream> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.getReadable !== "function") {
      throw new ReadableStreamNotSupportedError({ name: this.io.name });
    }

    const output = await this.io.getReadable({ key, signal, context });
    const parsed = v.parseOutput(v.instance(ReadableStream), output);

    return parsed;
  }
}
