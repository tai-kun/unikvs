import { type Server, createServer } from "node:http";

import type { IStorage } from "@unikvs/core";
import { createOpenContext, createClearContext, createCloseContext } from "@unikvs/testing";
import { describe } from "vite-plus/test";

import S3 from "../src/s3.js";
import { test } from "./_helpers.js";

type MockServer = {
  server: Server;
  endpoint: string;
  deleteRequests: number;
  listContinuationTokens: (string | null)[];
};

/**
 * 一括削除の 2 ページ目でオブジェクト単位の失敗を返す S3 の代役サーバーを起動します。
 * 2 ページ目も `IsTruncated` を true にして、失敗時に 3 ページ目へ進まないことを検証するために使用します。
 */
async function startMockServer(): Promise<MockServer> {
  const state: MockServer = {
    server: createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.searchParams.get("list-type") === "2") {
        const continuationToken = url.searchParams.get("continuation-token");
        state.listContinuationTokens.push(continuationToken);

        let contents: string;
        let isTruncated: string;
        let nextToken: string;

        if (continuationToken === null) {
          contents =
            "<Contents><Key>page1-a.bin</Key></Contents><Contents><Key>page1-b.bin</Key></Contents>";
          isTruncated = "true";
          nextToken = "<NextContinuationToken>next</NextContinuationToken>";
        } else if (continuationToken === "next") {
          contents =
            "<Contents><Key>page2-locked.bin</Key></Contents><Contents><Key>page2-other.bin</Key></Contents>";
          isTruncated = "true";
          nextToken = "<NextContinuationToken>page3</NextContinuationToken>";
        } else {
          contents = "<Contents><Key>page3.bin</Key></Contents>";
          isTruncated = "false";
          nextToken = "";
        }

        response.writeHead(200, { "content-type": "application/xml" });
        response.end(
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>test-bucket</Name><KeyCount>2</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>${isTruncated}</IsTruncated>${nextToken}${contents}</ListBucketResult>`,
        );

        return;
      }

      if (request.method === "POST" && url.searchParams.has("delete")) {
        state.deleteRequests++;
        request.resume();

        if (state.deleteRequests === 1) {
          response.writeHead(200, { "content-type": "application/xml" });
          response.end(
            '<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>',
          );

          return;
        }

        response.writeHead(200, { "content-type": "application/xml" });
        response.end(
          '<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Error><Key>page2-locked.bin</Key><Code>AccessDenied</Code><Message>Access Denied</Message></Error></DeleteResult>',
        );

        return;
      }

      request.resume();
      response.writeHead(400, { "content-type": "application/xml" });
      response.end("<Error><Code>UnexpectedRequest</Code></Error>");
    }),
    endpoint: "",
    deleteRequests: 0,
    listContinuationTokens: [],
  };
  await new Promise<void>((resolve, reject) => {
    state.server.once("error", reject);
    state.server.listen(0, "127.0.0.1", resolve);
  });

  const address = state.server.address();

  if (typeof address !== "object" || address === null) {
    throw new Error("代役サーバーのポート取得に失敗しました");
  }

  state.endpoint = `http://127.0.0.1:${address.port}`;

  return state;
}

/**
 * 代役サーバーを停止します。
 */
async function stopMockServer(server: Server): Promise<void> {
  server.closeAllConnections();

  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

describe("バケット一括削除のエラー", () => {
  test("DeleteObjects が HTTP 200 と Errors を返したとき、clear は集約エラーで拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const mock = await startMockServer();
    const storage = new S3("test-bucket", {
      region: "us-east-1",
      endpoint: mock.endpoint,
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
      forcePathStyle: true,
    });
    storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      const error = await storage
        .clear(createClearContext("", { signal }) as IStorage.ClearContext)
        .catch((reason: unknown) => reason);

      // 検証：
      expect(error).toBeInstanceOf(AggregateError);
      expect(error).toMatchObject({
        message:
          'S3: failed to delete 1 object(s): AccessDenied: "page2-locked.bin": Access Denied',
      });
      expect((error as AggregateError).errors).toStrictEqual([
        new Error('AccessDenied: "page2-locked.bin": Access Denied'),
      ]);

      expect(mock.listContinuationTokens).toStrictEqual([null, "next"]);
      expect(mock.deleteRequests).toBe(2);
    } finally {
      storage.close(createCloseContext() as IStorage.CloseContext);
      await stopMockServer(mock.server);
    }
  });
});
