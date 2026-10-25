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
import {
  omit,
  pipe,
  tuple,
  union,
  custom,
  object,
  record,
  string,
  boolean,
  unknown,
  instance,
  optional,
  transform,
} from "./_valibot.js";

export const VariablesKeySchema: StringSchema<undefined> = string();

export const VariablesInitSchema: GenericSchema<any, readonly VariablesEntry[]> = pipe(
  union([
    custom<Iterable<VariablesEntry>>(
      // 各アイテムの検証は今後の課題です。
      (input) => typeof input === "object" && input !== null && Symbol.iterator in input,
      "Expected a Iterable object",
    ),
    record(VariablesKeySchema, unknown()),
  ]),
  transform(
    (input: Iterable<VariablesEntry> | Record<string, unknown>): readonly VariablesEntry[] => {
      if (Symbol.iterator in input) {
        return [...input];
      }

      return Object.entries(input);
    },
  ),
);

export const VariablesArgsSchema: TupleSchema<[typeof VariablesInitSchema], undefined> = tuple([
  VariablesInitSchema,
]);

export const OpenOptionsSchema: ObjectSchema<
  {
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: optional(instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: optional(VariablesInitSchema),
});

export const OpenArgsSchema: TupleSchema<
  [OptionalSchema<typeof OpenOptionsSchema, undefined>],
  undefined
> = tuple([optional(OpenOptionsSchema)]);

export const CloseOptionsSchema: ObjectSchema<
  {
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: optional(instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: optional(VariablesInitSchema),
});

export const CloseArgsSchema: TupleSchema<
  [OptionalSchema<typeof CloseOptionsSchema, undefined>],
  undefined
> = tuple([optional(CloseOptionsSchema)]);

export const SetOptionsSchema: ObjectSchema<
  {
    readonly key: StringSchema<undefined>;
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly value: UnknownSchema;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = object({
  key: string(),
  vars: optional(VariablesInitSchema),
  value: unknown(),
  signal: optional(instance(AbortSignal)),
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
> = union([
  tuple([SetOptionsSchema]),
  pipe(
    tuple([
      SetOptionsSchema.entries.key,
      SetOptionsSchema.entries.value,
      optional(omit(SetOptionsSchema, ["key", "value"])),
    ]),
    transform(
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
> = object({
  key: string(),
  vars: optional(VariablesInitSchema),
  repair: optional(boolean()),
  signal: optional(instance(AbortSignal)),
  throwOnRepairDenied: optional(boolean()),
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
> = union([
  tuple([GetOptionsSchema]),
  pipe(
    tuple([GetOptionsSchema.entries.key, optional(omit(GetOptionsSchema, ["key"]))]),
    transform(
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
> = object({
  key: string(),
  vars: optional(VariablesInitSchema),
  repair: optional(boolean()),
  signal: optional(instance(AbortSignal)),
  throwOnRepairDenied: optional(boolean()),
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
> = union([
  tuple([StreamOptionsSchema]),
  pipe(
    tuple([StreamOptionsSchema.entries.key, optional(omit(StreamOptionsSchema, ["key"]))]),
    transform(
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
> = object({
  key: string(),
  vars: optional(VariablesInitSchema),
  signal: optional(instance(AbortSignal)),
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
> = union([
  tuple([HasOptionsSchema]),
  pipe(
    tuple([HasOptionsSchema.entries.key, optional(omit(HasOptionsSchema, ["key"]))]),
    transform(
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
> = object({
  key: string(),
  vars: optional(VariablesInitSchema),
  signal: optional(instance(AbortSignal)),
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
> = union([
  tuple([DeleteOptionsSchema]),
  pipe(
    tuple([DeleteOptionsSchema.entries.key, optional(omit(DeleteOptionsSchema, ["key"]))]),
    transform(
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

export const ClearOptionsSchema: ObjectSchema<
  {
    readonly vars: OptionalSchema<typeof VariablesInitSchema, undefined>;
    readonly signal: OptionalSchema<InstanceSchema<typeof AbortSignal, undefined>, undefined>;
  },
  undefined
> = object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: optional(instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: optional(VariablesInitSchema),
});

export const ClearArgsSchema: TupleSchema<
  [OptionalSchema<typeof ClearOptionsSchema, undefined>],
  undefined
> = tuple([optional(ClearOptionsSchema)]);
