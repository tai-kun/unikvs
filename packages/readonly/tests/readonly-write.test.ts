import type { IMiddleware } from "@unikvs/core";
import {
  captureRejection,
  createClearContext,
  createDeleteContext,
  createEncodeContext,
  createEncodeStreamContext,
  createGetContext,
  createHasContext,
  createNext,
  createSetContext,
  createStreamContext,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import {
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
  ReadOnlySetNotAllowedError,
} from "../src/errors.js";
import ReadOnly from "../src/readonly.js";

/**
 * next の呼び出し回数を記録する関数を作成します。
 * 拒否時に下流の処理が実行されないことと、委譲時に 1 回だけ実行されることの検証に使用します。
 */
function createCountingNext(): {
  readonly state: { calls: number };
  readonly next: IMiddleware.INext;
} {
  const state = { calls: 0 };

  return {
    state,
    next: async () => {
      state.calls += 1;
    },
  };
}

describe("書き込みの拒否", () => {
  test("encode を呼び出したとき、ReadOnlySetNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const { state, next } = createCountingNext();

    // 実行
    const error = await captureRejection(
      transformer.encode(createEncodeContext("v1", "k1") as IMiddleware.EncodeContext, next),
    );

    // 検証: 書き込みを拒否したときは下流を実行しない。
    expect(error).toBeInstanceOf(ReadOnlySetNotAllowedError);
    expect(error).toMatchObject({
      name: "ReadOnlySetNotAllowedError",
      message: 'ReadOnly.set cannot write key "k1".',
      meta: { key: "k1" },
    });
    expect(state.calls).toBe(0);
  });

  test("encodeStream を呼び出したとき、ReadOnlySetNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const { state, next } = createCountingNext();

    // 実行
    const error = await captureRejection(
      transformer.encodeStream(
        createEncodeStreamContext(sourceFrom(["v1"]), "k1") as IMiddleware.EncodeStreamContext,
        next,
      ),
    );

    // 検証: 書き込みを拒否したときは下流を実行しない。
    expect(error).toBeInstanceOf(ReadOnlySetNotAllowedError);
    expect(error).toMatchObject({
      name: "ReadOnlySetNotAllowedError",
      message: 'ReadOnly.set cannot write key "k1".',
      meta: { key: "k1" },
    });
    expect(state.calls).toBe(0);
  });

  test("encode はデータの内容によらず ReadOnlySetNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();

    // 実行と検証
    for (const data of ["v1", new Uint8Array([1]), null]) {
      const error = await captureRejection(
        transformer.encode(
          createEncodeContext(data, "k1") as IMiddleware.EncodeContext,
          createNext(),
        ),
      );

      expect(error).toBeInstanceOf(ReadOnlySetNotAllowedError);
    }
  });

  test("use に set を渡したとき、ReadOnlySetNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const { state, next } = createCountingNext();

    // 実行
    const error = await captureRejection(
      transformer.use(createSetContext("k1") as IMiddleware.UseContext, next),
    );

    // 検証: 書き込みを拒否したときは下流を実行しない。
    expect(error).toBeInstanceOf(ReadOnlySetNotAllowedError);
    expect(error).toMatchObject({
      name: "ReadOnlySetNotAllowedError",
      message: 'ReadOnly.set cannot write key "k1".',
      meta: { key: "k1" },
    });
    expect(state.calls).toBe(0);
  });

  test("use に delete を渡したとき、ReadOnlyDeleteNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const { state, next } = createCountingNext();

    // 実行
    const error = await captureRejection(
      transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, next),
    );

    // 検証: 削除を拒否したときは下流を実行しない。
    expect(error).toBeInstanceOf(ReadOnlyDeleteNotAllowedError);
    expect(error).toMatchObject({
      name: "ReadOnlyDeleteNotAllowedError",
      message: 'ReadOnly.delete with allowDelete false cannot delete key "k1".',
      meta: { key: "k1" },
    });
    expect(state.calls).toBe(0);
  });

  test("use に clear を渡したとき、ReadOnlyClearNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const { state, next } = createCountingNext();

    // 実行
    const error = await captureRejection(
      transformer.use(createClearContext() as IMiddleware.UseContext, next),
    );

    // 検証: 削除を拒否したときは下流を実行しない。
    expect(error).toBeInstanceOf(ReadOnlyClearNotAllowedError);
    expect(error).toMatchObject({
      name: "ReadOnlyClearNotAllowedError",
      message: "ReadOnly.clear with allowDelete false cannot delete all data.",
    });
    expect(state.calls).toBe(0);
  });
});

describe("読み出しの透過", () => {
  test("use に has を渡したとき、next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const { state, next } = createCountingNext();

    // 実行
    await transformer.use(createHasContext("k1") as IMiddleware.UseContext, next);

    // 検証
    expect(state.calls).toBe(1);
  });

  test("use に get を渡したとき、next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const { state, next } = createCountingNext();

    // 実行
    await transformer.use(createGetContext("k1") as IMiddleware.UseContext, next);

    // 検証
    expect(state.calls).toBe(1);
  });

  test("use に stream を渡したとき、next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const { state, next } = createCountingNext();

    // 実行
    await transformer.use(createStreamContext("k1") as IMiddleware.UseContext, next);

    // 検証
    expect(state.calls).toBe(1);
  });
});

describe("削除の許可", () => {
  test("allowDelete が true のとき、use に delete を渡すと next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly({ allowDelete: true });
    const { state, next } = createCountingNext();

    // 実行
    await transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, next);

    // 検証
    expect(state.calls).toBe(1);
  });

  test("allowDelete が true のとき、use に clear を渡すと next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly({ allowDelete: true });
    const { state, next } = createCountingNext();

    // 実行
    await transformer.use(createClearContext() as IMiddleware.UseContext, next);

    // 検証
    expect(state.calls).toBe(1);
  });
});
