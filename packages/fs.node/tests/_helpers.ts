import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test as vitest } from "vitest";

import NodeFs from "../src/node-fs.js";

/**
 * テストごとに独立した一時ルートと、そのルートを open 済みの NodeFs を提供します。
 * ファイル状態をテスト間に残さず、並行実行時の干渉を防ぐために使用します。
 */
export const test = vitest.extend<{ root: string; storage: NodeFs }>({
  // oxlint-disable-next-line no-empty-pattern
  async root({}, use) {
    const root = await mkdtemp(join(tmpdir(), "unikvs-fs-node-"));
    try {
      await use(root);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  },
  async storage({ root }, use) {
    const storage = new NodeFs(root);
    await storage.open();
    await use(storage);
  },
});
