import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { StorageAbortedError } from "../src/errors.js";
import S3 from "../src/s3.js";
import { createClientConfig, createDelayedProxy, test } from "./_helpers.js";

/**
 * 転送を遅延させるプロキシーを起動してコールバックを実行し、終了後に確実に閉じます。
 * 実行中のリクエストを中断する検証を決定的にするために使用します。
 */
async function withDelayedProxy<T>(
  endpoint: string,
  run: (proxyEndpoint: string) => Promise<T>,
): Promise<T> {
  const proxy = await createDelayedProxy(Number(new URL(endpoint).port), 400);

  try {
    return await run(proxy.endpoint);
  } finally {
    await proxy.close();
  }
}

/**
 * リクエストの送信から 60ms 後に中断する AbortController を作成します。
 * 遅延プロキシー経由のリクエストが完了する前に確実に中断するために使用します。
 */
function abortAfter(ms: number): AbortController {
  const controller = new AbortController();

  setTimeout(() => {
    controller.abort();
  }, ms);

  return controller;
}

describe("AbortSignal による中断", () => {
  test("事前に中断された signal は単発操作をすべて AbortError で拒否する", async ({
    expect,
    storage,
  }) => {
    // 準備
    storage.open(createOpenContext() as IStorage.OpenContext);
    const controller = new AbortController();
    controller.abort(new Error("独自の中断理由"));
    const { signal } = controller;

    // 実行と検証
    await expect(
      storage.write(
        createSetContext("pre-aborted.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      storage.read(createGetContext("pre-aborted.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(
      storage.exists(createHasContext("pre-aborted.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(
      storage.delete(createDeleteContext("pre-aborted.bin", { signal }) as IStorage.DeleteContext),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      storage.getReadable(
        createStreamContext("pre-aborted.bin", { signal }) as IStorage.GetReadableContext,
      ),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  test("事前に中断された signal の getWritable は StorageAbortedError を投げる", ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "pre-aborted-writable.bin";
    storage.open(createOpenContext() as IStorage.OpenContext);
    const controller = new AbortController();
    controller.abort();
    let caught: unknown;

    // 実行
    try {
      storage.getWritable(
        createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
      );
    } catch (error) {
      caught = error;
    }

    // 検証
    expect(caught).toBeInstanceOf(StorageAbortedError);
    expect((caught as StorageAbortedError).meta).toStrictEqual({ key });
  });

  test("実行中に中断された単発操作は AbortError で拒否される", async ({
    bucket,
    endpoint,
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const targetKey = "in-flight-target.bin";
    storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(
      createSetContext(targetKey, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    await withDelayedProxy(endpoint, async (proxyEndpoint) => {
      const proxyStorage = new S3(bucket, createClientConfig(proxyEndpoint));
      proxyStorage.open(createOpenContext() as IStorage.OpenContext);

      try {
        // 実行と検証
        const cases: ((abortSignal: AbortSignal) => Promise<unknown>)[] = [
          (abortSignal) =>
            proxyStorage.write(
              createSetContext("in-flight-write.bin", {
                signal: abortSignal,
              }) as IStorage.WriteContext,
              new Uint8Array([2]),
            ),
          (abortSignal) =>
            proxyStorage.read(
              createGetContext(targetKey, { signal: abortSignal }) as IStorage.ReadContext,
            ),
          (abortSignal) =>
            proxyStorage.exists(
              createHasContext(targetKey, { signal: abortSignal }) as IStorage.ExistsContext,
            ),
          (abortSignal) =>
            proxyStorage.delete(
              createDeleteContext(targetKey, { signal: abortSignal }) as IStorage.DeleteContext,
            ),
          (abortSignal) =>
            proxyStorage.clear(
              createClearContext("", { signal: abortSignal }) as IStorage.ClearContext,
            ),
        ];

        for (const run of cases) {
          const controller = abortAfter(60);
          await expect(run(controller.signal)).rejects.toMatchObject({
            name: "AbortError",
          });
        }
      } finally {
        proxyStorage.close(createCloseContext() as IStorage.CloseContext);
      }
    });
  });

  test("実行中に中断しても同じインスタンスで次の操作が成功する", async ({
    bucket,
    endpoint,
    expect,
    signal,
    storage,
  }) => {
    // 準備
    storage.open(createOpenContext() as IStorage.OpenContext);

    await withDelayedProxy(endpoint, async (proxyEndpoint) => {
      const proxyStorage = new S3(bucket, createClientConfig(proxyEndpoint));
      proxyStorage.open(createOpenContext() as IStorage.OpenContext);

      try {
        const controller = abortAfter(60);
        await expect(
          proxyStorage.write(
            createSetContext("first-attempt.bin", {
              signal: controller.signal,
            }) as IStorage.WriteContext,
            new Uint8Array([1]),
          ),
        ).rejects.toMatchObject({ name: "AbortError" });

        // 実行
        await proxyStorage.write(
          createSetContext("second-attempt.bin", { signal }) as IStorage.WriteContext,
          new Uint8Array([2]),
        );
        const result = await proxyStorage.read(
          createGetContext("second-attempt.bin", { signal }) as IStorage.ReadContext,
        );

        // 検証
        expect(result).toStrictEqual(new Uint8Array([2]));
      } finally {
        proxyStorage.close(createCloseContext() as IStorage.CloseContext);
      }
    });
  });

  test("正常に完了した後に signal を中断しても保存済みデータは影響を受けない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "completed.bin";
    const data = new Uint8Array([1, 2, 3]);
    const controller = new AbortController();
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    await storage.write(
      createSetContext(key, { signal: controller.signal }) as IStorage.WriteContext,
      data,
    );
    controller.abort();

    // 検証
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });
});
