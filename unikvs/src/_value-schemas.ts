import type { GenericSchema } from "./_valibot.js";
import { union, safeParse } from "./_valibot.js";
import { InvalidInputError } from "./errors.js";
import type { PlainValue, StreamValue } from "./value-schemas.js";

// -------------------------------------------------------------------------------------------------。
//
// 値の型。
//
// -------------------------------------------------------------------------------------------------。

/**
 * PlainValue 型から内部のデータ型を抽出します。
 *
 * @template TPlainValue 対象となる PlainValue 型です。
 */
export type $InferPlainValueData<TPlainValue> =
  TPlainValue extends PlainValue<infer TData, any> ? TData : never;

/**
 * PlainValue 型から入力データの型を抽出します。
 *
 * @template TPlainValue 対象となる PlainValue 型です。
 */
export type $InferPlainValueInput<TPlainValue> =
  TPlainValue extends PlainValue<any, infer TInput> ? TInput : never;

/**
 * StreamValue 型から内部のチャンクデータ型を抽出します。
 *
 * @template TStreamValue 対象となる StreamValue 型です。
 */
export type $InferStreamValueChunkData<TStreamValue> =
  TStreamValue extends StreamValue<infer TChunkData, any> ? TChunkData : never;

/**
 * StreamValue 型から入力チャンクデータの型を抽出します。
 *
 * @template TStreamValue 対象となる StreamValue 型です。
 */
export type $InferStreamValueChunkInput<TStreamValue> =
  TStreamValue extends StreamValue<any, infer TChunkInput> ? TChunkInput : never;

/**
 * スキーマ付きの値であることを識別するためのブランドです。
 *
 * 同じライブラリーが複数読み込まれた環境でも認識できるようにグローバルシンボルを使用します。
 */
export const VALUE_SCHEMA_BRAND: unique symbol = /* #__PURE__ */ Symbol.for(
  "unikvs:VALUE_SCHEMA_BRAND",
);

/**
 * スキーマ付きの値が扱うデータの種類です。
 *
 * - `"plain"`: プレーンな値のみを扱います。
 * - `"stream"`: ストリーム形式の値のみを扱います。
 * - `"any"`: プレーンな値とストリーム形式の値のどちらも扱います。
 */
export type ValueSchemaKind = "plain" | "stream" | "any";

/**
 * キーに対応する値のスキーマ情報です。
 */
export type ValueSchemaInfo = {
  /**
   * 扱うデータの種類です。
   */
  readonly kind: ValueSchemaKind;

  /**
   * データの検証に使用するスキーマです。
   */
  readonly schema: GenericSchema;
};

// -------------------------------------------------------------------------------------------------。
//
// スキーマ定義。
//
// -------------------------------------------------------------------------------------------------。

/**
 * 検証済みのオブジェクト形式のスキーマ定義です。
 */
type UniKvsSchemaInfoRecord = Readonly<Record<string, ValueSchemaInfo>>;

/**
 * 検証済みの配列形式のスキーマ定義です。
 */
type UniKvsSchemaInfoEntries = readonly (readonly [GenericSchema, ValueSchemaInfo])[];

/**
 * 検証済みのスキーマ定義です。
 */
type UniKvsSchemaInfo = UniKvsSchemaInfoRecord | UniKvsSchemaInfoEntries;

// -------------------------------------------------------------------------------------------------。
//
// スキーマリゾルバー。
//
// -------------------------------------------------------------------------------------------------。

/**
 * キーに対応する値のスキーマ情報を解決するインターフェースです。
 */
export interface IValueSchemaResolver {
  /**
   * キーに対応する値のスキーマ情報を返します。
   *
   * @param key 解決するキーです。
   *
   * @returns 対応するスキーマ情報を返します。対応する定義がない場合は `undefined` を返します。
   *
   * @throws キーがどのキースキーマにも一致しない場合に `InvalidInputError` を投げます。
   */
  resolve(key: string): ValueSchemaInfo | undefined;
}

/**
 * オブジェクト形式のスキーマ定義からスキーマ情報を解決します。
 */
class RecordValueSchemaResolver implements IValueSchemaResolver {
  readonly #entries: Map<string, ValueSchemaInfo>;

  public constructor(entries: UniKvsSchemaInfoRecord) {
    this.#entries = new Map(Object.entries(entries));
  }

  public resolve(key: string): ValueSchemaInfo | undefined {
    return this.#entries.get(key);
  }
}

/**
 * 配列形式のスキーマ定義からスキーマ情報を解決します。
 *
 * キースキーマに最初に一致した定義を採用します。
 */
class EntriesValueSchemaResolver implements IValueSchemaResolver {
  readonly #entries: UniKvsSchemaInfoEntries;

  readonly #keySchema: GenericSchema | undefined;

  public constructor(entries: UniKvsSchemaInfoEntries) {
    this.#entries = entries;
    if (entries.length > 0) {
      this.#keySchema = union(entries.map(([keySchema]) => keySchema));
    }
  }

  public resolve(key: string): ValueSchemaInfo | undefined {
    let resolved: ValueSchemaInfo | undefined;

    for (const [keySchema, valueSchema] of this.#entries) {
      const result = safeParse(keySchema, key);

      if (result.success) {
        resolved = valueSchema;
        break;
      }
    }

    if (resolved === undefined && this.#keySchema) {
      const result = safeParse(this.#keySchema, key);

      if (!result.success) {
        throw new InvalidInputError({
          value: key,
          issues: result.issues,
        });
      }
    }

    return resolved;
  }
}

/**
 * 検証済みのスキーマ定義からスキーマリゾルバーを生成します。
 *
 * @param schema 検証済みのスキーマ定義です。
 *
 * @returns スキーマリゾルバーを返します。
 */
export function createValueSchemaResolver(schema: UniKvsSchemaInfo): IValueSchemaResolver {
  if (Array.isArray(schema)) {
    return new EntriesValueSchemaResolver(schema);
  }

  return new RecordValueSchemaResolver(schema);
}
