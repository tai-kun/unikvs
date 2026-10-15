import type { IMiddleware } from "@unikvs/core";
import { describe, test } from "vitest";

import PipelineContext from "../src/_context.js";
import UniKvsMiddleware from "../src/_middleware.js";
import {
  MiddlewareIsNotOpenError,
  EncodableStreamNotSupportedError,
  DecodableStreamNotSupportedError,
} from "../src/errors.js";

function openContext(): IMiddleware.OpenContext {
  return new PipelineContext({ action: "open" }) as IMiddleware.OpenContext;
}

function encodeContext(source: unknown): IMiddleware.EncodeContext {
  return new PipelineContext({
    action: "set",
    key: "k1",
    source,
  }) as IMiddleware.EncodeContext;
}

function decodeContext(source: unknown): IMiddleware.DecodeContext {
  return new PipelineContext({
    action: "get",
    key: "k1",
    source,
  }) as IMiddleware.DecodeContext;
}

async function noop(): Promise<void> {}

/**
 * encode 時に "encoded:" 接頭辞を付与し、decode 時に除去するミドルウェアモックです。
 */
class MockMiddleware implements IMiddleware {
  readonly name = "MockMiddleware";
  isOpen = true;
  openCallCount = 0;
  closeCallCount = 0;

  async open(_c: IMiddleware.OpenContext): Promise<void> {
    this.openCallCount++;
    this.isOpen = true;
  }

  async close(_c: IMiddleware.CloseContext): Promise<void> {
    this.closeCallCount++;
    this.isOpen = false;
  }

  async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = `encoded:${String(c.source)}`;
    await next();
  }

  async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = String(c.source).replace(/^encoded:/, "");
    await next();
  }
}

describe("UniKvsMiddleware - 初期化と接続管理", () => {
  test("ラップしたミドルウェアがオープンされているとき、open で open が呼ばれない", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockMiddleware();
    mock.isOpen = true;
    const middleware = new UniKvsMiddleware(mock);

    // 実行
    await middleware.open(openContext());

    // 検証
    expect(mock.openCallCount).toBe(0);
  });

  test("ラップしたミドルウェアがクローズされているとき、open で open が呼ばれる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockMiddleware();
    mock.isOpen = false;
    const middleware = new UniKvsMiddleware(mock);

    // 実行
    await middleware.open(openContext());

    // 検証
    expect(mock.openCallCount).toBe(1);
  });
});

describe("UniKvsMiddleware - エンコード / デコード", () => {
  test("エンコードしたデータをデコードすると元の値に戻る", async ({ expect }) => {
    // 準備
    const middleware = new UniKvsMiddleware(new MockMiddleware());
    await middleware.open(openContext());

    // 実行
    const ec = encodeContext("hello");
    await middleware.encode(ec, noop);
    const dc = decodeContext(ec.destination);
    await middleware.decode(dc, noop);

    // 検証
    expect(dc.destination).toBe("hello");
  });
});

describe("UniKvsMiddleware - 異常系・エラーハンドリング", () => {
  test("encode 時にミドルウェアが閉じていると MiddlewareIsNotOpenError を投げる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockMiddleware();
    mock.isOpen = false;
    const middleware = new UniKvsMiddleware(mock);

    // 実行と検証
    await expect(middleware.encode(encodeContext("data"), noop)).rejects.toThrow(
      MiddlewareIsNotOpenError,
    );
  });

  test("decode 時にミドルウェアが閉じていると MiddlewareIsNotOpenError を投げる", async ({
    expect,
  }) => {
    // 準備
    const mock = new MockMiddleware();
    mock.isOpen = false;
    const middleware = new UniKvsMiddleware(mock);

    // 実行と検証
    await expect(middleware.decode(decodeContext("data"), noop)).rejects.toThrow(
      MiddlewareIsNotOpenError,
    );
  });

  test("encodeStream でサポートしていないとき EncodableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const middleware = new UniKvsMiddleware(new MockMiddleware());
    await middleware.open(openContext());

    // 実行と検証
    const c = new PipelineContext({
      action: "set",
      key: "k1",
      source: new ReadableStream(),
    }) as IMiddleware.EncodeStreamContext;
    await expect(middleware.encodeStream(c, noop)).rejects.toThrow(
      EncodableStreamNotSupportedError,
    );
  });

  test("decodeStream でサポートしていないとき DecodableStreamNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const middleware = new UniKvsMiddleware(new MockMiddleware());
    await middleware.open(openContext());

    // 実行と検証
    const c = new PipelineContext({
      action: "stream",
      key: "k1",
      source: new ReadableStream(),
    }) as IMiddleware.DecodeStreamContext;
    await expect(middleware.decodeStream(c, noop)).rejects.toThrow(
      DecodableStreamNotSupportedError,
    );
  });
});
