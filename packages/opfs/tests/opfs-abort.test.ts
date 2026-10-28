import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import Opfs from "../src/opfs.js";
import { test, uniqueRoot } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * ルート削除直後に中断を発火させるディレクトリーハンドルを作ります。
 * clear の破壊フェーズ後、再作成前のタイミングを決定的に再現するために使用します。
 *
 * @param opfsRoot OPFS のルートディレクトリーハンドルです。
 * @param parentSegments ルートディレクトリーの親までの構成要素です。
 * @param onRemoved ルート削除後に呼ぶ関数です。
 *
 * @returns ルート削除を監視するディレクトリーハンドルです。
 */
function createAbortingRoot(
  opfsRoot: FileSystemDirectoryHandle,
  parentSegments: readonly string[],
  onRemoved: () => void,
): FileSystemDirectoryHandle {
  const wrap = (handle: FileSystemDirectoryHandle, depth: number): FileSystemDirectoryHandle =>
    new Proxy(handle, {
      get(target, property): unknown {
        if (property === "removeEntry" && depth === parentSegments.length) {
          return async (name: string, options?: FileSystemRemoveOptions): Promise<void> => {
            await target.removeEntry(name, options);
            onRemoved();
          };
        }

        if (property === "getDirectoryHandle" && depth < parentSegments.length) {
          return async (
            name: string,
            options?: FileSystemGetDirectoryOptions,
          ): Promise<FileSystemDirectoryHandle> => {
            const child = await target.getDirectoryHandle(name, options);

            return name === parentSegments[depth] ? wrap(child, depth + 1) : child;
          };
        }

        const value: unknown = Reflect.get(target, property, target);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  return wrap(opfsRoot, 0);
}

/**
 * プロパティーを元の定義に戻します。
 * 独自プロパティーを定義した場合は削除し、元からあった場合は元の記述子で再定義するために使用します。
 *
 * @param target 対象のオブジェクトです。
 * @param property 戻すプロパティー名です。
 * @param descriptor 元のプロパティー記述子です。元から存在しなかった場合は undefined です。
 */
function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, property);
  } else {
    Object.defineProperty(target, property, descriptor);
  }
}

describe("AbortSignal による中断", () => {
  test("中断済みの signal はすべてのメソッドを中断理由で拒否する", async ({ expect, storage }) => {
    // 準備：
    const key = "pre-aborted.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    const controller = new AbortController();
    const reason = new Error("独自の中断理由");
    controller.abort(reason);

    const abortedSignal = controller.signal;

    // 実行と検証：
    await expect(
      storage.open(createOpenContext({ signal: abortedSignal }) as IStorage.OpenContext),
    ).rejects.toBe(reason);
    await expect(
      storage.write(
        createSetContext(key, { signal: abortedSignal }) as IStorage.WriteContext,
        new Uint8Array([2]),
      ),
    ).rejects.toBe(reason);
    await expect(
      storage.read(createGetContext(key, { signal: abortedSignal }) as IStorage.ReadContext),
    ).rejects.toBe(reason);
    await expect(
      storage.exists(createHasContext(key, { signal: abortedSignal }) as IStorage.ExistsContext),
    ).rejects.toBe(reason);
    await expect(
      storage.delete(createDeleteContext(key, { signal: abortedSignal }) as IStorage.DeleteContext),
    ).rejects.toBe(reason);
    await expect(
      storage.clear(createClearContext("", { signal: abortedSignal }) as IStorage.ClearContext),
    ).rejects.toBe(reason);
    await expect(
      storage.getWritable(
        createSetContext(key, { signal: abortedSignal }) as IStorage.GetWritableContext,
      ),
    ).rejects.toBe(reason);
    await expect(
      storage.getReadable(
        createStreamContext(key, { signal: abortedSignal }) as IStorage.GetReadableContext,
      ),
    ).rejects.toBe(reason);
  });

  test("実行中に中断された open は未オープンのままにする", async ({ expect }) => {
    // 準備：
    const fresh = new Opfs(uniqueRoot());
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行：
    const opening = fresh.open(
      createOpenContext({ signal: controller.signal }) as IStorage.OpenContext,
    );
    controller.abort(reason);

    // 検証：
    await expect(opening).rejects.toBe(reason);
    expect(fresh.isOpen).toBe(false);
  });

  test("実行中に中断された read は中断理由で拒否される", async ({ expect, storage }) => {
    // 準備：
    const key = "aborted-read.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行：
    const reading = storage.read(
      createGetContext(key, { signal: controller.signal }) as IStorage.ReadContext,
    );
    controller.abort(reason);

    // 検証：
    await expect(reading).rejects.toBe(reason);
  });

  test("書き込みストリームを signal で中断したとき、変更が破棄される", async ({
    expect,
    storage,
  }) => {
    // 準備：
    const key = "aborted-writable.bin";
    const original = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);

    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const writable = await storage.getWritable(
      createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
    );
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([9, 9]));

    // 実行：
    controller.abort(reason);

    // 検証：
    await expect(writer.close()).rejects.toBe(reason);

    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(original);
  });

  test("読み取りストリームを signal で中断したとき、読み取りが中断理由で失敗する", async ({
    expect,
    storage,
  }) => {
    // 準備：
    const key = "aborted-readable.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array(256 * 1024).fill(7),
    );

    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const readable = await storage.getReadable(
      createStreamContext(key, { signal: controller.signal }) as IStorage.GetReadableContext,
    );
    const reader = readable.getReader();

    // 実行：
    controller.abort(reason);

    // 検証：
    await expect(reader.read()).rejects.toBe(reason);
  });

  test("clear のルート削除後に中断されても、インスタンスは再利用できる", async ({
    root,
    expect,
  }) => {
    // 準備：
    const storage = new Opfs(root);
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    const key = "after-aborted-clear.bin";
    const removedKey = "removed-by-aborted-clear.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext(removedKey, { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    const segments = root.split("/");
    const rootDirname = segments.at(-1);

    // oxlint-disable-next-line vitest/no-conditional-in-test -- テストの前提条件を確認するために使用します。
    if (rootDirname === undefined) {
      throw new Error("ルート名を取得できませんでした。");
    }

    const parentSegments = segments.slice(0, -1);
    const opfsRoot = await navigator.storage.getDirectory();
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const rootProxy = createAbortingRoot(opfsRoot, parentSegments, (): void => {
      controller.abort(reason);
    });
    const storageManager = navigator.storage;
    const originalDescriptor = Object.getOwnPropertyDescriptor(storageManager, "getDirectory");
    Object.defineProperty(storageManager, "getDirectory", {
      value: async (): Promise<FileSystemDirectoryHandle> => rootProxy,
      configurable: true,
    });

    try {
      // 実行：
      await expect(
        storage.clear(
          createClearContext("", { signal: controller.signal }) as IStorage.ClearContext,
        ),
      ).rejects.toBe(reason);
    } finally {
      restoreProperty(storageManager, "getDirectory", originalDescriptor);
    }

    // 検証：
    expect(storage.isOpen).toBe(true);
    expect(
      await storage.exists(createHasContext(removedKey, { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );

    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([2]));
  });
});
