import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { S3Client, CreateBucketCommand, type S3ClientConfig } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, test as vitest } from "vitest";

import S3 from "../src/s3.js";

let bucketId = 0;
let server: ChildProcess | undefined;
let volumeDir: string;
let portNumber = 0;

/**
 * OS から空きポートを 1 つ取得します。
 *
 * @returns 空きポート番号で解決する Promise です。
 */
export async function acquireFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        const port = address.port;
        server.close(() => {
          resolve(port);
        });
      } else {
        server.close(() => {
          reject(new Error("空きポートの取得に失敗しました"));
        });
      }
    });
  });
}

/**
 * 指定されたポートが接続可能になるまで待機します。
 *
 * @param port 接続先のポート番号です。
 * @param timeoutMs 待機する最大時間 (ミリ秒) です。
 * @returns ポートが開放された場合に解決する Promise です。
 * @throws タイムアウト時間内に接続できなかった場合にエラーを投げます。
 */
export async function waitForPort(port: number, timeoutMs = 10e3): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();

    const tryConnect = (): void => {
      const socket: Socket = new Socket();
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`タイムアウト: 127.0.0.1:${port}`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
      socket.connect(port, "127.0.0.1");
    };

    tryConnect();
  });
}

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
 * バイト列を 1 つに連結します。
 * チャンク列と単体のバイト列を比較するために使用します。
 */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * ストリームを最後まで読み取り、全チャンクを連結したバイト列を返します。
 * ストリーム経由の読み取りと通常の read の一致を検証するために使用します。
 */
export async function collectBytes(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return concatBytes(chunks);
}

/**
 * 2 つのバイト列が同じ長さで各バイトが一致するかを比較します。
 * 数 MiB のデータを toStrictEqual で比較するコストを避けるために使用します。
 */
export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

/**
 * 0 から 255 までを巡る決定的なバイト列を生成します。
 * 全バイト値を含むデータの往復検証に使用します。
 */
export function createAllByteValues(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);

  for (let index = 0; index < size; index++) {
    bytes[index] = index % 256;
  }

  return bytes;
}

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
