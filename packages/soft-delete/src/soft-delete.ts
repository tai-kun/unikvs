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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete-retention-ms)
   */
  readonly retentionMs?: number | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
 */
export type TombstoneEntry = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  readonly key: string;

  /**
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
  /**
   * 同じミリ秒に作られた別の墓標と区別するための識別子です。
   *
   * この項目を持たない古い墓標は `deletedAt` で識別します。
   */
  readonly id?: string;

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
 * 墓標の識別子を発行するための連番です。
 */
let tombstoneIdSequence = 0;

/**
 * 墓標の識別子を作成します。
 *
 * 同じミリ秒に複数の墓標が作られても衝突しないようにします。
 *
 * @returns 墓標の識別子を返します。
 */
function createTombstoneId(): string {
  tombstoneIdSequence += 1;

  return `${Date.now().toString(36)}-${tombstoneIdSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

/**
 * 墓標を一意に識別する値を返します。
 *
 * @param record 識別する墓標の記録です。
 *
 * @returns 識別子を持つ墓標は識別子、持たない古い墓標は削除時刻を返します。
 */
function getTombstoneIdentity(record: TombstoneRecord): string | number {
  return record.id ?? record.deletedAt;
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public getReadable?: (c: IStorage.GetReadableContext) => Promise<IReadableStream>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public getWritable?: (c: IStorage.GetWritableContext) => Promise<IWritableStream>;

  /**
   * 削除墓標の実体を保持する下層ストレージです。
   */
  readonly #inner: IStorage;

  /**
   * キーごとのデータ操作を直列化する待ち行列の末尾です。
   *
   * 同じキーの操作だけを待たせ、異なるキーの操作は並行して進めます。
   */
  readonly #keyTails = new Map<string, Promise<void>>();

  /**
   * 台帳の読み書きを直列化する待ち行列の末尾です。
   *
   * データ本体の読み書きは含めません。
   */
  #registryTail: Promise<void> = Promise.resolve();

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

  public async use(_c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    // 削除の墓標化は下層ストレージ側で担い、ここでは全操作を透過させます。
    await next();
  }

  public async write(c: IStorage.WriteContext, data: unknown): Promise<void> {
    await this.#withKeyLock(c.key, async (): Promise<void> => {
      // 墓標への上書きは復活とみなします。
      // 先に値を書き、成功してから台帳を更新することで、台帳の更新に失敗しても幽霊項目として回収できます。
      const wasTombstone = isTombstoneRecord(await this.#readRaw(c.key, c));

      await this.#inner.write(c, data);

      if (wasTombstone) {
        await this.#removeRegistryEntryLocked(c.key, c);
      }
    });
  }

  public async read(c: IStorage.ReadContext): Promise<unknown> {
    const raw = await this.#inner.read(c);

    if (!isTombstoneRecord(raw)) {
      return raw;
    }

    if (this.#isExpired(raw)) {
      await this.#sweepTombstone(c.key, raw, true, c);
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
      await this.#sweepTombstone(c.key, raw, true, c);
    }

    return false;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    // 台帳自体は墓標化の対象外とし、そのまま委譲します。
    // 台帳の更新と競合しないよう、台帳ロックで直列化します。
    if (c.key === REGISTRY_KEY) {
      await this.#withRegistryLock(async (): Promise<void> => {
        await this.#inner.delete(c);
      });

      return;
    }

    await this.#withKeyLock(c.key, async (): Promise<void> => {
      let raw: unknown;

      try {
        // 下層へは同一キーの読み出しとして転送します。操作種別は下層では使いません。
        raw = await this.#inner.read(c as unknown as IStorage.ReadContext);
      } catch (ex) {
        if (ex instanceof KeyNotFoundError) {
          // 存在しないキーへの削除は下層の規約に委ねます。
          await this.#inner.delete(c);
          // 墓標が先に消えた古い台帳項目を掃除します。
          await this.#removeRegistryEntryLocked(c.key, c);

          return;
        }

        throw ex;
      }

      if (isTombstoneRecord(raw)) {
        // 二重削除は冪等に扱い、最初の削除時刻を保ちます。
        if (this.#isExpired(raw)) {
          await this.#sweepTombstoneLocked(c.key, raw, true, c);

          return;
        }

        // 墓標の書き込みに成功した後に台帳の追加が失敗した場合に備え、再削除でも台帳へ登録し直します。
        await this.#ensureRegistryEntryLocked(c.key, raw.deletedAt, c);

        return;
      }

      const record: TombstoneRecord = {
        id: createTombstoneId(),
        value: raw,
        hasValue: true,
        deletedAt: Date.now(),
        __tombstone: true,
      };
      // 先に墓標を書き、成功してから台帳を更新します。
      // 台帳の追加に失敗しても、再削除で台帳へ登録し直せます。
      // 下層へは同一キーへの書き込みとして転送します。操作種別は下層では使いません。
      await this.#inner.write(c as unknown as IStorage.WriteContext, record);
      await this.#addRegistryEntryLocked(c.key, record.deletedAt, c);
    });
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    await this.#inner.clear(c);
  }

  /**
   * 指定したキーの値を別のキーへ複製します。
   *
   * 下層ストレージの複製機能は墓標を考慮しないため使わず、読み出しを経由して墓標を除外します。
   *
   * @param c コピー元とコピー先のキーを持つコンテキストです。
   *
   * @returns コピーが完了したら解決します。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    // 同じキーへのコピーは有効な値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      await this.#requireLive(c);

      return;
    }

    // 読み出し経路を通すことで、墓標を存在しないキーとして扱います。
    const value = await this.read(c);
    // コピー先が墓標のときは通常の書き込みとして復活させます。
    await this.write(
      {
        ...this.#scopedKey(c, c.destinationKey),
        action: "set",
      } as unknown as IStorage.WriteContext,
      value,
    );
  }

  /**
   * 指定したキーの値を別のキーへ移動します。
   *
   * 移動先への書き込みが成功した後に移動元を墓標化するため、失敗時には移動元が残ります。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 移動が完了したら解決します。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    // 同じキーへの移動は有効な値の存在確認だけを行い、墓標化しません。
    if (c.key === c.destinationKey) {
      await this.#requireLive(c);

      return;
    }

    await this.copy(c);
    // 移動元は削除墓標として残し、復元できる状態にします。
    await this.delete({
      ...this.#scopedKey(c, c.key),
      action: "delete",
    } as unknown as IStorage.DeleteContext);
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
    // 墓標がないときはキーロックを取らずに失敗させます。
    const observed = await this.#readRaw(key, scope);

    if (!isTombstoneRecord(observed) || !observed.hasValue) {
      throw new TombstoneNotFoundError({ key });
    }

    // 読み出しから書き込みまでの間に別の書き込みが入ると、古い値で新しい値を上書きしてしまいます。
    // 書き込み直前にキーロック内で墓標を再検証し、観測した墓標のままのときだけ復元します。
    return this.#withKeyLock(key, async (): Promise<unknown> => {
      const raw = await this.#readRaw(key, scope);

      if (
        !isTombstoneRecord(raw) ||
        !raw.hasValue ||
        getTombstoneIdentity(raw) !== getTombstoneIdentity(observed)
      ) {
        throw new TombstoneNotFoundError({ key });
      }

      if (this.#isExpired(raw)) {
        await this.#sweepTombstoneLocked(key, raw, true, scope);
        throw new TombstoneNotFoundError({ key });
      }

      await this.#inner.write(
        {
          ...this.#scopedKey(scope, key),
          action: "set",
        } as unknown as IStorage.WriteContext,
        raw.value,
      );
      await this.#removeRegistryEntryLocked(key, scope);

      return raw.value;
    });
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
      // 台帳のスナップショット取得だけを台帳ロックで行い、各キーの削除はキーロックで行います。
      const registry = await this.#withRegistryLock(() => this.#loadRegistry(scope));
      let count = 0;

      for (const target of Object.keys(registry)) {
        if (await this.purge(target)) {
          count += 1;
        }
      }

      return count;
    }

    const scope = createStandaloneScope();
    // 読み出し後の競合を検出できるよう、墓標の識別子を確認してからキーロック内で削除します。
    const observed = await this.#readRaw(key, scope);

    if (!isTombstoneRecord(observed)) {
      // 削除と purge の競合などで墓標だけが消えた古い台帳項目を掃除します。
      await this.#withKeyLock(key, () => this.#removeRegistryEntryIfNotTombstoneLocked(key, scope));

      return false;
    }

    // purge は保持期限に関係なく対象を消しますが、読み出し後に新しい墓標ができていたらその墓標は消さず、実際に掃除できたかどうかを返します。
    return this.#sweepTombstone(key, observed, false, scope);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#soft-delete)
   */
  public async listTombstones(): Promise<readonly TombstoneEntry[]> {
    const scope = createStandaloneScope();
    // 台帳のスナップショット取得だけを台帳ロックで行い、各キーの読み出しと掃除はキーロックで行います。
    const registry = await this.#withRegistryLock(() => this.#loadRegistry(scope));
    const entries: TombstoneEntry[] = [];

    for (const key of Object.keys(registry)) {
      await this.#withKeyLock(key, async (): Promise<void> => {
        const raw = await this.#readRaw(key, scope);

        if (!isTombstoneRecord(raw)) {
          // 台帳だけが残った古い項目を掃除します。
          await this.#removeRegistryEntryIfNotTombstoneLocked(key, scope);

          return;
        }

        if (this.#isExpired(raw)) {
          await this.#sweepTombstoneLocked(key, raw, true, scope);

          return;
        }

        entries.push({
          key,
          deletedAt: raw.deletedAt,
        });
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
      await this.#sweepTombstone(c.key, raw, true, c);
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
    await this.#withKeyLock(key, () => this.#untrackIfOverwrittenLocked(key, c));
  }

  /**
   * 上書きで墓標が消えたときに台帳から外します。
   *
   * 呼び出し側でキーロックを保持している必要があります。
   *
   * @param key 対象のキーです。
   * @param c 実行時変数の範囲です。
   */
  async #untrackIfOverwrittenLocked(key: string, c: ContextScope): Promise<void> {
    const raw = await this.#readRaw(key, c);

    if (isTombstoneRecord(raw)) {
      // 上書き後に新しい墓標ができていたら、その墓標の台帳項目を残します。
      return;
    }

    await this.#removeRegistryEntryLocked(key, c);
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
   * 観測した墓標を下層と台帳から取り除きます。
   *
   * @param key 対象のキーです。
   * @param observed キーロック取得前に読み出した墓標の記録です。
   * @param requireExpired 保持期限切れの墓標だけを対象にするとき `true` です。
   * @param c 実行時変数の範囲です。
   *
   * @returns 実際に墓標を取り除いたとき `true` を返します。
   */
  async #sweepTombstone(
    key: string,
    observed: TombstoneRecord,
    requireExpired: boolean,
    c: ContextScope,
  ): Promise<boolean> {
    return this.#withKeyLock(key, () =>
      this.#sweepTombstoneLocked(key, observed, requireExpired, c),
    );
  }

  /**
   * 観測した墓標を下層と台帳から取り除きます。
   *
   * 呼び出し側でキーロックを保持している必要があります。
   *
   * @param key 対象のキーです。
   * @param observed 観測した墓標の記録です。キーロック取得前に読み出したものと、キーロック内で読み出したものの両方があります。
   * @param requireExpired 保持期限切れの墓標だけを対象にするとき `true` です。
   * @param c 実行時変数の範囲です。
   *
   * @returns 実際に墓標を取り除いたとき `true` を返します。
   */
  async #sweepTombstoneLocked(
    key: string,
    observed: TombstoneRecord,
    requireExpired: boolean,
    c: ContextScope,
  ): Promise<boolean> {
    // 読み出しからキーロック取得までの間に復元や上書き、再削除が起きた可能性があるため、ロック内で同じ墓標のままかを再確認します。
    const raw = await this.#readRaw(key, c);

    if (!isTombstoneRecord(raw)) {
      // 墓標でなくなっていたら有効値を消さず、台帳の項目だけを掃除します。
      await this.#removeRegistryEntryLocked(key, c);

      return false;
    }

    if (
      getTombstoneIdentity(raw) !== getTombstoneIdentity(observed) ||
      (requireExpired && !this.#isExpired(raw))
    ) {
      // 新しい墓標ができていたら、その値と台帳の項目を残します。
      return false;
    }

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

    await this.#removeRegistryEntryLocked(key, c);

    return true;
  }

  /**
   * 台帳へ項目を追加します。
   *
   * 呼び出し側でキーロックを保持している必要があります。台帳ロックは内部で取得します。
   *
   * @param key 対象のキーです。
   * @param deletedAt 削除時刻です。
   * @param c 実行時変数の範囲です。
   */
  async #addRegistryEntryLocked(key: string, deletedAt: number, c: ContextScope): Promise<void> {
    await this.#withRegistryLock(async (): Promise<void> => {
      const registry = await this.#loadRegistry(c);
      await this.#saveRegistry(
        {
          ...registry,
          [key]: { deletedAt },
        },
        c,
      );
    });
  }

  /**
   * 台帳に項目がないときだけ追加します。
   *
   * 墓標の書き込み後に台帳の追加が失敗した場合の再削除で、台帳の項目を復旧するために使用します。
   *
   * @param key 対象のキーです。
   * @param deletedAt 削除時刻です。
   * @param c 実行時変数の範囲です。
   */
  async #ensureRegistryEntryLocked(key: string, deletedAt: number, c: ContextScope): Promise<void> {
    await this.#withRegistryLock(async (): Promise<void> => {
      const registry = await this.#loadRegistry(c);

      if (Object.hasOwn(registry, key)) {
        return;
      }

      await this.#saveRegistry(
        {
          ...registry,
          [key]: { deletedAt },
        },
        c,
      );
    });
  }

  /**
   * 墓標が存在しないときだけ台帳から項目を取り除きます。
   *
   * 台帳の項目を確認した後に削除が墓標を追加した場合に、その項目を消さないようにします。
   *
   * 呼び出し側でキーロックを保持している必要があります。
   *
   * @param key 対象のキーです。
   * @param c 実行時変数の範囲です。
   */
  async #removeRegistryEntryIfNotTombstoneLocked(key: string, c: ContextScope): Promise<void> {
    if (isTombstoneRecord(await this.#readRaw(key, c))) {
      return;
    }

    await this.#removeRegistryEntryLocked(key, c);
  }

  /**
   * 台帳から項目を取り除きます。
   *
   * 呼び出し側でキーロックを保持している必要があります。台帳ロックは内部で取得します。
   *
   * @param key 対象のキーです。
   * @param c 実行時変数の範囲です。
   */
  async #removeRegistryEntryLocked(key: string, c: ContextScope): Promise<void> {
    await this.#withRegistryLock(async (): Promise<void> => {
      const registry = await this.#loadRegistry(c);

      if (!Object.hasOwn(registry, key)) {
        return;
      }

      const rest: RegistryRecord = Object.fromEntries(
        Object.entries(registry).filter(([entryKey]) => entryKey !== key),
      );
      await this.#saveRegistry(rest, c);
    });
  }

  /**
   * キーごとのデータ操作を直列化して実行します。
   *
   * 同じキーの操作だけを待たせ、異なるキーの操作は並行して進めます。
   * 直列化する範囲はこのインスタンス内だけです。同じ下層ストレージを共有する複数のインスタンス間では、データ操作が競合し得ます。
   *
   * @param key 対象のキーです。
   * @param fn 実行するデータ操作です。
   *
   * @returns 操作の結果を返します。
   */
  async #withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let release: (() => void) | undefined;
    const previous = this.#keyTails.get(key) ?? Promise.resolve();
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#keyTails.set(key, tail);
    await previous;

    try {
      return await fn();
    } finally {
      release?.();

      // 待ち行列が空になったキーだけを取り除き、待機中の操作を置き去りにしません。
      if (this.#keyTails.get(key) === tail) {
        this.#keyTails.delete(key);
      }
    }
  }

  /**
   * 台帳の読み書きを直列化して実行します。
   *
   * データ本体の読み書きは含めません。
   * 直列化する範囲はこのインスタンス内だけです。同じ下層ストレージを共有する複数のインスタンス間では、台帳の更新が競合し得ます。
   *
   * @param fn 実行する台帳操作です。
   *
   * @returns 操作の結果を返します。
   */
  async #withRegistryLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: (() => void) | undefined;
    const previous = this.#registryTail;
    this.#registryTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await fn();
    } finally {
      release?.();
    }
  }

  /**
   * 台帳を下層から読みます。
   *
   * 呼び出し側で台帳ロックを保持している必要があります。
   *
   * @param c 実行時変数の範囲です。
   *
   * @returns 台帳の複写を返します。
   */
  async #loadRegistry(c: ContextScope): Promise<RegistryRecord> {
    const raw = await this.#readRaw(REGISTRY_KEY, c);

    if (!isRegistryRecord(raw)) {
      return {};
    }

    return { ...raw };
  }

  /**
   * 台帳を下層へ保存します。
   *
   * 呼び出し側で台帳ロックを保持している必要があります。
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
