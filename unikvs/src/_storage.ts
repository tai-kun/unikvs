import type { Context, IReadableStream, IStorage, IWritableStream, Key } from "@unikvs/core";

import {
  type PluginOperationAggregateError,
  ReadableStreamNotSupportedError,
  StorageIsNotOpenError,
  WritableStreamNotSupportedError,
} from "./errors.js";

export class UniKvsStorage {
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
    key: Key,
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

  public async write(context: Context, signal: AbortSignal, key: Key, data: any): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.write({ key, data, signal, context });
  }

  public async read(context: Context, signal: AbortSignal, key: Key): Promise<any> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    return await this.io.read({ key, signal, context });
  }

  public async exists(context: Context, signal: AbortSignal, key: Key): Promise<boolean> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    return await this.io.exists({ key, signal, context });
  }

  public async delete(context: Context, signal: AbortSignal, key: Key): Promise<void> {
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
    key: Key,
  ): Promise<IWritableStream> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.getWritable !== "function") {
      throw new WritableStreamNotSupportedError({ name: this.io.name });
    }

    return await this.io.getWritable({ key, signal, context });
  }

  public async getReadable(
    context: Context,
    signal: AbortSignal,
    key: Key,
  ): Promise<IReadableStream> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.getReadable !== "function") {
      throw new ReadableStreamNotSupportedError({ name: this.io.name });
    }

    return await this.io.getReadable({ key, signal, context });
  }
}
