import type {
  IClearContext,
  ICloseContext,
  IDecodeContext,
  IDecodeStreamContext,
  IDeleteContext,
  IEncodeContext,
  IEncodeStreamContext,
  IGetContext,
  IHasContext,
  IMapKeyContext,
  IMiddleware,
  IOpenContext,
  ISetContext,
  IStorage,
  IStreamContext,
} from "@unikvs/core";
import { ReadonlyVariableError } from "@unikvs/core";
import { describe, test } from "vitest";

import {
  TestContext,
  createClearContext,
  createCloseContext,
  createDecodeContext,
  createDecodeStreamContext,
  createDeleteContext,
  createEncodeContext,
  createEncodeStreamContext,
  createGetContext,
  createHasContext,
  createMapKeyContext,
  createNext,
  createOpenContext,
  createRepairContext,
  createSetContext,
  createStreamContext,
  sourceFrom,
} from "../src/index.js";
import { abortedSignal } from "../src/abort.js";

describe("TestContext の基本", () => {
  test("既定値は set アクションと空キーである", ({ expect }) => {
    // 実行
    const c = new TestContext();

    // 検証
    expect(c.action).toBe("set");
    expect(c.key).toBe("");
    expect(c.repair).toStrictEqual({ enabled: false, targets: [] });
    expect(c.get("missing")).toBeUndefined();
  });

  test("get/set/setReadonly で変数を扱える", ({ expect }) => {
    // 準備
    const c = new TestContext({ values: { a: 1 } });

    // 実行
    c.set("b", 2);
    c.setReadonly("c", 3);

    // 検証
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  test("読み取り専用の変数への再設定は ReadonlyVariableError を投げる", ({ expect }) => {
    // 準備
    const c = new TestContext();
    c.setReadonly("k", 1);

    // 実行と検証
    expect(() => c.set("k", 2)).toThrow(ReadonlyVariableError);
    expect(() => c.setReadonly("k", 2)).toThrow(ReadonlyVariableError);
  });

  test("createNext は解決する関数を返す", async ({ expect }) => {
    // 実行と検証
    await expect(createNext()()).resolves.toBeUndefined();
  });
});

describe("ストレージ用コンテキスト", () => {
  test("各ファクトリーは対応するコンテキスト型に代入できる", () => {
    // 実行と検証
    const open: IOpenContext = createOpenContext() as unknown as IOpenContext;
    const close: ICloseContext = createCloseContext() as unknown as ICloseContext;
    const set: ISetContext = createSetContext("k") as unknown as ISetContext;
    const repair: IGetContext = createRepairContext("k", ["a"]) as unknown as IGetContext;
    const get: IGetContext = createGetContext("k") as unknown as IGetContext;
    const stream: IStreamContext = createStreamContext("k") as unknown as IStreamContext;
    const has: IHasContext = createHasContext("k") as unknown as IHasContext;
    const del: IDeleteContext = createDeleteContext("k") as unknown as IDeleteContext;
    const clear: IClearContext = createClearContext() as unknown as IClearContext;
    const mapKey: IMapKeyContext = createMapKeyContext("k") as unknown as IMapKeyContext;

    void open;
    void close;
    void set;
    void repair;
    void get;
    void stream;
    void has;
    void del;
    void clear;
    void mapKey;
  });

  test("IStorage の各コンテキスト別名と互換性がある", () => {
    // 実行と検証
    const write: IStorage.WriteContext = createSetContext("k") as unknown as IStorage.WriteContext;
    const read: IStorage.ReadContext = createGetContext("k") as unknown as IStorage.ReadContext;
    const exists: IStorage.ExistsContext = createHasContext(
      "k",
    ) as unknown as IStorage.ExistsContext;
    const gw: IStorage.GetWritableContext = createSetContext(
      "k",
    ) as unknown as IStorage.GetWritableContext;
    const gr: IStorage.GetReadableContext = createStreamContext(
      "k",
    ) as unknown as IStorage.GetReadableContext;

    void write;
    void read;
    void exists;
    void gw;
    void gr;
  });

  test("signal と values と repair を引き継ぐ", ({ expect }) => {
    // 準備
    const signal = abortedSignal();

    // 実行
    const set = createSetContext("k1", { signal, values: { v: 1 } });
    const repair = createRepairContext("k2", ["n1"], { values: { w: 2 } });

    // 検証
    expect(set.signal).toBe(signal);
    expect(set.key).toBe("k1");
    expect(set.get("v")).toBe(1);
    expect(repair.action).toBe("get");
    expect(repair.key).toBe("k2");
    expect(repair.repair).toStrictEqual({ enabled: true, targets: ["n1"] });
    expect(repair.get("w")).toBe(2);
  });

  test("get と stream は既定で書き戻し無効であり repair 指定で有効化できる", ({ expect }) => {
    // 実行
    const get = createGetContext("k");
    const stream = createStreamContext("k", {
      repair: { enabled: true, targets: ["n1", "n2"] },
    });

    // 検証
    expect(get.repair).toStrictEqual({ enabled: false, targets: [] });
    expect(stream.repair).toStrictEqual({ enabled: true, targets: ["n1", "n2"] });
  });
});

describe("ミドルウェア用コンテキスト", () => {
  test("encode と decode は source を保持する", ({ expect }) => {
    // 実行
    const enc = createEncodeContext("raw", "k") as unknown as IEncodeContext<string, string>;
    const dec = createDecodeContext("enc", "k") as unknown as IDecodeContext<string, string>;

    // 検証
    expect(enc.action).toBe("set");
    expect(enc.source).toBe("raw");
    expect(dec.action).toBe("get");
    expect(dec.source).toBe("enc");
  });

  test("encodeStream と decodeStream はストリームを保持する", ({ expect }) => {
    // 準備
    const source = sourceFrom([1, 2]);

    // 実行
    const enc = createEncodeStreamContext(source, "k") as unknown as IEncodeStreamContext;
    const dec = createDecodeStreamContext(source, "k") as unknown as IDecodeStreamContext;

    // 検証
    expect(enc.source).toBe(source);
    expect(dec.source).toBe(source);
  });

  test("IMiddleware のコンテキスト別名と互換性がある", () => {
    // 実行と検証
    const enc: IMiddleware.EncodeContext = createEncodeContext(
      "a",
    ) as unknown as IMiddleware.EncodeContext;
    const dec: IMiddleware.DecodeContext = createDecodeContext(
      "b",
    ) as unknown as IMiddleware.DecodeContext;
    const use: IMiddleware.UseContext = createSetContext("k") as unknown as IMiddleware.UseContext;

    void enc;
    void dec;
    void use;
  });

  test("encode の destination に設定した値が読める", async ({ expect }) => {
    // 準備
    const c = createEncodeContext("in", "k") as unknown as IEncodeContext<string, string>;

    // 実行
    c.destination = `${c.source as string}-out`;
    await createNext()();

    // 検証
    expect(c.destination).toBe("in-out");
  });
});
