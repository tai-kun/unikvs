import type { ITransformer } from "@unikvs/core";
import { expectTypeOf, test } from "vitest";

import AllowRepair from "../src/allow-repair.js";

test("AllowRepair は ITransformer として扱える", () => {
  expectTypeOf<AllowRepair>().toExtend<ITransformer>();
});

test("コンストラクターは引数なしで組み立てられる", () => {
  // 準備と実行
  const gate = new AllowRepair();

  // 検証
  expectTypeOf(gate.enabled).toEqualTypeOf<boolean>();
  // @ts-expect-error 引数なしのみが正規であり余剰引数は受け付けません。
  expectTypeOf(new AllowRepair({})).toEqualTypeOf<AllowRepair>();
});

test("encode はデータの型をそのまま戻り値にする", () => {
  // 準備
  const gate = new AllowRepair();

  // 実行と検証
  expectTypeOf(gate.encode<string>({ vars: {}, data: "hello" })).toEqualTypeOf<string>();
  expectTypeOf(gate.encode({ vars: {}, data: 123 })).toEqualTypeOf<number>();
  expectTypeOf(gate.encode({ vars: {}, data: { id: 1 } })).toEqualTypeOf<{ id: number }>();
  expectTypeOf(
    // @ts-expect-error signal の混入は Pick の絞り込みで拒否されます。
    gate.encode({ vars: {}, data: "hello", signal: AbortSignal.timeout(1000) }),
  ).toEqualTypeOf<string>();
});

test("decode はデータの型をそのまま戻り値にする", () => {
  // 準備
  const gate = new AllowRepair();

  // 実行と検証
  expectTypeOf(gate.decode<string>({ data: "hello" })).toEqualTypeOf<string>();
  expectTypeOf(gate.decode({ data: 123 })).toEqualTypeOf<number>();
});

test("getEncodable と getDecodable は TransformStream を返す", () => {
  // 準備
  const gate = new AllowRepair();

  // 実行と検証
  expectTypeOf(gate.getEncodable({ vars: {} })).toEqualTypeOf<TransformStream<any, any>>();
  expectTypeOf(gate.getDecodable()).toEqualTypeOf<TransformStream<any, any>>();
});

test("name と enabled と isOpen の型を保持する", () => {
  // 準備
  const gate = new AllowRepair();

  // 実行と検証
  expectTypeOf(gate.name).toEqualTypeOf<string>();
  expectTypeOf(gate.enabled).toEqualTypeOf<boolean>();
  expectTypeOf(gate.isOpen).toEqualTypeOf<boolean>();
  expectTypeOf(gate.toggle()).toEqualTypeOf<boolean>();
});
