import type { Context, IStorage } from "@unikvs/core";
import { describe, test, vi } from "vitest";

import UniKvsStorage from "../src/_storage.js";
import {
  StorageIsNotOpenError,
  PluginOperationAggregateError,
  ReadableStreamNotSupportedError,
  WritableStreamNotSupportedError,
} from "../src/errors.js";

class PromiseLike<T = void> implements globalThis.PromiseLike<T> {
  private readonly value: T;

  public constructor(value: T = undefined as T) {
    this.value = value;
  }

  // oxlint-disable-next-line unicorn/no-thenable
  then(onfulfilled?: any): any {
    onfulfilled?.(this.value);
    return this;
  }
}

describe("ライフサイクル管理", () => {
  test("io.open が未定義のとき、例外を投げずに正常終了する", async ({ expect, signal }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.open(context, signal)).resolves.not.toThrow();
  });

  test("io.isOpen が true のとき、io.open を呼び出さずに正常終了する", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const open = vi.fn<() => void>();
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      open,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    await storage.open(context, signal);

    // Assert
    expect(open).not.toHaveBeenCalled();
  });

  test("io.open が PromiseLike を返すとき、その完了を待機する", async ({ expect, signal }) => {
    // Arrange
    const context: Context = {};
    const openPromise = new PromiseLike();
    const thenSpy = vi.spyOn(openPromise, "then");
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      open() {
        return openPromise;
      },
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    await storage.open(context, signal);

    // Assert
    expect(thenSpy).toHaveBeenCalled();
  });

  test("io.isOpen が false のとき、storage.open を呼び出すと、storage.close 時に io.close を呼び出す", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const open = vi.fn<() => void>(() => {
      // @ts-expect-error
      io.isOpen = true;
    });
    const close = vi.fn<() => void>();
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      open,
      close,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    await storage.open(context, signal);
    await storage.close(context, signal);

    // Assert
    expect(open).toHaveBeenCalledWith({ context, signal });
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("io.isOpen が true のとき、storage.open を呼び出すと、storage.close 時に io.close を呼び出さない", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const open = vi.fn<() => void>();
    const close = vi.fn<() => void>();
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      open,
      close,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    await storage.open(context, signal);
    await storage.close(context, signal);

    // Assert
    expect(open).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  test("io.close が未定義のとき、例外を投げずに正常終了する", async ({ expect, signal }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.close(context, signal)).resolves.not.toThrow();
  });
});

describe("基本データ操作", () => {
  test("ストレージが未オープンのとき、write を呼び出すと StorageIsNotOpenError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.write(context, signal, "test-key", { foo: "bar" })).rejects.toThrow(
      StorageIsNotOpenError,
    );
  });

  test("ストレージがオープンしているとき、write を呼び出すと io.write が呼び出される", async ({
    expect,
    signal,
  }) => {
    // Arrange: io.isOpen = true の状態。
    const context: Context = {};
    const write = vi.fn<() => void>();
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write,
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    await storage.write(context, signal, "test-key", { foo: "bar" });

    // Assert
    expect(write).toHaveBeenCalledWith({
      key: "test-key",
      data: {
        foo: "bar",
      },
      signal,
      context,
    });
  });

  test("ストレージが未オープンのとき、read を呼び出すと StorageIsNotOpenError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.read(context, signal, "test-key")).rejects.toThrow(StorageIsNotOpenError);
  });

  test("ストレージがオープンしているとき、read を呼び出すと取得されたデータがそのまま返却される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const expectedData = { foo: "bar" };
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read: async (options) => {
        if (options.key === "test-key") {
          return expectedData;
        }

        return undefined;
      },
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    const result = await storage.read(context, signal, "test-key");

    // Assert
    expect(result).toStrictEqual(expectedData);
  });

  test("ストレージが未オープンのとき、exists を呼び出すと StorageIsNotOpenError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.exists(context, signal, "test-key")).rejects.toThrow(
      StorageIsNotOpenError,
    );
  });

  test("ストレージがオープンしているとき、io.exists が真値を返すと、exists は true を返す", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return 1 as unknown as boolean;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    const result = await storage.exists(context, signal, "test-key");

    // Assert
    expect(result).toBe(true);
  });

  test("ストレージがオープンしているとき、io.exists が偽値を返すと、exists は false を返す", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return 0 as unknown as boolean;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    const result = await storage.exists(context, signal, "test-key");

    // Assert
    expect(result).toBe(false);
  });

  test("ストレージが未オープンのとき、delete を呼び出すと StorageIsNotOpenError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.delete(context, signal, "test-key")).rejects.toThrow(
      StorageIsNotOpenError,
    );
  });

  test("ストレージがオープンしているとき、delete を呼び出すと io.delete が呼び出される", async ({
    expect,
    signal,
  }) => {
    // Arrange: io.isOpen = true の状態。
    const context: Context = {};
    const deleteMock = vi.fn<() => void>();
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete: deleteMock,
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act
    await storage.delete(context, signal, "test-key");

    // Assert
    expect(deleteMock).toHaveBeenCalledWith({
      key: "test-key",
      signal,
      context,
    });
  });

  test("ストレージが未オープンのとき、clear を呼び出すと StorageIsNotOpenError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.clear(context, signal)).rejects.toThrow(StorageIsNotOpenError);
  });

  test("ストレージがオープンしているとき、clear を呼び出すと io.clear が呼び出される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const clear = vi.fn<() => void>();
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear,
    };
    const storage = new UniKvsStorage(io);

    // Act
    await storage.clear(context, signal);

    // Assert
    expect(clear).toHaveBeenCalledWith({ signal, context });
  });
});

