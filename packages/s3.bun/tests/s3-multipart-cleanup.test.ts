import type { IStorage } from "@unikvs/core";
import { createSetContext, createOpenContext, createCloseContext } from "@unikvs/testing";
import { type Server } from "bun";
import { vi, describe } from "vite-plus/test";

import S3, { type S3StorageOptions } from "../src/s3.js";
import { test } from "./_helpers.js";

const PART_SIZE = 5 * 1024 * 1024;

/**
 * マルチパートアップロードの要求を記録する S3 の代役サーバーを作成します。
 * 中断時に `AbortMultipartUpload` が送られたことを実際の HTTP 要求で検証するために使用します。
 */
function createMultipartServer(): {
  server: Server<undefined>;
  endpoint: string;
  requests: {
    part: number;
    abort: number;
    create: number;
    complete: number;
  };
} {
  const requests = {
    part: 0,
    abort: 0,
    create: 0,
    complete: 0,
  };
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method === "POST" && url.searchParams.has("uploads")) {
        requests.create++;

        return new Response(
          "<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>",
          { headers: { "content-type": "application/xml" } },
        );
      }

      if (request.method === "PUT") {
        await request.arrayBuffer();
        requests.part++;

        return new Response("", { headers: { etag: '"etag"' } });
      }

      if (request.method === "DELETE") {
        requests.abort++;

        return new Response(null, { status: 204 });
      }

      await request.arrayBuffer();
      requests.complete++;

      return new Response(
        '<CompleteMultipartUploadResult><ETag>"etag"</ETag></CompleteMultipartUploadResult>',
        { headers: { "content-type": "application/xml" } },
      );
    },
  });

  return {
    server,
    endpoint: server.url.origin,
    requests,
  };
}

/**
 * 代役サーバーへ接続する S3 ストレージを作成します。
 */
async function createStorage(endpoint: string): Promise<S3> {
  const options: S3StorageOptions = {
    retry: 0,
    region: "us-east-1",
    endpoint,
    accessKeyId: "test",
    secretAccessKey: "test",
  };
  const storage = new S3("test-bucket", options);
  await storage.open(createOpenContext() as IStorage.OpenContext);

  return storage;
}

describe("マルチパートアップロードの中断", () => {
  test("writer.abort は進行中のマルチパートアップロードを中止する", async ({ expect, signal }) => {
    // 準備：
    const { server, endpoint, requests } = createMultipartServer();
    const storage = await createStorage(endpoint);

    try {
      const writer = storage
        .getWritable(
          createSetContext("aborted.bin", {
            signal,
            values: { "@unikvs/s3.bun:partSize": PART_SIZE },
          }) as IStorage.GetWritableContext,
        )
        .getWriter();

      // 実行：
      await writer.write(new Uint8Array(PART_SIZE + 1));

      await vi.waitFor(() => {
        expect(requests.part).toBeGreaterThan(0);
      });
      await writer.abort(new Error("中断"));

      // 検証：
      await vi.waitFor(() => {
        expect(requests.abort).toBe(1);
      });
      expect(requests.complete).toBe(0);
    } finally {
      void server.stop(true);
      storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("signal の中断は進行中のマルチパートアップロードを中止する", async ({ expect }) => {
    // 準備：
    const { server, endpoint, requests } = createMultipartServer();
    const storage = await createStorage(endpoint);
    const controller = new AbortController();

    try {
      const writer = storage
        .getWritable(
          createSetContext("aborted-by-signal.bin", {
            signal: controller.signal,
            values: { "@unikvs/s3.bun:partSize": PART_SIZE },
          }) as IStorage.GetWritableContext,
        )
        .getWriter();
      await writer.write(new Uint8Array(PART_SIZE + 1));

      await vi.waitFor(() => {
        expect(requests.part).toBeGreaterThan(0);
      });

      // 実行：
      controller.abort();

      // 検証：
      await vi.waitFor(() => {
        expect(requests.abort).toBe(1);
      });
      expect(requests.complete).toBe(0);
    } finally {
      void server.stop(true);
      storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});
