import { type IMiddleware, type IPipelineContext, KeyNotFoundError } from "@unikvs/core";

import { TtlInvalidValueError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl-input)
 */
export type TtlInput =
  | number
  | Date
  | {
      readonly ttl?: number | undefined;
      readonly expiresAt?: number | Date | undefined;
    };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl-options)
 */
export type TtlOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl-options-default-ttl)
   */
  readonly defaultTtl?: TtlInput | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl-options-now)
   */
  readonly now?: (() => number) | undefined;
};

/**
 * エンベロープの識別子です。
 */
const TTL_MARKER = "@unikvs/ttl";

/**
 * エンベロープの版数です。
 */
const TTL_VERSION = 1;

/**
 * 失効済みであることを写像に伝える操作内変数の名前です。
 */
const EXPIRED_FLAG = "@unikvs/ttl:expired";

/**
 * 失効済みキーの写像先に付ける接尾辞です。実在しないキーへの写像に使います。
 */
const DEAD_KEY_SUFFIX = "\0@unikvs/ttl:expired";

/**
 * 操作内に一時保存するメタデータの変数名の接頭辞です。
 *
 * ミドルウェアのインスタンスごとに固有の名前を使い、同じ操作内で複数の Ttl が共存しても衝突しないようにします。
 */
const STAGE_VAR_PREFIX = "@unikvs/ttl:stage:";

/**
 * モジュールごとに割り当てる、変数名の衝突を避けるための識別子です。
 *
 * `crypto.randomUUID` は安全なコンテキストでしか使えないため、環境に依存しない乱数と時刻から作ります。
 * モジュールが複数コピーされても、それぞれの連番に別の接頭辞が付くため衝突しません。
 */
const STAGE_VAR_MODULE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * モジュール内で Ttl インスタンスに割り当てる連番です。
 */
let stageVarSequence = 0;

/**
 * セットで確定待ちのメタデータです。
 */
type StagedSet = {
  readonly kind: "set";
  readonly expiresAt: number | undefined;
};

/**
 * コピー・移動で確定待ちのメタデータです。
 *
 * 転送元の期限は `use` の時点で固定せず、キーロック内の `afterUse` で記録から読み直します。
 */
type StagedTransfer = {
  readonly kind: "copy" | "move";
};

/**
 * 確定待ちのメタデータです。
 */
type StagedOperation = StagedSet | StagedTransfer;

/**
 * プレーン値に付ける有効期限エンベロープです。
 */
