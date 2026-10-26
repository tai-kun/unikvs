/**
 * テスト用の疑似 KV binding です。
 *
 * `Map` バックで `get` / `put` / `delete` / `list` を処理します。
 * `list` は頁送りに対応し、`pageSize` で 1 ページの件数を変えられます。
 */
import CloudflareKv, {
  type KVNamespaceLike,
  type CloudflareKvOptions,
  type KVNamespaceListResult,
} from "../src/cloudflare-kv.js";

export type PutRecord = {
  readonly key: string;
  readonly value: ArrayBuffer;
  readonly options: { readonly expirationTtl?: number | undefined } | undefined;
};

export class FakeKVNamespace implements KVNamespaceLike {
  public readonly store = new Map<string, ArrayBuffer>();

  public readonly gets: string[] = [];

  public readonly puts: PutRecord[] = [];

  public readonly deletes: string[] = [];

  public readonly lists: {
    readonly cursor?: string | undefined;
    readonly prefix?: string | undefined;
  }[] = [];

  public pageSize = 1000;

  public async get(
    key: string,
    _type: "arrayBuffer" | { readonly type: "arrayBuffer" },
  ): Promise<ArrayBuffer | null> {
    this.gets.push(key);

    const found = this.store.get(key);

    if (found === undefined) {
      return null;
    }

    return found.slice(0);
  }

  public async put(
    key: string,
    value: ArrayBuffer,
    options?: { readonly expirationTtl?: number },
  ): Promise<void> {
    this.puts.push({
      key,
      value: value.slice(0),
      options,
    });
    this.store.set(key, value.slice(0));
  }

  public async delete(key: string): Promise<void> {
    this.deletes.push(key);
    this.store.delete(key);
  }

  public async list(options?: {
    readonly cursor?: string | undefined;
    readonly prefix?: string | undefined;
  }): Promise<KVNamespaceListResult> {
    this.lists.push({ ...options });

    const prefix = options?.prefix ?? "";
    const names = [...this.store.keys()].filter((name) => name.startsWith(prefix)).sort();
    const start = options?.cursor === undefined ? 0 : Number(options.cursor);
    const page = names.slice(start, start + this.pageSize);
    const next = start + this.pageSize;

    return {
      keys: page.map((name) => ({ name })),
      cursor: String(next),
      list_complete: next >= names.length,
    };
  }
}

/**
 * 毎回新しい疑似 binding とストレージを組み立てます。
 */
export function setup(): {
  binding: FakeKVNamespace;
  storage: CloudflareKv;
} {
  return setupWith({});
}

/**
 * 指定した引数で毎回新しい疑似 binding とストレージを組み立てます。
 */
export function setupWith(options: Omit<CloudflareKvOptions, "binding">): {
  binding: FakeKVNamespace;
  storage: CloudflareKv;
} {
  const binding = new FakeKVNamespace();

  return {
    binding,
    storage: new CloudflareKv({
      ...options,
      binding,
    }),
  };
}
