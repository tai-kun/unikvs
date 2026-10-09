/**
 * テスト用のインメモリー `Storage` 実装と共通部品です。
 *
 * `Map` 背後で `length` / `key` / `getItem` / `setItem` / `removeItem` / `clear` を提供します。
 * `quotaAt` で容量超過の再現、`onSetItem` で呼び出し記録や他アプリ直書きの模擬に使います。
 */

/**
 * フェイク `Storage` の振る舞いを変えるフックです。
 * クォータ超過・呼び出し記録・`key` の `null` 返却の再現に使います。
 */
export type FakeStorageHooks = {
  /**
   * 何回目の `setItem` で `QuotaExceededError` を投げるかです。
   * 未指定の場合は投げません。
   */
  readonly quotaAt?: number | undefined;

  /**
   * `setItem` のたびに呼び出されるフックです。
   * 呼び出し記録や他アプリ直書きの模擬に使います。
   */
  readonly onSetItem?: ((key: string, value: string) => void) | undefined;

  /**
   * `key(index)` の返値を上書きするフックです。
   * 未指定の場合は挿入順のキーを返します。
   */
  readonly keyAt?: ((index: number) => string | null) | undefined;
};

/**
 * テスト用のインメモリー `Storage` を作ります。
 * `setItem` 回数を数え、`quotaAt` 回目で `QuotaExceededError` を投げます。
 */
export function createFakeStorage(hooks: FakeStorageHooks = {}): Storage {
  const { quotaAt, onSetItem, keyAt } = hooks;
  const store = new Map<string, string>();
  let setCount = 0;

  const storage: Storage = {
    get length(): number {
      return store.size;
    },

    key(index: number): string | null {
      if (keyAt !== undefined) {
        return keyAt(index);
      }

      return [...store.keys()][index] ?? null;
    },

    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },

    setItem(key: string, value: string): void {
      setCount += 1;

      if (quotaAt !== undefined && setCount >= quotaAt) {
        throw new DOMException(
          `Quota exceeded after ${String(setCount)} setItem calls`,
          "QuotaExceededError",
        );
      }

      onSetItem?.(key, value);
      store.set(key, value);
    },

    removeItem(key: string): void {
      store.delete(key);
    },

    clear(): void {
      store.clear();
    },
  };

  return storage;
}

/**
 * `getItem` / `setItem` で `SecurityError` を投げる `Storage` を作ります。
 * Cookie ブロック時などの素通し検証に使います。
 */
export function createSecurityErrorStorage(): Storage {
  const storage: Storage = {
    get length(): number {
      throw new DOMException("Access is denied", "SecurityError");
    },

    key(_index: number): string | null {
      throw new DOMException("Access is denied", "SecurityError");
    },

    getItem(_key: string): string | null {
      throw new DOMException("Access is denied", "SecurityError");
    },

    setItem(_key: string, _value: string): void {
      throw new DOMException("Access is denied", "SecurityError");
    },

    removeItem(_key: string): void {
      throw new DOMException("Access is denied", "SecurityError");
    },

    clear(): void {
      throw new DOMException("Access is denied", "SecurityError");
    },
  };

  return storage;
}

let prefixSequence = 0;

/**
 * テストごとに一意な `keyPrefix` を生成します。
 * 実 `localStorage` がブラウザー全体で共有されるため、テスト同士の汚染を防ぐために使用します。
 */
export function createKeyPrefix(): string {
  prefixSequence += 1;

  return `unikvs-test-${prefixSequence}:`;
}

/**
 * インスタンス間で共有する背後 `Storage` を返します。
 * 実 `localStorage` がある環境ではそれを使い、ない環境ではフェイクを使います。
 */
export function createSharedBackend(): Storage {
  const globalBackend = (globalThis as { localStorage?: Storage | undefined }).localStorage;

  if (globalBackend) {
    return globalBackend;
  }

  return createFakeStorage();
}

/**
 * `globalThis.localStorage` を一時的に差し替えて関数を実行します。
 * ブラウザーと Node の双方で backend の有無を再現するために使用します。
 */
export function runWithGlobalLocalStorage<T>(backend: Storage | undefined, fn: () => T): T {
  const holder = globalThis as Record<string, unknown>;
  const hadOwn = Object.hasOwn(holder, "localStorage");
  const descriptor = Object.getOwnPropertyDescriptor(holder, "localStorage");

  Object.defineProperty(holder, "localStorage", {
    value: backend,
    writable: true,
    configurable: true,
  });

  try {
    return fn();
  } finally {
    if (hadOwn && descriptor !== undefined) {
      Object.defineProperty(holder, "localStorage", descriptor);
    } else {
      delete holder["localStorage"];
    }
  }
}

/**
 * 投げた同期エラーを例外として返します。
 * 実際に投げられたエラーの種類とメタ情報を検証するために使用します。
 */
export function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("例外が投げられませんでした");
}

/**
 * 常に中断済みのシグナルを返します。
 * 入口の中断検証の検証に使用します。
 */
export function abortedSignal(reason?: unknown): AbortSignal {
  const controller = new AbortController();

  controller.abort(reason);

  return controller.signal;
}
