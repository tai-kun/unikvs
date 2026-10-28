import type { IStorage } from "@unikvs/core";
import { type TestContextInit, TestContext, createOpenContext } from "@unikvs/testing";
import { test as vitest } from "vite-plus/test";

import Opfs from "../src/opfs.js";

const { signal } = new AbortController();

/**
 * テストごとに一意な OPFS ルート名を生成します。
 * テスト間で同じルートを共有して相互汚染するのを防ぐために使用します。
 */
export function uniqueRoot(prefix = "unikvs-tests"): string {
  return `${prefix}/${crypto.randomUUID()}`;
}

/**
 * テスト用に作成した OPFS ルートとその内容を再帰的に削除します。
 * テスト後の後始末で失敗してもテスト結果に影響させないために使用します。
 */
export async function removeRoot(root: string): Promise<void> {
  const dirnames = root.split("/");
  const basename = dirnames.pop();

  if (basename === undefined) {
    return;
  }

  let handle = await navigator.storage.getDirectory();

  for (const dirname of dirnames) {
    handle = await handle.getDirectoryHandle(dirname, { create: true });
  }

  try {
    await handle.removeEntry(basename, { recursive: true });
  } catch {
    // 後始末の失敗は無視します。
  }
}

/**
 * テスト用のコピーコンテキストを作成します。
 * パイプライン変数や中断シグナルを引き継いだコンテキストを組み立てるために使用します。
 */
export function createCopyContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "copy",
    key,
    destinationKey,
  });
}

/**
 * テスト用の移動コンテキストを作成します。
 * パイプライン変数や中断シグナルを引き継いだコンテキストを組み立てるために使用します。
 */
export function createMoveContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "move",
    key,
    destinationKey,
  });
}

/**
 * テストごとに一意なルートを用意し、後始末するフィクスチャーを提供します。
 * 各テストは必要なフィクスチャーだけを受け取ります。
 */
export const test = vitest.extend<{
  root: string;
  storage: Opfs;
}>({
  async root({}, use): Promise<void> {
    const root = uniqueRoot();
    await use(root);
    await removeRoot(root);
  },
  async storage({ root }, use): Promise<void> {
    const storage = new Opfs(root);
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await use(storage);
  },
});
