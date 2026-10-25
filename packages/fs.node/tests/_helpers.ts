import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IStorage } from "@unikvs/core";
import { createOpenContext } from "@unikvs/testing";
import { test as vitest } from "vite-plus/test";

import NodeFs from "../src/node-fs.js";

/**
 * テストごとに独立した一時ルートと、そのルートを open 済みの NodeFs を提供します。
 * ファイル状態をテスト間に残さず、並行実行時の干渉を防ぐために使用します。
 */
export const test = vitest.extend<{
  root: string;
  storage: NodeFs;
}>({
  async root({}, use) {
    const root = await mkdtemp(join(tmpdir(), "unikvs-fs-node-"));

    try {
      await use(root);
    } finally {
      await rm(root, {
        force: true,
        recursive: true,
      }).catch(() => {});
    }
  },
  async storage({ root }, use) {
    const storage = new NodeFs(root);
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});
