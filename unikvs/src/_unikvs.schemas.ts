import type { TupleSchema, ObjectSchema } from "@tai-kun/valibot-extra-lab";
import type {
  StringSchema,
  BooleanSchema,
  GenericSchema,
  UnknownSchema,
  InstanceSchema,
  OptionalSchema,
} from "valibot";

import type { VariablesEntry } from "./_contexts.js";
import * as v from "./_valibot.js";

export const VariablesKeySchema: StringSchema<undefined> = v.string();

export const VariablesInitSchema: GenericSchema<any, readonly VariablesEntry[]> = v.pipe(
  v.union([
    v.custom<Iterable<VariablesEntry>>(
      // 各アイテムの検証は今後の課題です。
      (input) => typeof input === "object" && input !== null && Symbol.iterator in input,
      "Expected a Iterable object",
    ),
    v.record(VariablesKeySchema, v.unknown()),
  ]),
  v.transform(
    (input: Iterable<VariablesEntry> | Record<string, unknown>): readonly VariablesEntry[] => {
      if (Symbol.iterator in input) {
        return [...input];
      }

      return Object.entries(input);
    },
  ),
);

export const VariablesArgsSchema: TupleSchema<[typeof VariablesInitSchema], undefined> = v.tuple([
  VariablesInitSchema,
]);

/**
 * キー付き操作の引数スキーマを作成します。
 *
 * オプションオブジェクト形式と、キーを先頭に並べた位置引数形式の両方を受け付けます。
 *
 * @param optionsSchema オプションオブジェクトのスキーマです。
 * @param requiredKeys 位置引数の先頭に並べ、変換後のオブジェクトにも引き継ぐキーです。
 * @param omittedKeys 位置引数の末尾に置くオプションから除外するキーです。
 *
 * @returns 引数スキーマを返します。
 */
function createKeyedArgsSchema(
  optionsSchema: ObjectSchema<any, undefined>,
  requiredKeys: readonly string[],
  omittedKeys: readonly [string, ...string[]],
): GenericSchema<any, any> {
  const entries = optionsSchema.entries as Record<string, GenericSchema>;
  const requiredEntries = requiredKeys.map((key) => {
    const entry = entries[key];

    if (entry === undefined) {
      throw new Error(`キー "${key}" のスキーマが存在しません。`);
    }

    return entry;
  });

  return v.union([
    v.tuple([optionsSchema]),
    v.pipe(
      v.tuple([...requiredEntries, v.optional(v.omit(optionsSchema, omittedKeys))]),
      v.transform((input: [...unknown[], {} | undefined]): [Record<string, unknown>] => {
        const options = input[requiredKeys.length];
        const result: Record<string, unknown> = {
          ...(options as Record<string, unknown> | undefined),
        };

        for (let i = 0; i < requiredKeys.length; i++) {
          result[requiredKeys[i] as string] = input[i];
        }

        return [result];
      }),
    ),
  ]);
}

export const OpenOptionsSchema: ObjectSchema<
  {
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

export const OpenArgsSchema: TupleSchema<
  [OptionalSchema<typeof OpenOptionsSchema, undefined>],
  undefined
> = v.tuple([v.optional(OpenOptionsSchema)]);

export const CloseOptionsSchema: ObjectSchema<
  {
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

export const CloseArgsSchema: TupleSchema<
  [OptionalSchema<typeof CloseOptionsSchema, undefined>],
  undefined
> = v.tuple([v.optional(CloseOptionsSchema)]);

export const SetOptionsSchema: ObjectSchema<
  {
    readonly key: StringSchema<undefined>;
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly value: UnknownSchema;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = v.object({
  key: v.string(),
  vars: v.optional(VariablesInitSchema),
  value: v.unknown(),
  signal: v.optional(v.instance(AbortSignal)),
});

export const SetArgsSchema: GenericSchema<
  any,
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly value: unknown;
        readonly signal?: AbortSignal | undefined;
      },
    ]
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly value: unknown;
        readonly signal?: AbortSignal | undefined;
      },
    ]
> = createKeyedArgsSchema(SetOptionsSchema, ["key", "value"], ["key", "value"]);

export const GetOptionsSchema: ObjectSchema<
  {
    readonly key: StringSchema<undefined>;
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly repair: OptionalSchema<BooleanSchema<undefined>, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
    readonly throwOnRepairDenied: OptionalSchema<BooleanSchema<undefined>, undefined>;
  },
  undefined
> = v.object({
  key: v.string(),
  vars: v.optional(VariablesInitSchema),
  repair: v.optional(v.boolean()),
  signal: v.optional(v.instance(AbortSignal)),
  throwOnRepairDenied: v.optional(v.boolean()),
});