type TtlEnvelope = {
  readonly data: unknown;
  readonly expiresAt: number;
  readonly "@unikvs/ttl": 1;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
 */
export default class Ttl implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public static readonly TTL_VAR_NAME: string = "@unikvs/ttl:ttl";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public static readonly EXPIRES_AT_VAR_NAME: string = "@unikvs/ttl:expiresAt";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public readonly name: string = "Ttl";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public readonly defaultTtl: TtlInput | undefined;

  /**
   * 現在時刻 (epoch ミリ秒) を返す関数です。
   */
  readonly #now: () => number;

  /**
   * 論理キーごとの失効時刻 (epoch ミリ秒) の記録です。
   *
   * 読み取り前の `use` で失効を判定し、存在確認を不発にするために使います。
   * 永続側の真実はデータに同梱したエンベロープであり、こちらは操作内の高速判定用です。
   */
  readonly #expiry: Map<string, number>;

  /**
   * このインスタンスの確定待ちメタデータを保存する変数名です。
   */
  readonly #stageVarName: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public constructor(options: TtlOptions = {}) {
    const { now = Date.now, defaultTtl } = options;

    if (typeof now !== "function") {
      throw new TtlInvalidValueError({ actual: now });
    }

    if (defaultTtl !== undefined) {
      // 値の形状を構築時に検証します (相対値は解決し直すため結果は捨てます)。
      toExpiresAt(defaultTtl, now());
    }

    this.defaultTtl = defaultTtl;
    this.#now = now;
    this.#expiry = new Map();
    // インスタンスごとに一意な名前を使い、同じ操作内で複数の Ttl が共存しても衝突しないようにします。
    this.#stageVarName = createStageVarName();
  }

  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#ttl)
   */
  public mapKey(c: IMiddleware.MapKeyContext): string {
    // 失効済みの読み取り・存在確認は実在しないキーへ写像し、読み取りを不発にします。
    if (c.get(EXPIRED_FLAG) === true) {
      return `${c.key}${DEAD_KEY_SUFFIX}`;
    }

    return c.key;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    switch (c.action) {
      case "has":
      case "get":
      case "stream": {
        // 記録上で失効済みなら写像で不発にします。実判定は decode でも行います。
        const expiresAt = this.#expiry.get(c.key);

        if (expiresAt !== undefined && this.#isExpired(expiresAt)) {
          c.set(EXPIRED_FLAG, true);
        }

        break;
      }

      case "copy":
      case "move": {
        const expiresAt = this.#expiry.get(c.key);

        if (expiresAt !== undefined && this.#isExpired(expiresAt)) {
          // 失効済みのコピー元・移動元は実在しないキーへ写像し、存在確認を不発にします。
          // 記録は afterUse で操作が成功するまで残し、ストリームの失効情報を失わないようにします。
          c.set(EXPIRED_FLAG, true);
          break;
        }

        // 転送の成否が確定するまでメタデータを変更せず、操作の種類だけを操作内に保存します。
        // 転送元の期限は afterUse で記録から読み直し、use 後の並行 set による更新を反映します。
        this.#stage(c, {
          kind: c.action,
        });
        break;
      }

      case "set":
      case "delete":
      case "clear": {
        break;
      }
    }

    await next();
  }

  public async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    const expiresAt = this.#expiresAtFor(c);

    // 記録は書き込みの成否が確定するまで変更せず、操作内にだけ保存します。
    this.#stage(c, {
      kind: "set",
      expiresAt,
    });

    if (expiresAt === undefined) {
      // TTL なしの上書きではデータを透過させ、成功時に記録を消します。
      c.destination = c.source;
    } else {
      c.destination = Object.freeze({
        [TTL_MARKER]: TTL_VERSION,
        expiresAt,
        data: c.source,
      });
    }

    await next();
  }

  public async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    const envelope = isEnvelope(c.source) ? c.source : undefined;
    const expiresAt = envelope?.expiresAt ?? this.#expiry.get(c.key);

    if (expiresAt === undefined) {
      c.destination = c.source;

      await next();

      return;
    }

    // 遅延失効 : 読み取り時に期限切れを検出し、KeyNotFound 相当として扱います。
    if (this.#isExpired(expiresAt)) {
      this.#expiry.delete(c.key);

      throw new KeyNotFoundError({ key: c.key });
    }

    // 再起動後など記録が欠けているときは、エンベロープから記録を復元します。
    this.#expiry.set(c.key, expiresAt);
    c.destination = envelope === undefined ? c.source : envelope.data;

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    // ストリームは塊の型がストレージごとに制約されるため、帯域内に期限を埋め込まず、記録だけで管理します。いかなるストレージでも透過するためです。
    const expiresAt = this.#expiresAtFor(c);

    // 記録は書き込みの成否が確定するまで変更せず、操作内にだけ保存します。
    this.#stage(c, {
      kind: "set",
      expiresAt,
    });

    c.destination = c.source;

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    // 記録上で期限切れなら、ストリームを開く前に確定させます。
    // ストリームは帯域内に期限を持たないため、記録を消すと失効情報を二度と復元できません。削除は成功した set/delete/clear に委ねます。
    const expiresAt = this.#expiry.get(c.key);

    if (expiresAt !== undefined && this.#isExpired(expiresAt)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    c.destination = c.source;

    await next();
  }

  /**
   * ストレージ I/O が確定した後に、操作内に保存したメタデータを確定します。
   *
   * 失敗した操作や一部の宛先だけ失敗した操作では、原則として記録を変更しません。古いデータが残っている可能性があるためです。
   * ただし、ストレージの確定後に中断された操作でも、TTL の対象となる全宛先が `committed` なら記録を確定します。
   *
   * @param c 操作コンテキストです。
   * @param outcome 操作全体と宛先ごとの結果です。
   */
  public async afterUse(c: IMiddleware.UseContext, outcome: IMiddleware.UseOutcome): Promise<void> {
    switch (c.action) {
      case "set": {
        const staged = this.#staged(c);

        if (staged?.kind !== "set" || !isSuccessful(outcome, false)) {
          return;
        }

        this.#applyExpiry(c.key, staged.expiresAt);

        return;
      }

      case "copy": {
        if (c.key === c.destinationKey) {
          return;
        }

        const staged = this.#staged(c);

        // 一部の宛先が notFound や failed のときは、触れていない宛先の古い記録を復活させないよう変更しません。
        if (staged?.kind !== "copy" || !isSuccessful(outcome, false)) {
          return;
        }

        // キーロック内で転送元の現在の期限を読み直し、use 後の並行 set による更新を反映します。
        this.#applyExpiry(c.destinationKey, this.#expiry.get(c.key));

        return;
      }

      case "move": {
        if (c.key === c.destinationKey) {
          return;
        }

        const staged = this.#staged(c);

        // 一部の宛先が notFound や failed のときは、触れていない宛先の古い記録を復活させないよう変更しません。
        if (staged?.kind !== "move" || !isSuccessful(outcome, false)) {
          // 失敗・部分成功では移動元の記録を残します。移動先のメタデータは、全体が成功したときだけ確定します。
          return;
        }

        // キーロック内で転送元の現在の期限を読み直し、use 後の並行 set による更新を反映します。
        this.#applyExpiry(c.destinationKey, this.#expiry.get(c.key));
        this.#expiry.delete(c.key);

        return;
      }

      case "delete": {
        // 存在しないキーの削除も成功です。確定した宛先が 1 件もなくても記録を消します。
        if (!isSuccessful(outcome, true, false)) {
          return;
        }

        this.#expiry.delete(c.key);

        return;
      }

      case "clear": {
        // 一部の宛先だけ削除できた場合は、残っているキーの失効記録を消さないようにします。
        if (!isSuccessful(outcome, false)) {
          return;
        }

        this.#expiry.clear();

        return;
      }

      case "get":
      case "stream":
      case "has": {
        // 読み取り系では afterUse によるメタデータの確定を行いません。
        return;
      }
    }
  }

  /**
   * 失効時刻を過ぎているかを判定します。
   *
   * @param expiresAt 失効時刻 (epoch ミリ秒) です。
   *
   * @returns 失効済みのとき `true` を返します。
   */
  #isExpired(expiresAt: number): boolean {
    return this.#now() >= expiresAt;
  }

  /**
   * 操作内にメタデータを保存します。
   *
   * @param c 操作内変数を保持するコンテキストです。
   * @param staged 確定待ちのメタデータです。
   */
  #stage(c: IPipelineContext, staged: StagedOperation): void {
    c.set(this.#stageVarName, staged);
  }

  /**
   * 操作内に保存したメタデータを取得します。
   *
   * @param c 操作内変数を保持するコンテキストです。
   *
   * @returns 確定待ちのメタデータを返します。保存されていないときは `undefined` を返します。
   */
  #staged(c: IPipelineContext): StagedOperation | undefined {
    return c.get(this.#stageVarName) as StagedOperation | undefined;
  }

  /**
   * 記録を更新します。
   *
   * @param key 対象のキーです。
   * @param expiresAt 失効時刻 (epoch ミリ秒) です。`undefined` のときは記録を削除します。
   */
  #applyExpiry(key: string, expiresAt: number | undefined): void {
    if (expiresAt === undefined) {
      this.#expiry.delete(key);
    } else {
      this.#expiry.set(key, expiresAt);
    }
  }

  /**
   * 操作内変数と既定値から失効時刻 (epoch ミリ秒) を解決します。
   *
   * @param c 操作内変数を保持するコンテキストです。
   *
   * @returns 失効時刻を返します。TTL の指定がないときは `undefined` を返します。
   */
  #expiresAtFor(c: IPipelineContext): number | undefined {
    const ttl = firstDefined(c.get(Ttl.TTL_VAR_NAME), c.get("ttl"));
    let expiresAt: number | undefined = undefined;

    if (ttl !== undefined) {
      expiresAt = toExpiresAt(ttl, this.#now());
    } else {
      const rawExpiresAt = firstDefined(c.get(Ttl.EXPIRES_AT_VAR_NAME), c.get("expiresAt"));

      if (rawExpiresAt !== undefined) {
        expiresAt = toAbsolute(rawExpiresAt);
      } else if (this.defaultTtl !== undefined) {
        expiresAt = toExpiresAt(this.defaultTtl, this.#now());
      }
    }

    return expiresAt;
  }
}

