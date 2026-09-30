import type { ITransformer, Variables } from "@unikvs/core";
import { expectTypeOf, test } from "vitest";

import Debug, {
  type DebugDirection,
  type DebugInfoArgs,
  type DebugOptions,
  type IDebugActionFilter,
  type IDebugInfoCallback,
  type IDebugKeyFilter,
} from "../src/debug.js";

/**
 * 型エラーの検証専用で、実行時には呼び出されない関数です。
 * 不正な使用がコンパイルエラーになることを確認するために使用します。
 */
function expectTypeErrors(): void {
  // @ts-expect-error getDebugInfo は Record<string, unknown> を返す必要がある
  const invalidGetDebugInfo: DebugOptions = { getDebugInfo: () => 42 };

  // @ts-expect-error keyFilter は文字列を受け取る必要がある
  const invalidKeyFilter: DebugOptions = { keyFilter: (key: number) => key > 0 };

  // @ts-expect-error actionFilter は文字列を受け取る必要がある
  const invalidActionFilter: DebugOptions = { actionFilter: (action: number) => action > 0 };

  // @ts-expect-error direction は write と read のいずれかでなければならない
  const invalidDirection: DebugDirection = "both";

  const args = {} as DebugInfoArgs;
  // @ts-expect-error vars は読み取り専用
  args.vars = {};
  // @ts-expect-error key は読み取り専用
  args.key = "k";

  void invalidGetDebugInfo;
  void invalidKeyFilter;
  void invalidActionFilter;
  void invalidDirection;
  void args;
}

test("Debug は ITransformer を実装する", () => {
  // 実行と検証
  expectTypeOf<Debug>().toExtend<ITransformer>();
});

test("name と isOpen とフィルターとコールバックの型", () => {
  // 実行と検証
  expectTypeOf<Debug["name"]>().toEqualTypeOf<string>();
  expectTypeOf<Debug["isOpen"]>().toEqualTypeOf<boolean>();
  expectTypeOf<Debug["keyFilter"]>().toEqualTypeOf<IDebugKeyFilter>();
  expectTypeOf<Debug["actionFilter"]>().toEqualTypeOf<IDebugActionFilter>();
  expectTypeOf<Debug["getDebugInfo"]>().toEqualTypeOf<IDebugInfoCallback>();
});

test("DebugDirection は write と read のみを表す", () => {
  // 実行と検証
  expectTypeOf<DebugDirection>().toEqualTypeOf<"write" | "read">();
});

test("DebugInfoArgs は読み取り専用のプロパティーを持つ", () => {
  // 実行と検証
  expectTypeOf<DebugInfoArgs>().toEqualTypeOf<{
    readonly vars: Variables;
    readonly action: string | undefined;
    readonly key: string | undefined;
    readonly direction: DebugDirection;
    readonly data: unknown;
  }>();
});

test("DebugOptions はすべてのオプションを省略できる", () => {
  // 実行と検証
  expectTypeOf<DebugOptions>().toEqualTypeOf<{
    readonly keyFilter?: IDebugKeyFilter | undefined;
    readonly actionFilter?: IDebugActionFilter | undefined;
    readonly getDebugInfo?: IDebugInfoCallback | undefined;
  }>();
});

test("encode と decode とストリームは vars のみを必要とする", () => {
  // 実行と検証
  expectTypeOf<Debug["encode"]>()
    .parameter(0)
    .toEqualTypeOf<Pick<ITransformer.EncodeArgs, "vars" | "data">>();
  expectTypeOf<Debug["decode"]>()
    .parameter(0)
    .toEqualTypeOf<Pick<ITransformer.DecodeArgs, "vars" | "data">>();
  expectTypeOf<Debug["getEncodable"]>()
    .parameter(0)
    .toEqualTypeOf<Pick<ITransformer.GetEncodableArgs, "vars">>();
  expectTypeOf<Debug["getDecodable"]>()
    .parameter(0)
    .toEqualTypeOf<Pick<ITransformer.GetDecodableArgs, "vars">>();
});

test("getDefaultDebugInfo は IDebugInfoCallback として利用できる", () => {
  // 実行と検証
  expectTypeOf(Debug.getDefaultDebugInfo).toExtend<IDebugInfoCallback>();
  expectTypeOf(Debug.getDefaultDebugInfo).parameter(0).toEqualTypeOf<DebugInfoArgs>();
  expectTypeOf(Debug.getDefaultDebugInfo).returns.toEqualTypeOf<Record<string, unknown>>();
});

test("不正な使用はコンパイルエラーになる", () => {
  // 実行と検証
  expectTypeOf(expectTypeErrors).toBeFunction();
});
