import type {
  Variables,
  IStorage,
  ErrorBase,
  IReadableStream,
  IWritableStream,
} from "@unikvs/core";

import * as v from "./_valibot.js";
import {
  type PluginOperationAggregateError,
  StorageIsNotOpenError,
  ReadableStreamNotSupportedError,
  WritableStreamNotSupportedError,
} from "./errors.js";

export default class UniKvsStorage {
  private readonly io: IStorage;

  private managed: boolean;

  public constructor(io: IStorage) {
    this.io = io;
    this.managed = false;
  }

  public async open(vars: Variables, signal: AbortSignal): Promise<void> {
    if (typeof this.io.open !== "function") {
      return;
    }

    if (!this.io.isOpen) {
      this.managed = true;
      await this.io.open({ vars, signal });
    }
  }

  public async close(vars: Variables, signal: AbortSignal): Promise<void> {
    if (typeof this.io.close !== "function") {
      return;
    }

    if (this.io.isOpen && this.managed) {
      await this.io.close({ vars, signal });
    }
  }

  public async write(
    vars: Variables,
    signal: AbortSignal,
    key: IStorage.Key,
    data: unknown,
  ): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.write({ key, data, vars, signal });
  }

  public async read(vars: Variables, signal: AbortSignal, key: IStorage.Key): Promise<unknown> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    const output = await this.io.read({ key, vars, signal });

    return output;
  }

  public async exists(vars: Variables, signal: AbortSignal, key: IStorage.Key): Promise<boolean> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    const output = await this.io.exists({ key, vars, signal });
    const parsed = Boolean(output);

    return parsed;
  }

  public async delete(vars: Variables, signal: AbortSignal, key: IStorage.Key): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.delete({ key, vars, signal });
  }

  public async clear(vars: Variables, signal: AbortSignal): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    await this.io.clear({ vars, signal });
  }

  public async getReadable(
    vars: Variables,
    signal: AbortSignal,
    key: IStorage.Key,
  ): Promise<IReadableStream> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.getReadable !== "function") {
      throw new ReadableStreamNotSupportedError({ name: this.io.name });
    }

    const output = await this.io.getReadable({ key, vars, signal });
    const parsed = v.parseOutput(v.instance(ReadableStream), output);

    return parsed;
  }

  public async getWritable(
    vars: Variables,
    signal: AbortSignal,
    key: IStorage.Key,
  ): Promise<IWritableStream> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.getWritable !== "function") {
      throw new WritableStreamNotSupportedError({ name: this.io.name });
    }

    const output = await this.io.getWritable({ key, vars, signal });
    const parsed = v.parseOutput(v.instance(WritableStream), output);

    return parsed;
  }

  public async onOtherWriteError(
    vars: Variables,
    signal: AbortSignal,
    key: IStorage.Key,
    err: PluginOperationAggregateError,
  ): Promise<void> {
    if (!this.io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.io.name });
    }

    if (typeof this.io.onOtherWriteError !== "function") {
      return;
    }

    await this.io.onOtherWriteError({
      key,
      error: err as ErrorBase<{
        readonly plugin: "storage";
        readonly action: "write";
        readonly errors: readonly {
          readonly plugin: "storage";
          readonly reason: unknown;
        }[];
      }>,
      signal,
      vars,
    });
  }
}
