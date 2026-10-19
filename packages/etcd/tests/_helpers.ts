import type { IStorage } from "@unikvs/core";
import { createCloseContext, createOpenContext } from "@unikvs/testing";

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
 */
export class FakeEtcdClient implements EtcdClientLike {
  readonly store = new Map<string, Buffer>();

  readonly puts: RecordedPut[] = [];

  readonly deletedPrefixes: string[] = [];

  public deletePrefix?: (prefix: string) => Promise<void>;

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
    this.puts.push({ key, value: Buffer.from(data), options });
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async getAll(prefix: string): Promise<Map<string, Buffer>> {
    const out = new Map<string, Buffer>();
    for (const [key, value] of this.store) {
      if (key.startsWith(prefix)) {
        out.set(key, value);
      }
    }

    return out;
  }
}

export type StorageFixture = {
  readonly client: FakeEtcdClient;
  readonly storage: Etcd;
  readonly keyPrefix: string;
  readonly signal: AbortSignal;
};

/**
 * テストごとに独立したキー空間を持つ open 済みストレージを作ります。
 */
export async function createStorage(
  init: {
    readonly keyPrefix?: string | undefined;
    readonly namespace?: string | undefined;
    readonly leaseTtlSeconds?: number | undefined;
    readonly supportsDeletePrefix?: boolean | undefined;
  } = {},
): Promise<StorageFixture> {
  const {
    keyPrefix = `unikvs-test-${crypto.randomUUID()}:`,
    namespace,
    leaseTtlSeconds,
    supportsDeletePrefix = true,
  } = init;
  const client = new FakeEtcdClient(supportsDeletePrefix);
  const storage = new Etcd({ client, keyPrefix, namespace, leaseTtlSeconds });
  await storage.open(createOpenContext() as IStorage.OpenContext);

  return { client, storage, keyPrefix, signal: new AbortController().signal };
}

/**
 * 開いたストレージを閉じます。未開封でも何もしません。
 */
export async function closeStorage(storage: Etcd): Promise<void> {
  if (storage.isOpen) {
    await storage.close(createCloseContext() as IStorage.CloseContext);
  }
}
