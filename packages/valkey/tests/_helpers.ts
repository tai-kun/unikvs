import type { IStorage } from "@unikvs/core";
import { createOpenContext, createCloseContext } from "@unikvs/testing";
import { test as vitest } from "vite-plus/test";

import Valkey, { type ValkeyClient } from "../src/valkey.js";

type Entry = {
  value: Buffer;
  expiresAt?: number | undefined;
};

/**
 * `ValkeyClient` 形状を満たすインメモリのフェイクです。
 *
 * Valkey (Redis 互換) の振る舞いとして期限切れの遅延削除、`SCAN` のページング、`RENAME` の置き換え意味論を再現します。`now` を差し替えると時刻を制御できます。
 */
export class FakeValkeyClient implements ValkeyClient {
  public readonly entries = new Map<string, Entry>();

  public connectCalls = 0;

  public quitCalls = 0;

  public disconnectCalls = 0;

  public now: () => number = Date.now;

  public async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  public async quit(): Promise<string> {
    this.quitCalls += 1;

    return "OK";
  }

  public disconnect(): void {
    this.disconnectCalls += 1;
  }

  public on(): unknown {
    return undefined;
  }

  public async set(key: string, value: string | Uint8Array, ...args: unknown[]): Promise<string> {
    let expiresAt: number | undefined;

    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === "PX" && typeof args[index + 1] === "number") {
        expiresAt = this.now() + (args[index + 1] as number);
        index += 1;
      }
    }

    this.entries.set(key, {
      value: Buffer.from(typeof value === "string" ? value : Buffer.from(value)),
      expiresAt,
    });

    return "OK";
  }

  public async getBuffer(key: string): Promise<Buffer | null> {
    this.purge(key);
    const entry = this.entries.get(key);

    return entry === undefined ? null : Buffer.from(entry.value);
  }

  public async exists(key: string): Promise<number> {
    this.purge(key);

    return this.entries.has(key) ? 1 : 0;
  }

  public async del(...keys: string[]): Promise<number> {
    let count = 0;

    for (const key of keys) {
      this.purge(key);
      if (this.entries.delete(key)) {
        count += 1;
      }
    }

    return count;
  }

  public async scan(cursor: string, ...args: unknown[]): Promise<[string, string[]]> {
    let pattern = "*";
    let count = 10;

    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === "MATCH" && typeof args[index + 1] === "string") {
        pattern = args[index + 1] as string;
        index += 1;
      } else if (args[index] === "COUNT" && typeof args[index + 1] === "number") {
        count = args[index + 1] as number;
        index += 1;
      }
    }

    this.purgeAll();
    const keys = [...this.entries.keys()].filter((key) => matchGlob(pattern, key)).sort();
    // カーソルは前回返した末尾キーとし、削除によるずれに影響されないようにする。
    // 実サーバーの `SCAN` と同様に、走査中の削除で未走査キーが欠落しない。
    const start = cursor === "0" ? 0 : upperBound(keys, cursor);
    const page = keys.slice(start, start + count);
    const last = page.at(-1);
    const next =
      page.length === 0 || start + page.length >= keys.length || last === undefined ? "0" : last;

    return [next, page];
  }

  public async append(key: string, value: string | Uint8Array): Promise<number> {
    this.purge(key);
    const chunk = Buffer.from(typeof value === "string" ? value : Buffer.from(value));
    const entry = this.entries.get(key);

    if (entry === undefined) {
      this.entries.set(key, { value: chunk });

      return chunk.length;
    }

    entry.value = Buffer.concat([entry.value, chunk]);

    return entry.value.length;
  }

  public async rename(src: string, dest: string): Promise<string> {
    this.purge(src);
    this.purge(dest);
    const entry = this.entries.get(src);

    if (entry === undefined) {
      throw new Error("ERR no such key");
    }

    this.entries.delete(dest);
    this.entries.delete(src);
    this.entries.set(dest, entry);

    return "OK";
  }

  public async pexpire(key: string, ms: number): Promise<number> {
    this.purge(key);
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return 0;
    }

    entry.expiresAt = this.now() + ms;

    return 1;
  }

  /**
   * 検証用にキーの残り有効期限 (ミリ秒) を返します。
   * 期限なしは `-1`、存在しないキーは `-2` です。
   */
  public pttl(key: string): number {
    this.purge(key);
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return -2;
    }

    if (entry.expiresAt === undefined) {
      return -1;
    }

    return entry.expiresAt - this.now();
  }

  /**
   * 検証用にパターンに一致するキーを一覧します。
   */
  public keys(pattern = "*"): string[] {
    this.purgeAll();

    return [...this.entries.keys()].filter((key) => matchGlob(pattern, key)).sort();
  }

  private purge(key: string): void {
    const entry = this.entries.get(key);

    if (entry?.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
    }
  }

  private purgeAll(): void {
    for (const key of this.entries.keys()) {
      this.purge(key);
    }
  }
}