/**
 * このインスタンスの確定待ちメタデータを保存する変数名を作成します。
 *
 * @returns インスタンスごとに一意な変数名を返します。
 */
function createStageVarName(): string {
  stageVarSequence += 1;

  return `${STAGE_VAR_PREFIX}${STAGE_VAR_MODULE_ID}:${stageVarSequence.toString(36)}`;
}

/**
 * 宛先ごとの結果がすべて成功しているかを判定します。
 *
 * @param outcome 操作全体と宛先ごとの結果です。
 * @param allowNotFound キー不在を成功として扱うかどうかです。
 * @param requireCommitted 確定した宛先が少なくとも 1 件必要かどうかです。
 *
 * @returns 失敗やスキップがなく、必要な確定件数を満たすとき `true` を返します。
 */
function isSuccessful(
  outcome: IMiddleware.UseOutcome,
  allowNotFound: boolean,
  requireCommitted = true,
): boolean {
  let committed = 0;

  for (const target of outcome.targets) {
    if (target.status === "committed") {
      committed += 1;
      continue;
    }

    if (allowNotFound && target.status === "notFound") {
      continue;
    }

    return false;
  }

  return committed > 0 || !requireCommitted;
}

/**
 * 名前空間付き変数を優先して、最初に定義されている値を返します。
 *
 * @param primary 名前空間付き変数の値です。
 * @param fallback 非名前空間名の値です。
 *
 * @returns 定義されている方の値を返します。
 */
