import type { CookieAttributes, CookieStoreLike } from "../src/cookies.js";

export type SetCall = {
  readonly name: string;
  readonly value: string;
  readonly attributes: CookieAttributes;
};

export type DeleteCall = {
  readonly name: string;
  readonly attributes: CookieAttributes;
};

export type FakeCookieStore = CookieStoreLike & {
  readonly entries: Map<string, string>;
  readonly setCalls: SetCall[];
  readonly deleteCalls: DeleteCall[];
};

/**
 * 注入先の CookieStoreLike として使うインメモリーストアです。
 * set/delete に渡された値と属性を記録し、呼び出し契約を検証できるようにします。
 */
export function createFakeCookieStore(): FakeCookieStore {
  const entries = new Map<string, string>();
  const setCalls: SetCall[] = [];
  const deleteCalls: DeleteCall[] = [];

  return {
    entries,
    setCalls,
    deleteCalls,

    get(name: string): string | undefined {
      return entries.get(name);
    },

    set(name: string, value: string, attributes: CookieAttributes): void {
      setCalls.push({ name, value, attributes });
      entries.set(name, value);
    },

    delete(name: string, attributes: CookieAttributes): void {
      deleteCalls.push({ name, attributes });
      entries.delete(name);
    },

    keys(): Iterable<string> {
      return entries.keys();
    },
  };
}

export type FakeDocument = {
  cookie: string;
};

/**
 * document.cookie だけを持つフェイクです。
 * 書き込まれた Set-Cookie 文字列を解析し、Max-Age が 0 以下のときの削除を再現します。
 * Path / Domain によるスコープ、Expires、正の Max-Age の期限切れ、Secure / SameSite の
 * 適用は模倣しません。属性は書き込まれた文字列を直接検証してください。
 */
export function createFakeDocument(): FakeDocument & { writes: string[] } {
  const jar = new Map<string, string>();
  const writes: string[] = [];

  const fake = {
    writes,

    get cookie(): string {
      return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },

    set cookie(serialized: string) {
      writes.push(serialized);

      const [pair, ...directives] = serialized.split(";");
      const separator = pair?.indexOf("=") ?? -1;

      if (pair === undefined || separator === -1) {
        return;
      }

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      let maxAge: number | undefined;

      for (const directive of directives) {
        const [directiveName, directiveValue] = directive.split("=").map((part) => part.trim());

        if (directiveName?.toLowerCase() === "max-age") {
          maxAge = Number(directiveValue);
        }
      }

      if (name === "") {
        return;
      }

      if (maxAge !== undefined && maxAge <= 0) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    },
  };

  return fake;
}

/**
 * テスト中だけ globalThis.document を差し替え、終了後に元の状態へ戻します。
 * document 不在時のフォールバックをサーバー環境で検証するために使用します。
 */
export function runWithGlobalDocument<T>(document: FakeDocument | undefined, fn: () => T): T {
  const holder = globalThis as Record<string, unknown>;
  const hadOwn = Object.hasOwn(holder, "document");
  const descriptor = Object.getOwnPropertyDescriptor(holder, "document");

  Object.defineProperty(holder, "document", {
    value: document,
    writable: true,
    configurable: true,
  });

  try {
    return fn();
  } finally {
    if (hadOwn && descriptor !== undefined) {
      Object.defineProperty(holder, "document", descriptor);
    } else {
      delete holder["document"];
    }
  }
}
