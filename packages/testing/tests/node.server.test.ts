import { rm, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, describe } from "vite-plus/test";

import { waitForPort, acquireFreePort, listTemporaryFiles } from "../src/node.js";

describe("acquireFreePort と waitForPort", () => {
  test("取得したポートへ接続できる", async ({ expect }) => {
    // 準備：
    const port = await acquireFreePort();
    const { createServer } = await import("node:net");
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", () => {
        resolve();
      });
    });

    try {
      // 実行と検証：
      await expect(waitForPort(port)).resolves.toBeUndefined();
    } finally {
      // 後始末：
      server.close();
    }
  });

  test("接続できないポートはタイムアウトする", async ({ expect }) => {
    // 準備：
    const port = await acquireFreePort();

    // 実行と検証：
    await expect(waitForPort(port, 500)).rejects.toThrow();
  });
});

describe("listTemporaryFiles", () => {
  test("*.tmp のみを返す", async ({ expect }) => {
    // 準備：
    const root = await mkdtemp(join(tmpdir(), "unikvs-testing-"));

    try {
      await writeFile(join(root, "a.tmp"), "x");
      await writeFile(join(root, "b.bin"), "x");

      // 実行：
      const result = await listTemporaryFiles(root);

      // 検証：
      expect(result).toStrictEqual(["a.tmp"]);
    } finally {
      // 後始末：
      await rm(root, {
        force: true,
        recursive: true,
      });
    }
  });
});
