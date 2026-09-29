import * as v from "./_valibot.js";
import { InvalidInputError } from "./errors.js";

// -------------------------------------------------------------------------------------------------
//
// 値の型
//
// -------------------------------------------------------------------------------------------------

/**
 * プレーンな値を識別するための固有のシンボルです。
 */
declare const PLAIN_VALUE: unique symbol;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 *
 * @template TData 入出力されるデータの型です。
 * @template TInput `set` が受け付ける入力データの型です。
 */
export type PlainValue<TData = any, TInput = TData> = [
  Type: typeof PLAIN_VALUE,
  Data: TData,
  Input: TInput,
];

/**
 * ストリーム形式の値を識別するための固有のシンボルです。
 */
declare const STREAM_VALUE: unique symbol;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 *
 * @template TChunkData 入出力されるチャンクデータの型です。
 * @template TChunkInput `set` が受け付ける入力チャンクデータの型です。
 */
export type StreamValue<TChunkData = any, TChunkInput = TChunkData> = [
  Type: typeof STREAM_VALUE,
  ChunkData: TChunkData,
  ChunkInput: TChunkInput,
];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 *
 * @template TDataAndChunkData データまたはチャンクデータの型です。
 * @template TInput `set` が受け付ける入力データまたは入力チャンクデータの型です。
 */
export type Value<TDataAndChunkData = any, TInput = TDataAndChunkData> =
  | PlainValue<TDataAndChunkData, TInput>
  | StreamValue<TDataAndChunkData, TInput>;

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

// -------------------------------------------------------------------------------------------------
//
// 値のスキーマ
//
// -------------------------------------------------------------------------------------------------

/**
 * スキーマ付きの値であることを識別するためのブランドです。
 *
 * 同じライブラリーが複数読み込まれた環境でも認識できるようにグローバルシンボルを使用します。
 */
const VALUE_SCHEMA_BRAND: unique symbol = Symbol.for("unikvs.valueSchema");

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
  readonly schema: v.GenericSchema;
};

/**
 * スキーマ付きの値を表す内部オブジェクトです。
 */
type ValueSchemaDescriptor = ValueSchemaInfo & {
  readonly [VALUE_SCHEMA_BRAND]: true;
};

/**
 * 値が Valibot のスキーマであるかどうかを判定します。
 */
function isGenericSchema(input: unknown): input is v.GenericSchema {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as { readonly ["~run"]?: unknown })["~run"] === "function"
  );
}

/**
 * 値がスキーマ情報であるかどうかを判定します。
 */
function isValueSchemaInfo(input: unknown): input is ValueSchemaInfo {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as { readonly [VALUE_SCHEMA_BRAND]?: unknown })[VALUE_SCHEMA_BRAND] === true
  );
}

/**
 * スキーマ情報を内部オブジェクトとして生成します。
 */