/**
 * ソート済み配列のうち `value` より大きい最初の要素位置を返します。
 */
function upperBound(sorted: string[], value: string): number {
  let low = 0;
  let high = sorted.length;

  while (low < high) {
    const middle = (low + high) >> 1;
    const mid = sorted[middle];

    if (mid !== undefined && mid <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

/**
 * 正規表現で特別な意味を持つ文字をエスケープします。
 */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * 文字クラス内で特別な意味を持つ文字をエスケープします。
 */
function escapeRegExpClass(value: string): string {
  return value.replaceAll(/[\\\]^-]/gu, "\\$&");
}

/**
 * `[` から始まる文字クラスを正規表現へ変換します。
 * 閉じ括弧がない場合は null を返します。
 */
function parseGlobClass(
  pattern: string,
  start: number,
): {
  readonly next: number;
  readonly source: string;
} | null {
  let index = start + 1;
  let negate = false;

  if (pattern[index] === "^") {
    negate = true;
    index += 1;
  }

  let content = "";

  // 先頭の `]` はリテラルとして扱います。
  if (pattern[index] === "]") {
    content += "\\]";
    index += 1;
  }

  while (index < pattern.length) {
    const char = pattern[index];

    if (char === "]") {
      return {
        next: index + 1,
        source: `[${negate ? "^" : ""}${content}]`,
      };
    }

    if (char === "\\") {
      index += 1;
      const escaped = pattern[index];

      if (escaped === undefined) {
        return null;
      }

      content += escapeRegExpClass(escaped);
      index += 1;
      continue;
    }

    if (char === "-") {
      // 範囲指定のハイフンはそのまま残します。
      content += "-";
      index += 1;
      continue;
    }

    content += escapeRegExpClass(char ?? "");
    index += 1;
  }

  return null;
}

/**
 * `MATCH` パターンを Valkey (Redis 互換) の glob として解釈します。
 *
 * `*`、`?`、`[...]`、`\` によるエスケープに対応します。
 */
export function matchGlob(pattern: string, key: string): boolean {
  let source = "";
  let index = 0;

  while (index < pattern.length) {
    const char = pattern[index];

    switch (char) {
      case "*": {
        source += ".*";
        index += 1;
        break;
      }

      case "?": {
        source += ".";
        index += 1;
        break;
      }

      case "\\": {
        index += 1;
        const escaped = pattern[index];

        if (escaped === undefined) {
          source += "\\\\";
        } else {
          source += escapeRegExp(escaped);
          index += 1;
        }

        break;
      }

      case "[": {
        const parsed = parseGlobClass(pattern, index);

        if (parsed === null) {
          source += "\\[";
          index += 1;
        } else {
          source += parsed.source;
          index = parsed.next;
        }

        break;
      }

      case undefined: {
        index += 1;
        break;
      }

      default: {
        source += escapeRegExp(char ?? "");
        index += 1;
      }
    }
  }

  return new RegExp(`^${source}$`, "u").test(key);
}

/**
 * 各テストに独立したフェイクとキープレフィックス、`open` 済みの Valkey を提供します。
 * サーバー不要で常に実行できるため、既定のテストはすべてこのフィクスチャを使います。
 */
export const test = vitest.extend<{
  fake: FakeValkeyClient;
  storage: Valkey;
  keyPrefix: string;
}>({
  async fake({}, use) {
    await use(new FakeValkeyClient());
  },
  async storage({ fake, keyPrefix }, use) {
    const storage = new Valkey(undefined, {
      client: fake,
      keyPrefix,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);

    if (storage.isOpen) {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  },
  async keyPrefix({}, use) {
    await use(`unikvs-test-${crypto.randomUUID()}:`);
  },
});

/**
 * テスト対象と同じフェイクに接続する未オープンの Valkey ストレージを作成します。
 * 別インスタンスからの読み取りや再接続の検証に使用します。
 */
export function createStorage(
  fake: FakeValkeyClient,
  keyPrefix: string,
  options?: { ttl?: number | undefined },
): Valkey {
  return new Valkey(undefined, {
    keyPrefix,
    client: fake,
    ...options,
  });
}

/**
 * 実サーバーに対するライブテストの接続先 URL です。
 * 未設定のときライブテストは skip されます。
 */
export function liveUrl(): string | undefined {
  const valkeyUrl =
    process.env["VALKEY_URL"] === undefined || process.env["VALKEY_URL"] === ""
      ? undefined
      : process.env["VALKEY_URL"];
  const redisUrl =
    process.env["REDIS_URL"] === undefined || process.env["REDIS_URL"] === ""
      ? undefined
      : process.env["REDIS_URL"];

  return valkeyUrl ?? redisUrl;
}
