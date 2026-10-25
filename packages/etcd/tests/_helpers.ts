import type { IStorage } from "@unikvs/core";
import { createOpenContext, createCloseContext } from "@unikvs/testing";

import Etcd, { type EtcdClientLike, type EtcdPutOptions } from "../src/etcd.js";

export type RecordedPut = {
  readonly key: string;
  readonly value: Buffer;
  readonly options: EtcdPutOptions | undefined;
};

/**
 * `EtcdClientLike` を満たすインメモリーフェイクです。
 *
 * 実サーバーなしで CRUD・TTL 付与・接頭辞削除の振る舞いを検証します。
 * リースの失効は etcd 側の責務のため再現しません。実装は `etcd3` の `autoKeepAlive` (既定で有効) を使うため、開いている間はキーが残ります。
 */
export class FakeEtcdClient implements EtcdClientLike {
  readonly store = new Map<string, Buffer>();

  readonly puts: RecordedPut[] = [];

  readonly deletedPrefixes: string[] = [];

  public deletePrefix?: (prefix: string) => Promise<void>;

  public closeCalls = 0;

  public constructor(supportsDeletePrefix = true) {
    if (supportsDeletePrefix) {
      this.deletePrefix = async (prefix: string): Promise<void> => {
        for (const key of this.store.keys()) {
          if (key.startsWith(prefix)) {
            this.store.delete(key);
          }
        }

        this.deletedPrefixes.push(prefix);
      };
    }
  }

  public async get(key: string): Promise<Buffer | null> {
    const value = this.store.get(key);

    return value === undefined ? null : Buffer.from(value);
  }

  public async put(
    key: string,
    value: Uint8Array | string | Buffer,
    options?: EtcdPutOptions,
  ): Promise<void> {
    const data = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
    this.store.set(key, data);
    this.puts.push({
      key,
      value: Buffer.from(data),
      options,
    });
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async getAll(prefix: string): Promise<Map<string, Buffer>> {
    const out = new Map<string, Buffer>();

    for (const [key, value] of this.store) {
      if (key.startsWith(prefix)) {
        // 呼び出し側の変更が保存値へ波及しないよう複写して返す。
        out.set(key, Buffer.from(value));
      }
    }

    return out;
  }

  public close(): void {
    this.closeCalls += 1;
  }
}

export type StorageFixture = {
  readonly client: FakeEtcdClient;
  readonly signal: AbortSignal;
  readonly storage: Etcd;
  readonly keyPrefix: string;
};

/**
 * テストごとに独立したキー空間を持つ open 済みストレージを作ります。
 *
 * `client` を渡すと複数のストレージで同じバックエンドを共有できます。
 * その場合のキー空間は `keyPrefix` と `namespace` で分離してください。
 * `client` を渡したときは `supportsDeletePrefix` は使われません。
 */
export async function createStorage(
  init: {
    readonly client?: FakeEtcdClient | undefined;
    readonly keyPrefix?: string | undefined;
    readonly namespace?: string | undefined;
    readonly leaseTtlSeconds?: number | undefined;
    readonly supportsDeletePrefix?: boolean | undefined;
  } = {},
): Promise<StorageFixture> {
  const {
    client: injected,
    keyPrefix = `unikvs-test-${crypto.randomUUID()}:`,
    namespace,
    leaseTtlSeconds,
    supportsDeletePrefix = true,
  } = init;
  const client = injected ?? new FakeEtcdClient(supportsDeletePrefix);
  const storage = new Etcd({
    client,
    keyPrefix,
    namespace,
    leaseTtlSeconds,
  });
  await storage.open(createOpenContext() as IStorage.OpenContext);

  return {
    client,
    signal: new AbortController().signal,
    storage,
    keyPrefix,
  };
}

/**
 * 開いたストレージを閉じます。未開封でも何もしません。
 */
export async function closeStorage(storage: Etcd): Promise<void> {
  if (storage.isOpen) {
    await storage.close(createCloseContext() as IStorage.CloseContext);
  }
}
