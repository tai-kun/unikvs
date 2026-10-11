import { spawn, type ChildProcess } from "node:child_process";

import { acquireFreePort, waitForPort } from "@unikvs/testings/node";
import { Redis as Ioredis } from "ioredis";
import { afterAll, beforeAll, test as vitest } from "vitest";

import Redis from "../src/redis.js";

let server: ChildProcess | undefined;
let portNumber = 0;

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

afterAll(async () => {
  if (server && !server.killed) {
    server.kill();
  }
});

/**
 * 各テストに独立したキープレフィックスと、そのプレフィックスで open 済みの Redis を提供します。
 * 同じサーバーを共有してもキーが衝突せず、clear が他のテストへ影響しないために使用します。
 */
export const test = vitest.extend<{
  client: Ioredis;
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
    const client = new Ioredis(url);
    try {
      await use(client);
    } finally {
      // ヘルパ `client` は到達可能ホスト専用のため、`closeTimeout` を付けず `quit()` で閉じる。
      await client.quit();
    }
  },
  async storage({ keyPrefix, url }, use) {
    const storage = new Redis(url, { keyPrefix });
    await storage.open();

    await use(storage);

    if (storage.isOpen) {
      await storage.close();
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
export async function listKeys(client: Ioredis, pattern = "*"): Promise<string[]> {
  const keys = await client.keys(pattern);

  return keys.sort();
}
