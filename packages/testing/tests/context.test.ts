import type {
  IStorage,
  IGetContext,
  IHasContext,
  IMiddleware,
  ISetContext,
  ICopyContext,
  IMoveContext,
  IOpenContext,
  IClearContext,
  ICloseContext,
  IDecodeContext,
  IDeleteContext,
  IEncodeContext,
  IMapKeyContext,
  IStreamContext,
  IDecodeStreamContext,
  IEncodeStreamContext,
} from "@unikvs/core";
import { ReadonlyVariableError } from "@unikvs/core";
import { test, describe, expectTypeOf } from "vite-plus/test";

import { abortedSignal } from "../src/abort.js";
import {
  createNext,
  sourceFrom,
  TestContext,
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDecodeContext,
  createDeleteContext,
  createEncodeContext,
  createMapKeyContext,
  createRepairContext,
  createStreamContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "../src/index.js";

describe("TestContext の基本", () => {
  test("既定値は set アクションと空キーである", ({ expect }) => {
    // 実行：
    const c = new TestContext();

    // 検証：
    expect(c.action).toBe("set");
    expect(c.key).toBe("");
    expect(c.repair).toStrictEqual({
      enabled: false,
      targets: [],
    });
    expect(c.get("missing")).toBeUndefined();
  });

  test("get/set/setReadonly で変数を扱える", ({ expect }) => {
    // 準備：
    const c = new TestContext({ values: { a: 1 } });

    // 実行：
    c.set("b", 2);
    c.setReadonly("c", 3);

    // 検証：
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  test("読み取り専用の変数への再設定は ReadonlyVariableError を投げる", ({ expect }) => {
    // 準備：
    const c = new TestContext();
    c.setReadonly("k", 1);

    // 実行と検証：
    expect(() => c.set("k", 2)).toThrow(ReadonlyVariableError);
    expect(() => c.setReadonly("k", 2)).toThrow(ReadonlyVariableError);
  });

  test("createNext は解決する関数を返す", async ({ expect }) => {
    // 実行と検証：
    await expect(createNext()()).resolves.toBeUndefined();
  });

  test("action を型引数で固定した TestContext は構築できない", ({ expect }) => {
    // 実行：
    // @ts-expect-error TestContext は action を型引数に取らない
    const c = new TestContext<{}, "open">();

    // 検証：
    expect(c.action).toBe("set");
  });
});

describe("ストレージ用コンテキスト", () => {
  test("各ファクトリーは対応するコンテキスト型に代入できる", ({ expect }) => {
    // 実行と検証：
    const open: IOpenContext = createOpenContext();
    const close: ICloseContext = createCloseContext();
    const set: ISetContext = createSetContext("k");
    const repair: IGetContext = createRepairContext("k", ["a"]);
    const get: IGetContext = createGetContext("k");
    const stream: IStreamContext = createStreamContext("k");
    const has: IHasContext = createHasContext("k");
    const del: IDeleteContext = createDeleteContext("k");
    const copy: ICopyContext = createCopyContext("k", "k-copy");
    const move: IMoveContext = createMoveContext("k", "k-move");
    const clear: IClearContext = createClearContext();
    const mapKey = createMapKeyContext("k");
    const mapKeyContext: IMapKeyContext = mapKey;
    expect(open.action).toBe("open");
    expect(close.action).toBe("close");
    expect(set.action).toBe("set");
    expect(set.key).toBe("k");
    expect(repair.action).toBe("get");
    expect(repair.key).toBe("k");
    expect(get.action).toBe("get");
    expect(get.key).toBe("k");
    expect(stream.action).toBe("stream");
    expect(stream.key).toBe("k");
    expect(has.action).toBe("has");
    expect(has.key).toBe("k");
    expect(del.action).toBe("delete");
    expect(del.key).toBe("k");
    expect(copy.action).toBe("copy");
    expect(copy.key).toBe("k");
    expect(copy.destinationKey).toBe("k-copy");
    expect(move.action).toBe("move");
    expect(move.key).toBe("k");
    expect(move.destinationKey).toBe("k-move");
    expect(clear.action).toBe("clear");
    expect(mapKey.action).toBe("set");
    expect(mapKeyContext.key).toBe("k");
  });

  test("各ファクトリーの action はリテラル型に絞られる", () => {
    // 実行と検証：
    expectTypeOf(createOpenContext().action).toEqualTypeOf<"open">();
    expectTypeOf(createCloseContext().action).toEqualTypeOf<"close">();
    expectTypeOf(createSetContext("k").action).toEqualTypeOf<"set">();
    expectTypeOf(createRepairContext("k").action).toEqualTypeOf<"get">();
    expectTypeOf(createGetContext("k").action).toEqualTypeOf<"get">();
    expectTypeOf(createStreamContext("k").action).toEqualTypeOf<"stream">();
    expectTypeOf(createHasContext("k").action).toEqualTypeOf<"has">();
    expectTypeOf(createDeleteContext("k").action).toEqualTypeOf<"delete">();
    expectTypeOf(createCopyContext("k", "k2").action).toEqualTypeOf<"copy">();
    expectTypeOf(createMoveContext("k", "k2").action).toEqualTypeOf<"move">();
    expectTypeOf(createClearContext().action).toEqualTypeOf<"clear">();
    expectTypeOf(createMapKeyContext("k").action).toEqualTypeOf<"set">();
    expectTypeOf(createEncodeContext("v").action).toEqualTypeOf<"set">();
    expectTypeOf(createDecodeContext("v").action).toEqualTypeOf<"get">();
    expectTypeOf(createEncodeStreamContext(sourceFrom([])).action).toEqualTypeOf<"set">();
    expectTypeOf(createDecodeStreamContext(sourceFrom([])).action).toEqualTypeOf<"stream">();
  });

  test("IStorage の各コンテキスト別名と互換性がある", ({ expect }) => {
    // 実行と検証：
    const write: IStorage.WriteContext = createSetContext("k");
    const copyWrite: IStorage.WriteContext = createCopyContext("k", "k2");
    const moveWrite: IStorage.WriteContext = createMoveContext("k", "k2");
    const read: IStorage.ReadContext = createGetContext("k");
    const copyRead: IStorage.ReadContext = createCopyContext("k", "k2");
    const moveRead: IStorage.ReadContext = createMoveContext("k", "k2");
    const exists: IStorage.ExistsContext = createHasContext("k");
    const gw: IStorage.GetWritableContext = createSetContext("k");
    const gr: IStorage.GetReadableContext = createStreamContext("k");
    expect(write.action).toBe("set");
    expect(write.key).toBe("k");
    expect(copyWrite.action).toBe("copy");
    expect(moveWrite.action).toBe("move");
    expect(read.action).toBe("get");
    expect(read.key).toBe("k");
    expect(copyRead.action).toBe("copy");
    expect(moveRead.action).toBe("move");
    expect(exists.action).toBe("has");
    expect(exists.key).toBe("k");
    expect(gw.action).toBe("set");
    expect(gw.key).toBe("k");
    expect(gr.action).toBe("stream");
    expect(gr.key).toBe("k");
  });

  test("copy と move はキーと移動先キーと初期値を保持する", ({ expect }) => {
    // 準備：
    const signal = abortedSignal();

    // 実行：
    const copy = createCopyContext("src-copy", "dst-copy", {
      signal,
      values: { v: 1 },
    });
    const move = createMoveContext("src-move", "dst-move", {
      signal,
      values: { w: 2 },
    });

    // 検証：
    expect(copy.action).toBe("copy");
    expect(copy.key).toBe("src-copy");
    expect(copy.destinationKey).toBe("dst-copy");
    expect(copy.signal).toBe(signal);
    expect(copy.get("v")).toBe(1);
    expect(move.action).toBe("move");
    expect(move.key).toBe("src-move");
    expect(move.destinationKey).toBe("dst-move");
    expect(move.signal).toBe(signal);
    expect(move.get("w")).toBe(2);
  });

  test("signal と values と repair を引き継ぐ", ({ expect }) => {
    // 準備：
    const signal = abortedSignal();

    // 実行：
    const set = createSetContext("k1", {
      signal,
      values: { v: 1 },
    });
    const repair = createRepairContext("k2", ["n1"], { values: { w: 2 } });

    // 検証：
    expect(set.signal).toBe(signal);
    expect(set.key).toBe("k1");
    expect(set.get("v")).toBe(1);
    expect(repair.action).toBe("get");
    expect(repair.key).toBe("k2");
    expect(repair.repair).toStrictEqual({
      enabled: true,
      targets: ["n1"],
    });
    expect(repair.get("w")).toBe(2);
  });

  test("get と stream は既定で書き戻し無効であり repair 指定で有効化できる", ({ expect }) => {
    // 実行：
    const get = createGetContext("k");
    const stream = createStreamContext("k", {
      repair: {
        enabled: true,
        targets: ["n1", "n2"],
      },
    });

    // 検証：
    expect(get.repair).toStrictEqual({
      enabled: false,
      targets: [],
    });
    expect(stream.repair).toStrictEqual({
      enabled: true,
      targets: ["n1", "n2"],
    });
  });
});

describe("ミドルウェア用コンテキスト", () => {
  test("encode と decode は source を保持する", ({ expect }) => {
    // 実行：
    const enc: IEncodeContext<string, string> = createEncodeContext("raw", "k");
    const dec: IDecodeContext<string, string> = createDecodeContext("enc", "k");

    // 検証：
    expect(enc.action).toBe("set");
    expect(enc.source).toBe("raw");
    expect(dec.action).toBe("get");
    expect(dec.source).toBe("enc");
  });

  test("encodeStream と decodeStream はストリームを保持する", ({ expect }) => {
    // 準備：
    const source = sourceFrom([1, 2]);

    // 実行：
    const enc: IEncodeStreamContext = createEncodeStreamContext(source, "k");
    const dec: IDecodeStreamContext = createDecodeStreamContext(source, "k");

    // 検証：
    expect(enc.source).toBe(source);
    expect(dec.source).toBe(source);
  });

  test("IMiddleware のコンテキスト別名と互換性がある", ({ expect }) => {
    // 実行と検証：
    const enc: IMiddleware.EncodeContext = createEncodeContext("a");
    const dec: IMiddleware.DecodeContext = createDecodeContext("b");
    const use: IMiddleware.UseContext = createSetContext("k");
    expect(enc.action).toBe("set");
    expect(enc.source).toBe("a");
    expect(dec.action).toBe("get");
    expect(dec.source).toBe("b");
    expect(use.action).toBe("set");
  });

  test("encode の destination に設定した値が読める", async ({ expect }) => {
    // 準備：
    const c: IEncodeContext<string, string> = createEncodeContext("in", "k");

    // 実行：
    c.destination = `${c.source}-out`;

    await createNext()();

    // 検証：
    expect(c.destination).toBe("in-out");
  });
});
