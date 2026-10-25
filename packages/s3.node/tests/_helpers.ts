// oxlint-disable vitest/require-top-level-describe
import { type ChildProcess, spawn } from "node:child_process";
import { rmSync, mkdtempSync } from "node:fs";
import { type Server, Socket, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type S3ClientConfig, S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import type { IStorage } from "@unikvs/core";
import { createCloseContext } from "@unikvs/testing";
import { waitForPort, acquireFreePort } from "@unikvs/testing/node";
import { test as vitest, afterAll, beforeAll } from "vite-plus/test";

import S3 from "../src/s3.js";

let bucketId = 0;
let server: ChildProcess | undefined;
let volumeDir: string;
let portNumber = 0;
beforeAll(async () => {
  portNumber = await acquireFreePort();
  volumeDir = mkdtempSync(join(tmpdir(), "unikvs-s3-node-"));

  server = spawn("rustfs", ["server", "--address", `127.0.0.1:${portNumber}`, volumeDir], {
    stdio: "ignore",
  });

  await waitForPort(portNumber);
});
afterAll(() => {
  if (server && !server.killed) {
    server.kill();
  }

  if (volumeDir !== undefined) {
    rmSync(volumeDir, {
      force: true,
      recursive: true,
    });
  }
});

/**
 * ローカルの rustfs サーバーに接続する S3 クライアント設定を作成します。
 */
export function createClientConfig(endpoint: string): S3ClientConfig {
  return {
    region: "ap-northeast-1",
    endpoint,
    credentials: {
      accessKeyId: "rustfsadmin",
      secretAccessKey: "rustfsadmin",
    },
    forcePathStyle: true,
  };
}

/**
 * テスト用のバケットを作成します。
 */
export async function createBucket(endpoint: string, bucket: string): Promise<void> {
  const client = new S3Client(createClientConfig(endpoint));
  await client.send(
    new CreateBucketCommand({
      Bucket: bucket,
      CreateBucketConfiguration: {
        LocationConstraint: "ap-northeast-1",
      },
    }),
  );
  client.destroy();
}

/**
 * 各テストに新規バケット付きの S3 ストレージを提供するフィクスチャーです。
 * bucket と endpoint は別インスタンスの接続や再 open の検証にも使用します。
 * unauthorizedStorage は権限のない認証情報を持つストレージを提供します。
 */
// oxlint-disable-next-line jest/expect-expect jest/no-disabled-tests
export const test = vitest.extend<{
  bucket: string;
  storage: S3;
  endpoint: string;
  unauthorizedStorage: S3;
}>({
  async bucket({}, use) {
    const bucket = `test-bucket-${bucketId++}`;
    await use(bucket);
  },
  async storage({ bucket, endpoint }, use) {
    await createBucket(endpoint, bucket);

    const storage = new S3(bucket, createClientConfig(endpoint));
    await use(storage);

    if (storage.isOpen) {
      storage.close(createCloseContext() as IStorage.CloseContext);
    }
  },
  async endpoint({}, use) {
    await use(`http://127.0.0.1:${portNumber}`);
  },
  async unauthorizedStorage({ endpoint }, use) {
    const bucket = `test-unauthorized-bucket-${bucketId++}`;
    await createBucket(endpoint, bucket);

    const config = createClientConfig(endpoint);
    const storage = new S3(bucket, {
      ...config,
      credentials: {
        accessKeyId: "unauthorized",
        secretAccessKey: "unauthorized",
      },
    });
    await use(storage);

    if (storage.isOpen) {
      storage.close(createCloseContext() as IStorage.CloseContext);
    }
  },
});

/**
 * 転送を一定時間遅延させる TCP プロキシーを起動します。
 * 実行中のリクエストを確実に中断できるようにするために使用します。
 */
export async function createDelayedProxy(
  targetPort: number,
  delayMs: number,
): Promise<{
  close: () => Promise<void>;
  endpoint: string;
}> {
  const sockets = new Set<Socket>();
  const proxy: Server = createServer((client) => {
    const upstream = new Socket();

    sockets.add(client);
    sockets.add(upstream);

    const timer = setTimeout(() => {
      client.pipe(upstream);
      upstream.pipe(client);
    }, delayMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      sockets.delete(client);
      sockets.delete(upstream);
      client.destroy();
      upstream.destroy();
    };

    client.on("error", () => {});
    upstream.on("error", () => {});
    client.on("close", cleanup);
    upstream.on("close", cleanup);
    upstream.connect(targetPort, "127.0.0.1");
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", resolve);
  });

  const address = proxy.address();

  if (typeof address !== "object" || address === null) {
    throw new Error("プロキシーのポート取得に失敗しました");
  }

  return {
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }

        proxy.close(() => {
          resolve();
        });
      }),
    endpoint: `http://127.0.0.1:${address.port}`,
  };
}
