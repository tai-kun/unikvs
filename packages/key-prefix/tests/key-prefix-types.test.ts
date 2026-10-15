import type { IMiddleware } from "@unikvs/core";
import { expectTypeOf, test } from "vitest";

import KeyPrefix, { type KeyPrefixOptions } from "../src/key-prefix.js";

test("KeyPrefix は IMiddleware として扱える", () => {
  expectTypeOf<KeyPrefix>().toExtend<IMiddleware>();
});

test("第一引数のプレフィックスは必須である", () => {
  // 準備と実行
  const prefix = new KeyPrefix("tenant:");

  // 検証
  expectTypeOf(prefix.prefix).toEqualTypeOf<string>();
  // @ts-expect-error 第一引数の省略は受け付けません。
  expectTypeOf(new KeyPrefix()).toEqualTypeOf<KeyPrefix>();
});

test("第二引数の省略と明示はどちらも組み立てられる", () => {
  // 実行と検証
  expectTypeOf(new KeyPrefix("tenant:")).toEqualTypeOf<KeyPrefix>();
  expectTypeOf(new KeyPrefix("tenant:", {})).toEqualTypeOf<KeyPrefix>();
  expectTypeOf(new KeyPrefix("tenant:", undefined)).toEqualTypeOf<KeyPrefix>();
  expectTypeOf(new KeyPrefix("tenant:", { clearBehavior: undefined })).toEqualTypeOf<KeyPrefix>();
  expectTypeOf(new KeyPrefix("tenant:", { clearBehavior: "allow" })).toEqualTypeOf<KeyPrefix>();
  expectTypeOf(new KeyPrefix("tenant:", { clearBehavior: "deny" })).toEqualTypeOf<KeyPrefix>();
});

test("options の余剰プロパティーは受け付けない", () => {
  // 実行と検証
  expectTypeOf({} as KeyPrefixOptions).toEqualTypeOf<KeyPrefixOptions>();
  expectTypeOf({ prefix: "other:" })
    // @ts-expect-error prefix は第一引数のため options には書けません。
    .toEqualTypeOf<KeyPrefixOptions>();
  expectTypeOf({ clearBehavior: "alllow" })
    // @ts-expect-error allow と deny のみが正規であり、誤記は受け付けません。
    .toEqualTypeOf<KeyPrefixOptions>();
});

test("公開プロパティーの型を保持する", () => {
  // 準備
  const prefix = new KeyPrefix("tenant:", { clearBehavior: "deny" });

  // 実行と検証
  expectTypeOf(prefix.name).toEqualTypeOf<string>();
  expectTypeOf(prefix.prefix).toEqualTypeOf<string>();
  expectTypeOf(prefix.clearBehavior).toEqualTypeOf<"allow" | "deny">();
  expectTypeOf(prefix.isOpen).toEqualTypeOf<boolean>();
});

test("encode と decode はコンテキストと next を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<KeyPrefix["encode"]>().parameter(0).toEqualTypeOf<IMiddleware.EncodeContext>();
  expectTypeOf<KeyPrefix["encode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<KeyPrefix["encode"]>().returns.toEqualTypeOf<Promise<void>>();
  expectTypeOf<KeyPrefix["decode"]>().parameter(0).toEqualTypeOf<IMiddleware.DecodeContext>();
  expectTypeOf<KeyPrefix["decode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<KeyPrefix["decode"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("encodeStream と decodeStream はコンテキストと next を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<KeyPrefix["encodeStream"]>()
    .parameter(0)
    .toEqualTypeOf<IMiddleware.EncodeStreamContext>();
  expectTypeOf<KeyPrefix["encodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<KeyPrefix["encodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
  expectTypeOf<KeyPrefix["decodeStream"]>()
    .parameter(0)
    .toEqualTypeOf<IMiddleware.DecodeStreamContext>();
  expectTypeOf<KeyPrefix["decodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<KeyPrefix["decodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("mapKey は MapKeyContext を受けて文字列を返す", () => {
  // 実行と検証
  expectTypeOf<KeyPrefix["mapKey"]>().parameter(0).toEqualTypeOf<IMiddleware.MapKeyContext>();
  expectTypeOf<KeyPrefix["mapKey"]>().returns.toEqualTypeOf<string>();
});

test("use は UseContext と next を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<KeyPrefix["use"]>().parameter(0).toEqualTypeOf<IMiddleware.UseContext>();
  expectTypeOf<KeyPrefix["use"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<KeyPrefix["use"]>().returns.toEqualTypeOf<Promise<void>>();
});