function createValueSchemaDescriptor(
  kind: ValueSchemaKind,
  schema: v.GenericSchema,
): ValueSchemaDescriptor {
  return { [VALUE_SCHEMA_BRAND]: true, kind, schema };
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 *
 * プレーンな値のスキーマを定義します。
 *
 * @template TSchema スキーマの型です。
 * @param schema 値の検証に使用する Valibot スキーマです。
 * @returns プレーンな値であることを示す型情報を返します。
 */
export function PlainValue<const TSchema extends v.GenericSchema>(
  schema: TSchema,
): PlainValue<v.InferOutput<TSchema>, v.InferInput<TSchema>> {
  return createValueSchemaDescriptor("plain", schema) as unknown as PlainValue<
    v.InferOutput<TSchema>,
    v.InferInput<TSchema>
  >;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 *
 * ストリーム形式の値のスキーマを定義します。
 *
 * @template TSchema スキーマの型です。
 * @param schema チャンクデータの検証に使用する Valibot スキーマです。
 * @returns ストリーム形式の値であることを示す型情報を返します。
 */
export function StreamValue<const TSchema extends v.GenericSchema>(
  schema: TSchema,
): StreamValue<v.InferOutput<TSchema>, v.InferInput<TSchema>> {
  return createValueSchemaDescriptor("stream", schema) as unknown as StreamValue<
    v.InferOutput<TSchema>,
    v.InferInput<TSchema>
  >;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 *
 * プレーンな値とストリーム形式の値の両方で使えるスキーマを定義します。
 *
 * @template TSchema スキーマの型です。
 * @param schema データとチャンクデータの検証に使用する Valibot スキーマです。
 * @returns どちらの形式でも使える値であることを示す型情報を返します。
 */
export function Value<const TSchema extends v.GenericSchema>(
  schema: TSchema,
): Value<v.InferOutput<TSchema>, v.InferInput<TSchema>> {
  return createValueSchemaDescriptor("any", schema) as unknown as Value<
    v.InferOutput<TSchema>,
    v.InferInput<TSchema>
  >;
}

// -------------------------------------------------------------------------------------------------
//
// スキーマ定義
//
// -------------------------------------------------------------------------------------------------

/**
 * オブジェクト形式のスキーマ定義です。キーをそのままキーとして扱います。
 */
export type UniKvsSchemaRecord = { readonly [key: string]: Value<any, any> };

/**
 * 配列形式のスキーマ定義です。キーのスキーマと値のスキーマの組を並べます。
 */
export type UniKvsSchemaEntries = readonly (readonly [v.GenericSchema, Value<any, any>])[];

/**
 * `UniKvs.config()` の `schema` オプションに指定できるスキーマ定義です。
 */
export type UniKvsSchema = UniKvsSchemaRecord | UniKvsSchemaEntries;

/**
 * スキーマ定義からキーと値のマッピング型を推論します。
 *
 * @template TSchema 対象となるスキーマ定義の型です。
 */
export type $InferKeyValueMapping<TSchema extends UniKvsSchema> =
  TSchema extends readonly (readonly [v.GenericSchema, infer TValue extends Value<any, any>])[]
    ? { readonly [key: string]: TValue }
    : TSchema extends { readonly [key: string]: Value<any, any> }
      ? { readonly [TKey in keyof TSchema]: TSchema[TKey] }
      : never;

/**
 * 検証済みのオブジェクト形式のスキーマ定義です。
 */
export type UniKvsSchemaInfoRecord = { readonly [key: string]: ValueSchemaInfo };

/**
 * 検証済みの配列形式のスキーマ定義です。
 */
export type UniKvsSchemaInfoEntries = readonly (readonly [v.GenericSchema, ValueSchemaInfo])[];

/**
 * 検証済みのスキーマ定義です。
 */
export type UniKvsSchemaInfo = UniKvsSchemaInfoRecord | UniKvsSchemaInfoEntries;

/**
 * `schema` オプションの検証に使用するスキーマです。
 */
export const UniKvsSchemaSchema = v.union([
  v.array(
    v.tuple([
      v.custom<v.GenericSchema>(isGenericSchema),
      v.custom<ValueSchemaInfo>(isValueSchemaInfo),
    ]),
  ),
  v.record(v.string(), v.custom<ValueSchemaInfo>(isValueSchemaInfo)),
]);

// -------------------------------------------------------------------------------------------------
//
// スキーマリゾルバー
//
// -------------------------------------------------------------------------------------------------

/**
 * キーに対応する値のスキーマ情報を解決するインターフェースです。
 */
export interface IValueSchemaResolver {
  /**
   * キーに対応する値のスキーマ情報を返します。
   *
   * @param key 解決するキーです。
   * @returns 対応するスキーマ情報を返します。対応する定義がない場合は `undefined` を返します。
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

  readonly #keySchema: v.GenericSchema | undefined;

  public constructor(entries: UniKvsSchemaInfoEntries) {
    this.#entries = entries;
    this.#keySchema =
      entries.length > 0 ? v.union(entries.map(([keySchema]) => keySchema)) : undefined;
  }

  public resolve(key: string): ValueSchemaInfo | undefined {
    for (const [keySchema, valueSchema] of this.#entries) {
      const result = v.safeParse(keySchema, key);
      if (result.success) {
        return valueSchema;
      }
    }

    if (this.#keySchema) {
      const result = v.safeParse(this.#keySchema, key);
      if (!result.success) {
        throw new InvalidInputError({
          value: key,
          issues: result.issues,
        });
      }
    }

    return undefined;
  }
}

/**
 * 検証済みのスキーマ定義からスキーマリゾルバーを生成します。
 *
 * @param schema 検証済みのスキーマ定義です。
 * @returns スキーマリゾルバーを返します。
 */
export function createValueSchemaResolver(schema: UniKvsSchemaInfo): IValueSchemaResolver {
  if (Array.isArray(schema)) {
    return new EntriesValueSchemaResolver(schema);
  }

  return new RecordValueSchemaResolver(schema);
}
