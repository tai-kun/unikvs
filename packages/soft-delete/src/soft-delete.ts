import {
  type IStorage,
  type IMiddleware,
  type IReadableStream,
  type IWritableStream,
  KeyNotFoundError,
} from "@unikvs/core";
import { PassThrough } from "@unikvs/passthrough";

import { TombstoneNotFoundError, SoftDeleteInvalidRetentionError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
 */
export type SoftDeleteOptions = {
  /**
   * 削除墓標を保持する期間 (ミリ秒) です。未指定なら保持し続けます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete-retention-ms)
   */
  readonly retentionMs?: number | undefined;
};

/**
 * `listTombstones` が返す削除墓標の 1 件分です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
 */
export type TombstoneEntry = {
  /**
   * 削除されたキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  readonly key: string;

  /**
   * 削除された時刻 (UNIX エポックからのミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  readonly deletedAt: number;
};

/**
 * 削除墓標として下層ストレージへ書き込む記録の形式です。
 *
 * 同じ下層ストレージへ通常値と同じキーで保存するため、レプリカへも複製されます。
 * 値のスナップショットを含むため、復元でデータを戻せます。
 */
type TombstoneRecord = {
  readonly value: unknown;
  readonly hasValue: boolean;
  readonly deletedAt: number;
  readonly __tombstone: true;
};

/**
 * 削除墓標の一覧を下層ストレージへ保持する台帳の形式です。
 */
type RegistryRecord = Readonly<Record<string, { readonly deletedAt: number }>>;

/**
 * 削除墓標の一覧を下層ストレージへ保持するときの予約キーです。
 */
const REGISTRY_KEY = "__unikvs_soft_delete_registry__";

/**
 * 削除墓標の記録かどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns 削除墓標の記録のとき `true` を返します。
 */
function isTombstoneRecord(value: unknown): value is TombstoneRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Partial<TombstoneRecord>;

  return record.__tombstone === true && typeof record.deletedAt === "number";
}

/**
 * 台帳の記録かどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns 台帳の記録のとき `true` を返します。
 */
function isRegistryRecord(value: unknown): value is RegistryRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { readonly deletedAt?: unknown }).deletedAt === "number",
  );
}

/**
 * 台帳操作のために転送する実行時変数の範囲です。
 */
type ContextScope = {
  get(name: string): unknown;
  set(name: string, value: unknown): unknown;
  readonly signal: AbortSignal;
  setReadonly(name: string, value: unknown): unknown;
};

/**
 * 下層ストレージへの操作に使う独立した変数範囲を作成します。
 *
 * パイプライン外の `restore`/`purge`/`listTombstones` から使う、中断されず変数を持たない範囲です。
 *
 * @returns 独立した変数範囲を返します。
 */
