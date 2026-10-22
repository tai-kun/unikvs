import type { VariablesEntry } from "./_contexts.js";
import * as v from "./_valibot.js";

export const VariablesKeySchema = v.string();

export const VariablesInitSchema = v.pipe(
  v.union([
    v.custom<Iterable<VariablesEntry>>(
      // TODO(tai-kun): 各アイテムも要検証です。
      (input) => typeof input === "object" && !!input && Symbol.iterator in input,
      "Expected a Iterable object",
    ),
    v.record(VariablesKeySchema, v.unknown()),
  ]),
  v.transform((input): readonly VariablesEntry[] => {
    if (Symbol.iterator in input) {
      return [...input];
    }

    return Object.entries(input);
  }),
);

export const VariablesArgsSchema = v.tuple([VariablesInitSchema]);

export const OpenOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

export const OpenArgsSchema = v.tuple([v.optional(OpenOptionsSchema)]);

export const CloseOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

export const CloseArgsSchema = v.tuple([v.optional(CloseOptionsSchema)]);

export const SetOptionsSchema = v.object({
  key: v.string(),
  value: v.unknown(),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

export const SetArgsSchema = v.union([
  v.tuple([SetOptionsSchema]),
  v.pipe(
    v.tuple([
      SetOptionsSchema.entries.key,
      SetOptionsSchema.entries.value,
      v.optional(v.omit(SetOptionsSchema, ["key", "value"])),
    ]),
    v.transform(([key, value, options]) => [{ ...options, key, value }]),
  ),
]);

export const GetOptionsSchema = v.object({
  key: v.string(),
  repair: v.optional(v.boolean()),
  throwOnRepairDenied: v.optional(v.boolean()),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

export const GetArgsSchema = v.union([
  v.tuple([GetOptionsSchema]),
  v.pipe(
    v.tuple([GetOptionsSchema.entries.key, v.optional(v.omit(GetOptionsSchema, ["key"]))]),
    v.transform(([key, options]) => [{ ...options, key }]),
  ),
]);

export const StreamOptionsSchema = v.object({
  key: v.string(),
  repair: v.optional(v.boolean()),
  throwOnRepairDenied: v.optional(v.boolean()),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

export const StreamArgsSchema = v.union([
  v.tuple([StreamOptionsSchema]),
  v.pipe(
    v.tuple([StreamOptionsSchema.entries.key, v.optional(v.omit(StreamOptionsSchema, ["key"]))]),
    v.transform(([key, options]) => [{ ...options, key }]),
  ),
]);

export const HasOptionsSchema = v.object({
  key: v.string(),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

export const HasArgsSchema = v.union([
  v.tuple([HasOptionsSchema]),
  v.pipe(
    v.tuple([HasOptionsSchema.entries.key, v.optional(v.omit(HasOptionsSchema, ["key"]))]),
    v.transform(([key, options]) => [{ ...options, key }]),
  ),
]);

export const DeleteOptionsSchema = v.object({
  key: v.string(),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

export const DeleteArgsSchema = v.union([
  v.tuple([DeleteOptionsSchema]),
  v.pipe(
    v.tuple([DeleteOptionsSchema.entries.key, v.optional(v.omit(DeleteOptionsSchema, ["key"]))]),
    v.transform(([key, options]) => [{ ...options, key }]),
  ),
]);

export const ClearOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

export const ClearArgsSchema = v.tuple([v.optional(ClearOptionsSchema)]);