export const GetArgsSchema: GenericSchema<
  any,
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly repair?: boolean | undefined;
        readonly signal?: AbortSignal | undefined;
        readonly throwOnRepairDenied?: boolean | undefined;
      },
    ]
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly repair?: boolean | undefined;
        readonly signal?: AbortSignal | undefined;
        readonly throwOnRepairDenied?: boolean | undefined;
      },
    ]
> = createKeyedArgsSchema(GetOptionsSchema, ["key"], ["key"]);

export const StreamOptionsSchema: ObjectSchema<
  {
    readonly key: StringSchema<undefined>;
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly repair: OptionalSchema<BooleanSchema<undefined>, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
    readonly throwOnRepairDenied: OptionalSchema<BooleanSchema<undefined>, undefined>;
  },
  undefined
> = v.object({
  key: v.string(),
  vars: v.optional(VariablesInitSchema),
  repair: v.optional(v.boolean()),
  signal: v.optional(v.instance(AbortSignal)),
  throwOnRepairDenied: v.optional(v.boolean()),
});

export const StreamArgsSchema: GenericSchema<
  any,
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly repair?: boolean | undefined;
        readonly signal?: AbortSignal | undefined;
        readonly throwOnRepairDenied?: boolean | undefined;
      },
    ]
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly repair?: boolean | undefined;
        readonly signal?: AbortSignal | undefined;
        readonly throwOnRepairDenied?: boolean | undefined;
      },
    ]
> = createKeyedArgsSchema(StreamOptionsSchema, ["key"], ["key"]);

export const HasOptionsSchema: ObjectSchema<
  {
    readonly key: StringSchema<undefined>;
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = v.object({
  key: v.string(),
  vars: v.optional(VariablesInitSchema),
  signal: v.optional(v.instance(AbortSignal)),
});

export const HasArgsSchema: GenericSchema<
  any,
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly signal?: AbortSignal | undefined;
      },
    ]
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly signal?: AbortSignal | undefined;
      },
    ]
> = createKeyedArgsSchema(HasOptionsSchema, ["key"], ["key"]);

export const DeleteOptionsSchema: ObjectSchema<
  {
    readonly key: StringSchema<undefined>;
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = v.object({
  key: v.string(),
  vars: v.optional(VariablesInitSchema),
  signal: v.optional(v.instance(AbortSignal)),
});

export const DeleteArgsSchema: GenericSchema<
  any,
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly signal?: AbortSignal | undefined;
      },
    ]
  | readonly [
      {
        readonly key: string;
        readonly vars?: readonly VariablesEntry[] | undefined;
        readonly signal?: AbortSignal | undefined;
      },
    ]
> = createKeyedArgsSchema(DeleteOptionsSchema, ["key"], ["key"]);

export const CopyOptionsSchema: ObjectSchema<
  {
    readonly key: StringSchema<undefined>;
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
    readonly destinationKey: StringSchema<undefined>;
  },
  undefined
> = v.object({
  key: v.string(),
  vars: v.optional(VariablesInitSchema),
  signal: v.optional(v.instance(AbortSignal)),
  destinationKey: v.string(),
});

export const CopyArgsSchema: GenericSchema<
  any,
  readonly [
    {
      readonly key: string;
      readonly vars?: readonly VariablesEntry[] | undefined;
      readonly signal?: AbortSignal | undefined;
      readonly destinationKey: string;
    },
  ]
> = createKeyedArgsSchema(CopyOptionsSchema, ["key", "destinationKey"], ["key", "destinationKey"]);

export const MoveOptionsSchema: ObjectSchema<
  {
    readonly key: StringSchema<undefined>;
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
    readonly destinationKey: StringSchema<undefined>;
  },
  undefined
> = v.object({
  key: v.string(),
  vars: v.optional(VariablesInitSchema),
  signal: v.optional(v.instance(AbortSignal)),
  destinationKey: v.string(),
});

export const MoveArgsSchema: GenericSchema<
  any,
  readonly [
    {
      readonly key: string;
      readonly vars?: readonly VariablesEntry[] | undefined;
      readonly signal?: AbortSignal | undefined;
      readonly destinationKey: string;
    },
  ]
> = createKeyedArgsSchema(MoveOptionsSchema, ["key", "destinationKey"], ["key", "destinationKey"]);

export const ClearOptionsSchema: ObjectSchema<
  {
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

export const ClearArgsSchema: TupleSchema<
  [OptionalSchema<typeof ClearOptionsSchema, undefined>],
  undefined
> = v.tuple([v.optional(ClearOptionsSchema)]);
