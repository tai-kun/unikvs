import type { IStorage } from "@unikvs/core";
import { createGetContext, createSetContext } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import VercelBlob, { type IFetch } from "../src/vercel-blob.js";
import { createFakeClient, createFakeDownload } from "./_helpers.js";

/**
 * キャッシュを迂回した要求には最新値、それ以外には書き換え前の値を返します。
 * 書き込み直後の read が CDN の古い応答に引きずられないことを検証するために使用します。
 */
function createStaleUnlessConsistentFetch(
  stale: Uint8Array,
  latest: Uint8Array,
  requestedUrls: string[],
): IFetch {
  return async (request) => {
    requestedUrls.push(request.url);
    const bypassesCache = new URL(request.url).searchParams.get("cache") === "0";

    return new Response(bypassesCache ? latest : stale, { status: 200 });
  };
}

describe("読み取りの一貫性", () => {
  test("private の read は CDN キャッシュを迂回して最新値を返す", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const stale = new Uint8Array([1]);
    const latest = new Uint8Array([2]);
    const requestedUrls: string[] = [];
    const staleFetch = createStaleUnlessConsistentFetch(stale, latest, requestedUrls);
    const storage = new VercelBlob({
      fetch: staleFetch,
      client,
    });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      stale,
    );
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      latest,
    );

    // 実行：
    const result = await storage.read(
      createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(latest);

    expect(requestedUrls).toStrictEqual(["https://fake.blob/k?cache=0"]);
  });

  test("public の read はダウンロード URL を変更しない", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { calls, fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      access: "public",
      client,
    });
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    const result = await storage.read(
      createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(new Uint8Array([1]));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://fake.blob/k");
  });
});