describe("ストリーム操作", () => {
  test("ストレージが未オープンのとき、getReadable を呼び出すと StorageIsNotOpenError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.getReadable(context, signal, "stream-key")).rejects.toThrow(
      StorageIsNotOpenError,
    );
  });

  test("io.getReadable が未定義のとき、getReadable を呼び出すと ReadableStreamNotSupportedError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.getReadable(context, signal, "stream-key")).rejects.toThrow(
      ReadableStreamNotSupportedError,
    );
  });

  test("io.getReadable が有効な ReadableStream を返すとき、getReadable はそのオブジェクトを返す", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const stream = new ReadableStream();
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
      getReadable: async () => stream,
    };
    const storage = new UniKvsStorage(io);

    // Act
    const result = await storage.getReadable(context, signal, "stream-key");

    // Assert
    expect(result).toBe(stream);
  });

  test("io.getReadable が ReadableStream 以外の値を返すとき、getReadable は検証エラーを投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
      getReadable: async () => "invalid-stream" as unknown as ReadableStream,
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.getReadable(context, signal, "stream-key")).rejects.toThrow();
  });

  test("ストレージが未オープンのとき、getWritable を呼び出すと StorageIsNotOpenError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.getWritable(context, signal, "stream-key")).rejects.toThrow(
      StorageIsNotOpenError,
    );
  });

  test("io.getWritable が未定義のとき、getWritable を呼び出すと WritableStreamNotSupportedError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.getWritable(context, signal, "stream-key")).rejects.toThrow(
      WritableStreamNotSupportedError,
    );
  });

  test("io.getWritable が有効な WritableStream を返すとき、getWritable はそのオブジェクトを返す", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const stream = new WritableStream();

    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
      getWritable: async () => stream,
    };
    const storage = new UniKvsStorage(io);

    // Act
    const result = await storage.getWritable(context, signal, "stream-key");

    // Assert
    expect(result).toBe(stream);
  });

  test("io.getWritable が WritableStream 以外の値を返すとき、getWritable は検証エラーを投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};

    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
      getWritable: async () => "invalid-stream" as unknown as WritableStream,
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.getWritable(context, signal, "stream-key")).rejects.toThrow();
  });
});

describe("エラーハンドリング", () => {
  test("ストレージが未オープンのとき、onOtherWriteError を呼び出すと StorageIsNotOpenError を投げる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const err = new PluginOperationAggregateError({ action: "write", errors: [] });
    const io: IStorage = {
      name: "TestStorage",
      isOpen: false,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(storage.onOtherWriteError(context, signal, "error-key", err)).rejects.toThrow(
      StorageIsNotOpenError,
    );
  });

  test("io.onOtherWriteError が未定義のとき、onOtherWriteError を呼び出すと早期リターンして正常終了する", async ({
    expect,
    signal,
  }) => {
    // Arrange: io.onOtherWriteError が存在しない io を準備する。
    const context: Context = {};
    const err = new PluginOperationAggregateError({ action: "write", errors: [] });
    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
    };
    const storage = new UniKvsStorage(io);

    // Act & Assert
    await expect(
      storage.onOtherWriteError(context, signal, "error-key", err),
    ).resolves.not.toThrow();
  });

  test("ストレージがオープンしているとき、onOtherWriteError を呼び出すと io.onOtherWriteError が適切な引数で呼び出される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const context: Context = {};
    const err = new PluginOperationAggregateError({ action: "write", errors: [] });
    const calls: Array<{
      key: string;
      error: PluginOperationAggregateError;
      context: Context;
      signal: AbortSignal;
    }> = [];

    const io: IStorage = {
      name: "TestStorage",
      isOpen: true,
      write() {},
      read() {},
      exists() {
        return false;
      },
      delete() {},
      clear() {},
      onOtherWriteError: async (options) => {
        calls.push({
          key: options.key,
          error: options.error,
          context: options.context,
          signal: options.signal,
        });
      },
    };
    const storage = new UniKvsStorage(io);

    // Act
    await storage.onOtherWriteError(context, signal, "error-key", err);

    // Assert
    expect(calls).toStrictEqual([{ key: "error-key", error: err, context, signal }]);
  });
});
