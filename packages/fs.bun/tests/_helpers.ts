import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    await storage.open();
    await use(storage);
  },
});

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

/**
 * ルート直下に残っている一時ファイル (*.tmp) の名前を返します。
 * swap-on-close の後始末が正しいことを検証するために使用します。
 */
export async function listTemporaryFiles(root: string): Promise<string[]> {
  const entries = await readdir(root);
  return entries.filter((entry) => entry.endsWith(".tmp"));
}
