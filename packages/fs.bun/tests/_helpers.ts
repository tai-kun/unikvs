import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IStorage } from "@unikvs/core";
import { createOpenContext } from "@unikvs/testing";
import { test as vitest } from "vitest";

import BunFs from "../src/bun-fs.js";

/**
 * テストごとに独立した一時ルートと、そのルートを open 済みの BunFs を提供します。
 * ファイル状態をテスト間に残さず、並行実行時の干渉を防ぐために使用します。
 */
export const test = vitest.extend<{ root: string; storage: BunFs }>({
  // oxlint-disable-next-line no-empty-pattern
  async root({}, use) {
    const root = await mkdtemp(join(tmpdir(), "unikvs-bun-fs-"));
    try {
      await use(root);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  },
  async storage({ root }, use) {
    const storage = new BunFs(root);
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});
