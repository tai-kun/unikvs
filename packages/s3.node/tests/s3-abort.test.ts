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
    storage.open();
    const controller = new AbortController();
    controller.abort(new Error("独自の中断理由"));
    const { signal } = controller;

    // 実行と検証
    await expect(
      storage.write({ key: "pre-aborted.bin", data: new Uint8Array([1]), signal, vars: {} }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(storage.read({ key: "pre-aborted.bin", signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(storage.exists({ key: "pre-aborted.bin", signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(storage.delete({ key: "pre-aborted.bin", signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(storage.clear({ signal })).rejects.toMatchObject({ name: "AbortError" });
    await expect(storage.getReadable({ key: "pre-aborted.bin", signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  test("事前に中断された signal の getWritable は StorageAbortedError を投げる", ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "pre-aborted-writable.bin";
    storage.open();
    const controller = new AbortController();
    controller.abort();
    let caught: unknown;

    // 実行
    try {
      storage.getWritable({ key, vars: {}, signal: controller.signal });
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
    storage.open();
    await storage.write({ key: targetKey, data: new Uint8Array([1]), signal, vars: {} });

    await withDelayedProxy(endpoint, async (proxyEndpoint) => {
      const proxyStorage = new S3(bucket, createClientConfig(proxyEndpoint));
      proxyStorage.open();

      try {
        // 実行と検証
        const cases: ((abortSignal: AbortSignal) => Promise<unknown>)[] = [
          (abortSignal) =>
            proxyStorage.write({
              key: "in-flight-write.bin",
              data: new Uint8Array([2]),
              signal: abortSignal,
              vars: {},
            }),
          (abortSignal) => proxyStorage.read({ key: targetKey, signal: abortSignal }),
          (abortSignal) => proxyStorage.exists({ key: targetKey, signal: abortSignal }),
          (abortSignal) => proxyStorage.delete({ key: targetKey, signal: abortSignal }),
          (abortSignal) => proxyStorage.clear({ signal: abortSignal }),
        ];

        for (const run of cases) {
          const controller = abortAfter(60);
          await expect(run(controller.signal)).rejects.toMatchObject({
            name: "AbortError",
          });
        }
      } finally {
        proxyStorage.close();
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
    storage.open();

    await withDelayedProxy(endpoint, async (proxyEndpoint) => {
      const proxyStorage = new S3(bucket, createClientConfig(proxyEndpoint));
      proxyStorage.open();

      try {
        const controller = abortAfter(60);
        await expect(
          proxyStorage.write({
            key: "first-attempt.bin",
            data: new Uint8Array([1]),
            signal: controller.signal,
            vars: {},
          }),
        ).rejects.toMatchObject({ name: "AbortError" });

        // 実行
        await proxyStorage.write({
          key: "second-attempt.bin",
          data: new Uint8Array([2]),
          signal,
          vars: {},
        });
        const result = await proxyStorage.read({ key: "second-attempt.bin", signal });

        // 検証
        expect(result).toStrictEqual(new Uint8Array([2]));
      } finally {
        proxyStorage.close();
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
    storage.open();

    // 実行
    await storage.write({ key, data, signal: controller.signal, vars: {} });
    controller.abort();

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });
});
