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
> = v.union([
  v.tuple([SetOptionsSchema]),
  v.pipe(
    v.tuple([
      SetOptionsSchema.entries.key,
      SetOptionsSchema.entries.value,
      v.optional(v.omit(SetOptionsSchema, ["key", "value"])),
    ]),
    v.transform(
      ([key, value, options]: [
        string,
        unknown,
        (
          | {
              vars?: readonly VariablesEntry[] | undefined;
              signal?: AbortSignal | undefined;
            }
          | undefined
        ),
      ]): [
        {
          key: string;
          vars?: readonly VariablesEntry[] | undefined;
          value: unknown;
          signal?: AbortSignal | undefined;
        },
      ] => [
        {
          ...options,
          key,
          value,
        },
      ],
    ),
  ),
]);

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
> = v.union([
  v.tuple([GetOptionsSchema]),
  v.pipe(
    v.tuple([GetOptionsSchema.entries.key, v.optional(v.omit(GetOptionsSchema, ["key"]))]),
    v.transform(
      ([key, options]: [
        string,
        (
          | {
              vars?: readonly VariablesEntry[] | undefined;
              repair?: boolean | undefined;
              signal?: AbortSignal | undefined;
              throwOnRepairDenied?: boolean | undefined;
            }
          | undefined
        ),
      ]): [
        {
          key: string;
          vars?: readonly VariablesEntry[] | undefined;
          repair?: boolean | undefined;
          signal?: AbortSignal | undefined;
          throwOnRepairDenied?: boolean | undefined;
        },
      ] => [
        {
          ...options,
          key,
        },
      ],
    ),
  ),
]);

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
> = v.union([
  v.tuple([StreamOptionsSchema]),
  v.pipe(
    v.tuple([StreamOptionsSchema.entries.key, v.optional(v.omit(StreamOptionsSchema, ["key"]))]),
    v.transform(
      ([key, options]: [
        string,
        (
          | {
              vars?: readonly VariablesEntry[] | undefined;
              repair?: boolean | undefined;
              signal?: AbortSignal | undefined;
              throwOnRepairDenied?: boolean | undefined;
            }
          | undefined
        ),
      ]): [
        {
          key: string;
          vars?: readonly VariablesEntry[] | undefined;
          repair?: boolean | undefined;
          signal?: AbortSignal | undefined;
          throwOnRepairDenied?: boolean | undefined;
        },
      ] => [
        {
          ...options,
          key,
        },
      ],
    ),
  ),
]);

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
> = v.union([
  v.tuple([HasOptionsSchema]),
  v.pipe(
    v.tuple([HasOptionsSchema.entries.key, v.optional(v.omit(HasOptionsSchema, ["key"]))]),
    v.transform(
      ([key, options]: [
        string,
        (
          | {
              vars?: readonly VariablesEntry[] | undefined;
              signal?: AbortSignal | undefined;
            }
          | undefined
        ),
      ]): [
        {
          key: string;
          vars?: readonly VariablesEntry[] | undefined;
          signal?: AbortSignal | undefined;
        },
      ] => [
        {
          ...options,
          key,
        },
      ],
    ),
  ),
]);

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
> = v.union([
  v.tuple([DeleteOptionsSchema]),
  v.pipe(
    v.tuple([DeleteOptionsSchema.entries.key, v.optional(v.omit(DeleteOptionsSchema, ["key"]))]),
    v.transform(
      ([key, options]: [
        string,
        (
          | {
              vars?: readonly VariablesEntry[] | undefined;
              signal?: AbortSignal | undefined;
            }
          | undefined
        ),
      ]): [
        {
          key: string;
          vars?: readonly VariablesEntry[] | undefined;
          signal?: AbortSignal | undefined;
        },
      ] => [
        {
          ...options,
          key,
        },
      ],
    ),
  ),
]);

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
> = v.union([
  v.tuple([CopyOptionsSchema]),
  v.pipe(
    v.tuple([
      CopyOptionsSchema.entries.key,
      CopyOptionsSchema.entries.destinationKey,
      v.optional(v.omit(CopyOptionsSchema, ["key", "destinationKey"])),
    ]),
    v.transform(
      ([key, destinationKey, options]: [
        string,
        string,
        (
          | {
              vars?: readonly VariablesEntry[] | undefined;
              signal?: AbortSignal | undefined;
            }
          | undefined
        ),
      ]): [
        {
          key: string;
          vars?: readonly VariablesEntry[] | undefined;
          signal?: AbortSignal | undefined;
          destinationKey: string;
        },
      ] => [
        {
          ...options,
          key,
          destinationKey,
        },
      ],
    ),
  ),
]);

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
> = v.union([
  v.tuple([MoveOptionsSchema]),
  v.pipe(
    v.tuple([
      MoveOptionsSchema.entries.key,
      MoveOptionsSchema.entries.destinationKey,
      v.optional(v.omit(MoveOptionsSchema, ["key", "destinationKey"])),
    ]),
    v.transform(
      ([key, destinationKey, options]: [
        string,
        string,
        (
          | {
              vars?: readonly VariablesEntry[] | undefined;
              signal?: AbortSignal | undefined;
            }
          | undefined
        ),
      ]): [
        {
          key: string;
          vars?: readonly VariablesEntry[] | undefined;
          signal?: AbortSignal | undefined;
          destinationKey: string;
        },
      ] => [
        {
          ...options,
          key,
          destinationKey,
        },
      ],
    ),
  ),
]);

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
