import { test as vitest } from "vitest";

import Opfs from "../src/opfs.js";

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
  const basename = dirnames.pop()!;
  let handle = await navigator.storage.getDirectory();
  for (const dirname of dirnames) {
    handle = await handle.getDirectoryHandle(dirname, { create: true });
  }

  await handle.removeEntry(basename, { recursive: true }).catch(() => {});
}

/**
 * バイト列の配列を 1 つのバイト列に連結します。
 * チャンク境界に依存せずストリームの内容を比較するために使用します。
 */
export function concatBytes(chunks: readonly Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * ReadableStream の全チャンクを連結したバイト列を返します。
 * ストリーム経由の読み取り結果を書き込み内容と比較するために使用します。
 */
export async function readAll(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    chunks.push(value);
  }

  return concatBytes(chunks);
}

/**
 * バイト列を 16 進文字列へ変換します。
 * プロパティベーステストで常に有効なファイル名を生成するために使用します。
 */
export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

/**
 * テストごとに一意なルートを用意し、後始末するフィクスチャーを提供します。
 * 各テストは必要なフィクスチャーだけを受け取ります。
 */
export const test = vitest.extend<{
  root: string;
  storage: Opfs;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async root({}, use) {
    const root = uniqueRoot();
    await use(root);
    await removeRoot(root);
  },
  async storage({ root }, use) {
    const storage = new Opfs(root);
    await storage.open();
    await use(storage);
  },
});
