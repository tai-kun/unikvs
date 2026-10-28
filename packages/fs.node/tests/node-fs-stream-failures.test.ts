import type { promises, createReadStream, createWriteStream } from "node:fs";

import type { IStorage } from "@unikvs/core";
import { createHasContext, createSetContext } from "@unikvs/testing";
import { listTemporaryFiles } from "@unikvs/testing/node";
import { vi, describe, afterEach } from "vite-plus/test";

import { test } from "./_helpers.js";

/**
 * 書き込みストリームへ注入する故障の種類です。
 *
 * - `write`: チャンクの書き込み時に ENOSPC で失敗します。
 * - `final`: close 時の flush で ENOSPC で失敗します。
 */
type Failure = "write" | "final";

/**
 * モックファクトリーから参照する故障の設定です。
 */
const injection = vi.hoisted(() => ({
  failure: undefined as Failure | undefined,
}));

/**
 * テストで差し替える `node:fs` の一部です。
 */
type NodeFsModule = {
  readonly promises: typeof promises;
  readonly createReadStream: typeof createReadStream;
  readonly createWriteStream: typeof createWriteStream;
};

/**
 * ストリームの書き込みフックです。
 */
type WriteHook = (
  chunk: unknown,
  encoding: unknown,
  callback: (error?: Error | null) => void,
) => void;

/**
 * ENOSPC を表すエラーを作成します。
 *
 * @returns `code` に `ENOSPC` を持つエラーです。
 */
function createNoSpaceError(): Error {
  return Object.assign(new Error("ENOSPC: no space left on device, write"), {
    code: "ENOSPC",
  });
}

// 実際のファイルを作る本物のストリームに、書き込み・flush の失敗だけを注入します。
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<NodeFsModule>();

  return {
    ...actual,
    createWriteStream: ((...args: Parameters<typeof actual.createWriteStream>) => {
      const stream = actual.createWriteStream(...args);
      const failure = injection.failure;

      if (failure === "write") {
        (stream as unknown as { _write: WriteHook })._write = (
          _chunk: unknown,
          _encoding: unknown,
          callback: (error?: Error | null) => void,
        ): void => {
          callback(createNoSpaceError());
        };
      } else if (failure === "final") {
        (
          stream as unknown as {
            _final: (callback: (error?: Error | null) => void) => void;
          }
        )._final = (callback: (error?: Error | null) => void): void => {
          callback(createNoSpaceError());
        };
      }

      return stream;
    }) as typeof actual.createWriteStream,
  };
});

describe("ストリーム書き込みの I/O エラー", () => {
  afterEach(() => {
    injection.failure = undefined;
  });

  test("write が ENOSPC で失敗したとき、一時ファイルが残らない", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    injection.failure = "write";
    const key = "write-enospc.bin";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行と検証：
    await expect(writer.write(new Uint8Array(1024 * 1024))).rejects.toMatchObject({
      code: "ENOSPC",
    });
    expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);

    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("close 時の flush が ENOSPC で失敗したとき、一時ファイルが残らない", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    injection.failure = "final";
    const key = "close-enospc.bin";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行と検証：
    await expect(writer.close()).rejects.toMatchObject({
      code: "ENOSPC",
    });
    expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);

    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });
});
