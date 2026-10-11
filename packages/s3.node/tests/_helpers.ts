import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { S3Client, CreateBucketCommand, type S3ClientConfig } from "@aws-sdk/client-s3";
import { acquireFreePort, waitForPort } from "@unikvs/testings/node";
import { afterAll, beforeAll, test as vitest } from "vitest";

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

afterAll(async () => {
  if (server && !server.killed) {
    server.kill();
  }
  if (volumeDir !== undefined) {
    rmSync(volumeDir, { recursive: true, force: true });
  }
});

/**
 * ローカルの rustfs サーバーに接続する S3 クライアント設定を作成します。
 */
export function createClientConfig(endpoint: string): S3ClientConfig {
  return {
    endpoint,
    region: "ap-northeast-1",
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
  endpoint: string;
  storage: S3;
  unauthorizedStorage: S3;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async bucket({}, use) {
    const bucket = `test-bucket-${bucketId++}`;
    await use(bucket);
  },
  // oxlint-disable-next-line no-empty-pattern
  async endpoint({}, use) {
    await use(`http://127.0.0.1:${portNumber}`);
  },
  async storage({ bucket, endpoint }, use) {
    await createBucket(endpoint, bucket);

    const storage = new S3(bucket, createClientConfig(endpoint));

    await use(storage);

    if (storage.isOpen) {
      storage.close();
    }
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
      storage.close();
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
): Promise<{ endpoint: string; close: () => Promise<void> }> {
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
    endpoint: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        proxy.close(() => {
          resolve();
        });
      }),
  };
}
