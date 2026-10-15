import type { IStorage } from "@unikvs/core";
import { createCloseContext } from "@unikvs/testing";
import { test as vitest } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";

const { signal } = new AbortController();

/**
 * テストで使用するオブジェクトストア名です。
 * 既定値とは異なるストア名を指定して動作を検証するために使用します。
 */
export const STORE_NAME = "test-store";

let databaseSequence = 0;

/**
 * テストごとに一意なデータベース名を生成します。
 * 同一ブラウザーで複数のテストが実行されても IndexedDB が互いに干渉しないようにするために使用します。
 */
export function createDatabaseName(): string {
  databaseSequence += 1;
  return `unikvs-test-${globalThis.crypto.randomUUID()}-${databaseSequence}`;
}

/**
 * データベースを削除します。
 * 接続が残っていて削除がブロックされた場合も解決し、後始末でテストが止まらないようにするために使用します。
 */
export async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = globalThis.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/**
 * バージョンだけを指定してオブジェクトストアを持たないデータベースを作成します。
 * ストアが存在しない場合や、より高いバージョンが存在する場合のエラー伝播を検証するために使用します。
 */
export async function createEmptyDatabase(name: string, version: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = globalThis.indexedDB.open(name, version);
    request.onupgradeneeded = () => {};
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * テストごとに一意なデータベースを用意し、後始末で削除するテストを提供します。
 * IndexedDB はブラウザー全体で共有されるため、テスト同士の汚染を防ぐために使用します。
 */
export const test = vitest.extend<{ dbName: string; storage: IndexeddbStorage }>({
  // oxlint-disable-next-line no-empty-pattern
  async dbName({}, use) {
    const name = createDatabaseName();
    await use(name);
    await deleteDatabase(name);
  },
  async storage({ dbName }, use) {
    const storage = new IndexeddbStorage(dbName, STORE_NAME);
    await use(storage);
    if (storage.isOpen) {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  },
});
