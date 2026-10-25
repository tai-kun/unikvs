// oxlint-disable vitest/require-top-level-describe
import { type ChildProcess, spawn } from "node:child_process";
import { rmSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IStorage } from "@unikvs/core";
import { createOpenContext, createCloseContext } from "@unikvs/testing";
import { waitForPort, acquireFreePort } from "@unikvs/testing/node";
import { test as vitest, afterAll, beforeAll } from "vite-plus/test";

import S3, { type S3StorageOptions } from "../src/s3.js";

let bucketId = 0;
let server: ChildProcess | undefined;
let volumeDir: string;
let portNumber = 0;
beforeAll(async () => {
  portNumber = await acquireFreePort();
  volumeDir = mkdtempSync(join(tmpdir(), "unikvs-s3-bun-"));

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
export function createClientConfig(endpoint: string): S3StorageOptions {
  return {
    region: "ap-northeast-1",
    endpoint,
    accessKeyId: "rustfsadmin",
    secretAccessKey: "rustfsadmin",
  };
}

/**
 * rustfs のボリュームディレクトリーにバケットのディレクトリーを作成します。
 * 各テストが専用のバケットを使い、clear がほかのテストへ影響しないようにするために使用します。
 */
function createBucket(bucket: string): void {
  mkdirSync(join(volumeDir, bucket));
}

/**
 * 各テストに新規バケット付きの S3 ストレージを提供するフィクスチャーです。
 * bucket と endpoint は別インスタンスの接続や再 open の検証にも使用します。
 * unauthorizedStorage は権限のない認証情報を持つストレージを提供します。
 */
export const test = vitest.extend<{
  bucket: string;
  storage: S3;
  endpoint: string;
  unauthorizedStorage: S3;
}>({
  async bucket({}, use) {
    const bucket = `test-bucket-${bucketId++}`;
    createBucket(bucket);
    await use(bucket);
  },
  async storage({ bucket, endpoint }, use) {
    const storage = new S3(bucket, createClientConfig(endpoint));
    await storage.open(createOpenContext() as IStorage.OpenContext);
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
    createBucket(bucket);

    const storage = new S3(bucket, {
      ...createClientConfig(endpoint),
      accessKeyId: "unauthorized",
      secretAccessKey: "unauthorized",
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);

    if (storage.isOpen) {
      storage.close(createCloseContext() as IStorage.CloseContext);
    }
  },
});
