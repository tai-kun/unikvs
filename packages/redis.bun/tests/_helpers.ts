// oxlint-disable vitest/require-top-level-describe
import { type ChildProcess, spawn } from "node:child_process";

import type { IStorage } from "@unikvs/core";
import { createOpenContext, createCloseContext } from "@unikvs/testing";
import { waitForPort, acquireFreePort } from "@unikvs/testing/node";
import { RedisClient } from "bun";
import { test as vitest, afterAll, beforeAll } from "vite-plus/test";

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
  url: string;
  client: RedisClient;
  storage: Redis;
  keyPrefix: string;
}>({
  async url({}, use) {
    await use(`redis://127.0.0.1:${portNumber}`);
  },
  async client({ url }, use) {
    const client = new RedisClient(url);

    try {
      await use(client);
    } finally {
      client.close();
    }
  },
  async storage({ url, keyPrefix }, use) {
    const storage = new Redis(url, { keyPrefix });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);

    if (storage.isOpen) {
      storage.close(createCloseContext() as IStorage.CloseContext);
    }
  },
  async keyPrefix({}, use) {
    await use(randomKeyPrefix());
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