function createStandaloneScope(): ContextScope {
  return {
    get: (): unknown => undefined,
    set: (): unknown => undefined,
    signal: new AbortController().signal,
    setReadonly: (): unknown => undefined,
  };
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
 */
export default class SoftDelete extends PassThrough implements IMiddleware, IStorage {
  public override readonly name: string = "SoftDelete";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public readonly retentionMs: number | undefined;

  /**
   * 削除墓標の実体を保持する下層ストレージです。
   */
  readonly #inner: IStorage;

  /**
   * 下層ストレージが対応している場合の読み取りストリーム取得関数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public getReadable?: (c: IStorage.GetReadableContext) => Promise<IReadableStream>;

  /**
   * 下層ストレージが対応している場合の書き込みストリーム取得関数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public getWritable?: (c: IStorage.GetWritableContext) => Promise<IWritableStream>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public constructor(storage: IStorage, options: SoftDeleteOptions = {}) {
    super();

    const { retentionMs } = options;

    if (
      retentionMs !== undefined &&
      (typeof retentionMs !== "number" ||
        Number.isNaN(retentionMs) ||
        !Number.isFinite(retentionMs) ||
        retentionMs < 0)
    ) {
      throw new SoftDeleteInvalidRetentionError({ actual: retentionMs });
    }

    this.#inner = storage;
    this.retentionMs = retentionMs;

    // ストリーム対応は下層ストレージの能力をそのまま引き継ぎます。
    // 対応しないときは未定義のままにし、呼び出し側の既定の非対応エラーを活かします。
    const getReadable = storage.getReadable?.bind(storage);

    if (getReadable !== undefined) {
      this.getReadable = async (c: IStorage.GetReadableContext): Promise<IReadableStream> => {
        await this.#requireLive(c);

        return getReadable(c);
      };
    }

    const getWritable = storage.getWritable?.bind(storage);

    if (getWritable !== undefined) {
      this.getWritable = async (c: IStorage.GetWritableContext): Promise<IWritableStream> => {
        const writable = await getWritable(c);
        const writer = writable.getWriter();

        return new WritableStream({
          abort: (reason?: unknown): Promise<void> => writer.abort(reason),
          close: async (): Promise<void> => {
            await writer.close();
            // 確定した書き込みで墓標が上書きされたときだけ、台帳から外します。
            await this.#untrackIfOverwritten(c.key, c);
          },
          write: (chunk: unknown): Promise<void> => writer.write(chunk),
        });
      };
    }
  }

  public override get isOpen(): boolean {
    return this.#inner.isOpen;
  }

  public override async decode(
    c: IMiddleware.DecodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    // 墓標が読み出し経路へ紛れ込んだときは、存在しないキーとして扱います。
    // 通常はストレージ側で除外されるため、ここは複製先などの直接読み出しへの備えです。
    if (isTombstoneRecord(c.source)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    await super.decode(c, next);
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    // 削除の墓標化は下層ストレージ側で担い、ここでは全操作を透過させます。
    switch (c.action) {
      case "set":
      case "get":
      case "stream":
      case "has":
      case "delete":
      case "clear": {
        break;
      }
    }

    await next();
  }

  public async write(c: IStorage.WriteContext, data: unknown): Promise<void> {
    // 墓標への上書きは復活とみなし、台帳から外してから委譲します。
    await this.#untrackIfOverwritten(c.key, c);
    await this.#inner.write(c, data);
  }

  public async read(c: IStorage.ReadContext): Promise<unknown> {
    const raw = await this.#inner.read(c);

    if (!isTombstoneRecord(raw)) {
      return raw;
    }

    if (this.#isExpired(raw)) {
      await this.#sweepTombstone(c.key, c);
    }

    throw new KeyNotFoundError({ key: c.key });
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    if (!(await this.#inner.exists(c))) {
      return false;
    }

    let raw: unknown;

    try {
      // 下層へは同一キーの読み出しとして転送します。操作種別は下層では使いません。
      raw = await this.#inner.read(c as unknown as IStorage.ReadContext);
    } catch (ex) {
      // 読み出しと存在確認の隙間で消えたときは、存在しないものとして扱います。
      if (ex instanceof KeyNotFoundError) {
        return false;
      }

      throw ex;
    }

    if (!isTombstoneRecord(raw)) {
      return true;
    }

    if (this.#isExpired(raw)) {
      await this.#sweepTombstone(c.key, c);
    }

    return false;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    // 台帳自体は墓標化の対象外とし、そのまま委譲します。
    if (c.key === REGISTRY_KEY) {
      await this.#inner.delete(c);

      return;
    }

    let raw: unknown;

    try {
      // 下層へは同一キーの読み出しとして転送します。操作種別は下層では使いません。
      raw = await this.#inner.read(c as unknown as IStorage.ReadContext);
    } catch (ex) {
      if (ex instanceof KeyNotFoundError) {
        // 存在しないキーへの削除は下層の規約に委ねます。
        await this.#inner.delete(c);

        return;
      }

      throw ex;
    }

    if (isTombstoneRecord(raw)) {
      // 二重削除は冪等に扱い、最初の削除時刻を保ちます。
      if (this.#isExpired(raw)) {
        await this.#sweepTombstone(c.key, c);
      }

      return;
    }

    const record: TombstoneRecord = {
      value: raw,
      hasValue: true,
      deletedAt: Date.now(),
      __tombstone: true,
    };
    // 下層へは同一キーへの書き込みとして転送します。操作種別は下層では使いません。
    await this.#inner.write(c as unknown as IStorage.WriteContext, record);
    await this.#addRegistryEntry(c.key, record.deletedAt, c);
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    await this.#inner.clear(c);
  }

  public async onOtherWriteError(
    c: IStorage.OtherWriteErrorHandlerContext,
    errors: readonly IStorage.IOtherWriteError[],
  ): Promise<void> {
    await this.#inner.onOtherWriteError?.(c, errors);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public async restore(key: string): Promise<unknown> {
    const scope = createStandaloneScope();
    const raw = await this.#readRaw(key, scope);

    if (!isTombstoneRecord(raw) || !raw.hasValue) {
      throw new TombstoneNotFoundError({ key });
    }

    if (this.#isExpired(raw)) {
      await this.#sweepTombstone(key, scope);
      throw new TombstoneNotFoundError({ key });
    }

    await this.#inner.write(
      {
        ...this.#scopedKey(scope, key),
        action: "set",
      } as unknown as IStorage.WriteContext,
      raw.value,
    );
    await this.#removeRegistryEntry(key, scope);

    return raw.value;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public async purge(): Promise<number>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public async purge(key: string): Promise<boolean>;
  public async purge(key?: string): Promise<number | boolean> {
    if (key === undefined) {
      const scope = createStandaloneScope();
      const registry = await this.#loadRegistry(scope);
      let count = 0;

      for (const target of Object.keys(registry)) {
        if (await this.purge(target)) {
          count += 1;
        }
      }

      return count;
    }

    const scope = createStandaloneScope();
    const raw = await this.#readRaw(key, scope);

    if (!isTombstoneRecord(raw)) {
      return false;
    }

    await this.#sweepTombstone(key, scope);

    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public async listTombstones(): Promise<readonly TombstoneEntry[]> {
    const scope = createStandaloneScope();
    const registry = await this.#loadRegistry(scope);
    const entries: TombstoneEntry[] = [];

    for (const key of Object.keys(registry)) {
      const raw = await this.#readRaw(key, scope);

      if (!isTombstoneRecord(raw)) {
        // 台帳だけが残った古い項目を掃除します。
        await this.#removeRegistryEntry(key, scope);
        continue;
      }

      if (this.#isExpired(raw)) {
        await this.#sweepTombstone(key, scope);
        continue;
      }

      entries.push({
        key,
        deletedAt: raw.deletedAt,
      });
    }

    entries.sort((a, b) => a.deletedAt - b.deletedAt || (a.key < b.key ? -1 : 1));

    return entries;
  }

  /**
   * キーが有効な値を持つことを検証し、下層の生値を返します。
   *
   * 墓標のときは存在しないキーとして投げます。
   *
   * @param c 検証する読み出し系のコンテキストです。
   *
   * @returns 墓標でないときの下層の生値を返します。
   */
  async #requireLive(c: IStorage.ReadContext | IStorage.GetReadableContext): Promise<unknown> {
    const raw = await this.#inner.read(c as unknown as IStorage.ReadContext);

    if (!isTombstoneRecord(raw)) {
      return raw;
    }

    if (this.#isExpired(raw)) {
      await this.#sweepTombstone(c.key, c);
    }

    throw new KeyNotFoundError({ key: c.key });
  }

  /**
   * 上書きで墓標が消えたときに台帳から外します。
   *
   * @param key 対象のキーです。
   * @param c 実行時変数の範囲です。
   */
  async #untrackIfOverwritten(key: string, c: ContextScope): Promise<void> {
    const raw = await this.#readRaw(key, c);

    if (!isTombstoneRecord(raw)) {
      return;
    }

    await this.#removeRegistryEntry(key, c);
  }

  /**
   * 下層から生値を読みます。存在しないときは `undefined` を返します。
   *
   * @param key 対象のキーです。
   * @param c 実行時変数の範囲です。
   *
   * @returns 生値または `undefined` を返します。
   */
  async #readRaw(key: string, c: ContextScope): Promise<unknown> {
    let result: unknown = undefined;

    try {
      result = await this.#inner.read({
        ...this.#scopedKey(c, key),
        action: "get",
        repair: {
          enabled: false,
          targets: [],
        },
      } as unknown as IStorage.ReadContext);
    } catch (ex) {
      if (!(ex instanceof KeyNotFoundError)) {
        throw ex;
      }
    }

    return result;
  }

  /**
   * 墓標を下層と台帳から取り除きます。
   *
   * @param key 対象のキーです。
   * @param c 実行時変数の範囲です。
   */
  async #sweepTombstone(key: string, c: ContextScope): Promise<void> {
    try {
      await this.#inner.delete({
        ...this.#scopedKey(c, key),
        action: "delete",
      } as unknown as IStorage.DeleteContext);
    } catch (ex) {
      if (!(ex instanceof KeyNotFoundError)) {
        throw ex;
      }
    }

    await this.#removeRegistryEntry(key, c);
  }

  /**
   * 台帳へ項目を追加します。
   *
   * @param key 対象のキーです。
   * @param deletedAt 削除時刻です。
   * @param c 実行時変数の範囲です。
   */
  async #addRegistryEntry(key: string, deletedAt: number, c: ContextScope): Promise<void> {
    const registry = await this.#loadRegistry(c);
    await this.#saveRegistry(
      {
        ...registry,
        [key]: { deletedAt },
      },
      c,
    );
  }

  /**
   * 台帳から項目を取り除きます。
   *
   * @param key 対象のキーです。
   * @param c 実行時変数の範囲です。
   */
  async #removeRegistryEntry(key: string, c: ContextScope): Promise<void> {
    const registry = await this.#loadRegistry(c);

    if (!(key in registry)) {
      return;
    }

    const rest: RegistryRecord = Object.fromEntries(
      Object.entries(registry).filter(([entryKey]) => entryKey !== key),
    );
    await this.#saveRegistry(rest, c);
  }

  /**
   * 台帳を下層から読みます。
   *
   * @param c 実行時変数の範囲です。
   *
   * @returns 台帳の複写を返します。
   */
  async #loadRegistry(c: ContextScope): Promise<RegistryRecord> {
    let raw: unknown;

    try {
      raw = await this.#inner.read({
        ...this.#scopedKey(c, REGISTRY_KEY),
        action: "get",
        repair: {
          enabled: false,
          targets: [],
        },
      } as unknown as IStorage.ReadContext);
    } catch (ex) {
      if (ex instanceof KeyNotFoundError) {
        return {};
      }

      throw ex;
    }

    if (!isRegistryRecord(raw)) {
      return {};
    }

    return { ...raw };
  }

  /**
   * 台帳を下層へ保存します。
   *
   * @param registry 保存する台帳です。
   * @param c 実行時変数の範囲です。
   */
  async #saveRegistry(registry: RegistryRecord, c: ContextScope): Promise<void> {
    await this.#inner.write(
      {
        ...this.#scopedKey(c, REGISTRY_KEY),
        action: "set",
      } as unknown as IStorage.WriteContext,
      registry,
    );
  }

  /**
   * 台帳操作のために下層へ渡すキーを差し替えた変数範囲を作成します。
   *
   * @param c 元の実行時変数の範囲です。
   * @param key 差し替えるキーです。
   *
   * @returns キーを差し替えた変数範囲を返します。
   */
  #scopedKey(c: ContextScope, key: string): ContextScope & { readonly key: string } {
    return {
      get: (name: string): unknown => c.get(name),
      key,
      set: (name: string, value: unknown): unknown => c.set(name, value),
      signal: c.signal,
      setReadonly: (name: string, value: unknown): unknown => c.setReadonly(name, value),
    };
  }

  /**
   * 墓標が保持期限を過ぎているかを判定します。
   *
   * @param record 判定する墓標の記録です。
   *
   * @returns 期限切れのとき `true` を返します。
   */
  #isExpired(record: TombstoneRecord): boolean {
    return this.retentionMs !== undefined && Date.now() - record.deletedAt > this.retentionMs;
  }
}