function firstDefined<A, B>(primary: A | undefined, fallback: B | undefined): A | B | undefined {
  return primary ?? fallback;
}

/**
 * TTL 値を失効時刻 (epoch ミリ秒) に変換します。
 *
 * @param input 変換する TTL 値です。
 * @param now 現在時刻 (epoch ミリ秒) です。
 *
 * @returns 失効時刻を返します。
 */
function toExpiresAt(input: unknown, now: number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new TtlInvalidValueError({ actual: input });
    }

    const expiresAt = now + input * 1000;

    if (!Number.isFinite(expiresAt)) {
      throw new TtlInvalidValueError({ actual: input });
    }

    return expiresAt;
  }

  if (input instanceof Date) {
    return toAbsolute(input);
  }

  if (typeof input === "object" && input !== null) {
    const { ttl, expiresAt } = input as {
      readonly ttl?: unknown;
      readonly expiresAt?: unknown;
    };

    if (expiresAt !== undefined) {
      return toAbsolute(expiresAt);
    }

    if (ttl !== undefined) {
      if (typeof ttl !== "number" || !Number.isFinite(ttl)) {
        throw new TtlInvalidValueError({ actual: input });
      }

      const resolved = now + ttl * 1000;

      if (!Number.isFinite(resolved)) {
        throw new TtlInvalidValueError({ actual: input });
      }

      return resolved;
    }
  }

  throw new TtlInvalidValueError({ actual: input });
}

/**
 * 絶対失効時刻を epoch ミリ秒に変換します。
 *
 * @param input 変換する値です。
 *
 * @returns 失効時刻を返します。
 */
function toAbsolute(input: unknown): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new TtlInvalidValueError({ actual: input });
    }

    return input;
  }

  if (input instanceof Date) {
    const time = input.getTime();

    if (Number.isNaN(time)) {
      throw new TtlInvalidValueError({ actual: input });
    }

    return time;
  }

  throw new TtlInvalidValueError({ actual: input });
}

/**
 * プレーンオブジェクトかどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns レコードとして扱えるとき `true` を返します。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * プレーン値の有効期限エンベロープかどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns エンベロープのとき `true` を返します。
 */
function isEnvelope(value: unknown): value is TtlEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Object.keys(value).length === 3 &&
    value[TTL_MARKER] === TTL_VERSION &&
    typeof value["expiresAt"] === "number" &&
    "data" in value
  );
}
