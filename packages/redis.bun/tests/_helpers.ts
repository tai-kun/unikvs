import { spawn, type ChildProcess } from "node:child_process";
import { createServer, Socket } from "node:net";

import { RedisClient } from "bun";
import { afterAll, beforeAll, test as vitest } from "vitest";

import Redis from "../src/redis.js";

let server: ChildProcess | undefined;
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

  server = spawn(
    "redis-server",
    [
      "--port",
      String(portNumber),
      "--bind",
      "127.0.0.1",
      // テストごとに専用のサーバーを起動するため、永続化は不要です。
      "--save",
      "",
      "--appendonly",
      "no",
    ],
    { stdio: "ignore" },
  );

  await waitForPort(portNumber);
});

afterAll(() => {
  if (server && !server.killed) {
    server.kill();
  }
});

/**
 * 各テストに独立したキープレフィックスと、そのプレフィックスで open 済みの Redis を提供します。
 * 同じサーバーを共有してもキーが衝突せず、clear が他のテストへ影響しないために使用します。
 */
export const test = vitest.extend<{
  client: RedisClient;
  keyPrefix: string;
  storage: Redis;
  url: string;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async url({}, use) {
    await use(`redis://127.0.0.1:${portNumber}`);
  },
  // oxlint-disable-next-line no-empty-pattern
  async keyPrefix({}, use) {
    await use(randomKeyPrefix());
  },
  async client({ url }, use) {
    const client = new RedisClient(url);
    try {
      await use(client);
    } finally {
      client.close();
    }
  },
  async storage({ keyPrefix, url }, use) {
    const storage = new Redis(url, { keyPrefix });
    await storage.open();

    await use(storage);

    if (storage.isOpen) {
      storage.close();
    }
  },
});

/**
 * テストごとに一意なキープレフィックスを作ります。
 * 並行実行されるテスト間でキー空間を分離するために使用します。
 */
export function randomKeyPrefix(): string {
  return `unikvs-test-${crypto.randomUUID()}:`;
}

/**
 * テスト対象と同じサーバーに接続する未オープンの Redis ストレージを作成します。
 * 別インスタンスからの読み取りや再接続の検証に使用します。
 */
export function createStorage(url: string, keyPrefix: string): Redis {
  return new Redis(url, { keyPrefix });
}

/**
 * 指定したパターンに一致するキーを生のクライアントで一覧します。
 * プレフィックスの分離や一時キーの後始末を検証するために使用します。
 */
export async function listKeys(client: RedisClient, pattern = "*"): Promise<string[]> {
  const keys = await client.keys(pattern);

  return keys.sort();
}

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
 * 線形合同法による決定的な擬似乱数バイト列を生成します。
 * 偏りのない任意バイナリを大容量で用意するために使用します。
 */
export function createPseudoRandomBytes(size: number, seed = 0x12345678): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  let state = seed >>> 0;

  for (let index = 0; index < size; index++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[index] = state >>> 24;
  }

  return bytes;
}
