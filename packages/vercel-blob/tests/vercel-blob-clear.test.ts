import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createGetContext,
  createSetContext,
  createClearContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import VercelBlob from "../src/vercel-blob.js";
import { type RecordedClientCall, createFakeClient, createFakeDownload } from "./_helpers.js";

/**
 * 削除呼び出しの記録から削除された pathname を集めます。
 * 頁分割した `list` の結果を漏れなく削除したことの検証に使用します。
 */
function deletedPathnames(calls: readonly RecordedClientCall[]): string[] {
  return calls.flatMap((call) => (call.operation === "del" ? [...call.pathnames] : []));
}

describe("clear", () => {
  test("保存したキーを clear したとき、すべて削除される", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("k2", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storage.clear(
      createClearContext("", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.ClearContext,
    );

    // 検証：
    expect(client.store.size).toBe(0);
  });

  test("空の保存に対する clear は成功する", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });

    // 実行と検証：
    await expect(
      storage.clear(
        createClearContext("", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.ClearContext,
      ),
    ).resolves.toBeUndefined();
    expect(client.calls.filter((call) => call.operation === "del")).toStrictEqual([]);
  });

  test("keyPrefix を指定したとき、その接頭辞の Blob のみ削除される", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
      keyPrefix: "app:",
    });
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    client.store.set("other:k2", new Uint8Array([2]));

    // 実行：
    await storage.clear(
      createClearContext("", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.ClearContext,
    );

    // 検証：
    expect([...client.store.keys()]).toStrictEqual(["other:k2"]);

    const listCalls = client.calls.filter((call) => call.operation === "list");
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]).toMatchObject({ prefix: "app:" });
  });

  test("list が頁分割されても、すべての頁を削除する", async ({ expect }) => {
    // 準備：
    const client = createFakeClient({ pageSize: 2 });
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });

    for (let i = 0; i < 5; i += 1) {
      await storage.write(
        createSetContext(`k${i}`, { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
        new Uint8Array([i]),
      );
    }

    // 実行：
    await storage.clear(
      createClearContext("", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.ClearContext,
    );

    // 検証：
    expect(client.store.size).toBe(0);
    const listCalls = client.calls.filter((call) => call.operation === "list");
    expect(listCalls).toHaveLength(3);

    const deleted = deletedPathnames(client.calls);
    expect(deleted.sort()).toStrictEqual(["k0", "k1", "k2", "k3", "k4"]);
  });

  test("clear 後に read すると KeyNotFoundError になる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.clear(
      createClearContext("", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.ClearContext,
    );

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("中断済みシグナルでの clear は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
    });

    // 実行：
    const error = await captureRejection(
      storage.clear(createClearContext("", { signal: abortedSignal() }) as IStorage.ClearContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
