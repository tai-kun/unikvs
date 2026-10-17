import type { IMiddleware } from "@unikvs/core";
import { describe, test } from "vitest";

import {
  CloseContext,
  DecodeContext,
  DecodeStreamContext,
  EncodeContext,
  EncodeStreamContext,
  OpenContext,
} from "../src/_contexts.js";
import UniKvsMiddleware from "../src/_middleware.js";
import {
  MiddlewareIsNotOpenError,
  StreamEncodingNotSupportedError,
  StreamDecodingNotSupportedError,
} from "../src/errors.js";
import { Gate } from "./_helpers.js";

function openContext(): IMiddleware.OpenContext {
  return new OpenContext({ signal: new AbortController().signal });
}

function closeContext(): IMiddleware.CloseContext {
  return new CloseContext({ signal: new AbortController().signal });
}

function encodeContext(source: unknown): IMiddleware.EncodeContext {
  return new EncodeContext({
    key: "k1",
    signal: new AbortController().signal,
    source,
  });
}

function decodeContext(source: unknown): IMiddleware.DecodeContext {
  return new DecodeContext({
    key: "k1",
    signal: new AbortController().signal,
    source,
  });
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
    const middleware = UniKvsMiddleware.from(mock);

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
    const middleware = UniKvsMiddleware.from(mock);

    // 実行
    await middleware.open(openContext());

    // 検証
    expect(mock.openCallCount).toBe(1);
  });

  test("close を持たないミドルウェアは参照を数えず、外部で閉じられた後の open で再度実 open する", async ({
    expect,
  }) => {
    // 準備: close を持たないミドルウェア
    const mock = new MockMiddleware();
    mock.isOpen = false;
    // プロトタイプのメソッドは delete できないため、own property を undefined にして close 未定義の分岐を踏みます。
    Object.defineProperty(mock, "close", { value: undefined, configurable: true });
    expect(Object.getOwnPropertyDescriptor(mock, "close")?.value).toBeUndefined();
    const middleware = UniKvsMiddleware.from(mock);

    // 実行: open を繰り返す
    await middleware.open(openContext());
    await middleware.open(openContext());

    // 検証: 参照が積み上がらず実 open は 1 回だけ
    expect(mock.openCallCount).toBe(1);

    // 実行: 外部要因で閉じられた後に再度 open する
    mock.isOpen = false;
    await middleware.open(openContext());

    // 検証: 残った参照にスキップされず実 open がやり直される
    expect(mock.openCallCount).toBe(2);

    // 実行: close は持たないため no-op
    await middleware.close(closeContext());

    // 検証: 実体は開いたまま
    expect(mock.isOpen).toBe(true);
  });

  test("close が同期的に投げても失敗として扱われ、再 open/close できる", async ({ expect }) => {
    // 準備: close が同期的に投げるミドルウェア
    class SyncThrowMiddleware extends MockMiddleware {
      public failSync = true;

      public override close(_c: IMiddleware.CloseContext): Promise<void> {
        this.closeCallCount++;
        if (this.failSync) {
          throw new Error("sync close failure");
        }
        this.isOpen = false;

        return Promise.resolve();
      }
    }
    const mock = new SyncThrowMiddleware();
    mock.isOpen = false;
    const middleware = UniKvsMiddleware.from(mock);
    await middleware.open(openContext());

    // 実行と検証: 同期 throw も close 失敗として記録され、実体は開いたまま
    await expect(middleware.close(closeContext())).rejects.toThrow("sync close failure");
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(1);

    // 実行: 失敗状態からの close を再試行する
    mock.failSync = false;
    await middleware.close(closeContext());

    // 検証: 再試行で閉じられる
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(2);

    // 検証: 再度 open して close できる
    await middleware.open(openContext());
    expect(mock.openCallCount).toBe(2);
    await middleware.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(3);
  });

  test("close 失敗後に新しい open が所有権を引き継いだ場合、retryClose は参照を解放しない", async ({
    expect,
  }) => {
    // 準備: 最初の close だけ失敗するミドルウェア
    class FailOnceMiddleware extends MockMiddleware {
      public failNextClose = true;

      public override async close(_c: IMiddleware.CloseContext): Promise<void> {
        this.closeCallCount++;
        if (this.failNextClose) {
          this.failNextClose = false;
          throw new Error("close failed");
        }
        this.isOpen = false;
      }
    }
    const mock = new FailOnceMiddleware();
    mock.isOpen = false;
    const middleware = UniKvsMiddleware.from(mock);
    await middleware.open(openContext());
    await expect(middleware.close(closeContext())).rejects.toThrow("close failed");

    // 実行: 別の利用者が open して所有権を引き継ぐ
    await middleware.open(openContext());

    // 実行: 失敗した close の再試行は新しい参照を解放しない
    await middleware.retryClose(closeContext());

    // 検証: 実体は開いたままで、実 close も増えていない
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(1);

    // 後片付け: 引き継いだ利用者の close で実体が閉じられる
    await middleware.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(2);
  });

  test("retryClose は進行中の close を待ってから失敗した実 close を再試行する", async ({
    expect,
  }) => {
    // 準備: 最初の close をゲートで保留してから失敗させるミドルウェア
    class GatedFailOnceMiddleware extends MockMiddleware {
      public failNextClose = true;
      public readonly entered = new Gate();
      public readonly release = new Gate();

      public override async close(_c: IMiddleware.CloseContext): Promise<void> {
        this.closeCallCount++;
        if (this.failNextClose) {
          this.failNextClose = false;
          this.entered.open();
          await this.release.wait();
          throw new Error("close failed");
        }
        this.isOpen = false;
      }
    }
    const mock = new GatedFailOnceMiddleware();
    mock.isOpen = false;
    const middleware = UniKvsMiddleware.from(mock);
    await middleware.open(openContext());

    // 実行: 先行 close の完了前に retryClose を開始する
    const closing = middleware.close(closeContext());
    await mock.entered.wait();
    const retrying = middleware.retryClose(closeContext());
    mock.release.open();

    // 検証: 先行 close の失敗を待ってから再試行し、実体は閉じられる
    await expect(closing).rejects.toThrow("close failed");
    await retrying;
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(2);
  });

  test("retryClose は進行中の open が所有権を引き継いだときは実 close しない", async ({
    expect,
  }) => {
    // 準備: close は実体を閉じてから失敗し、次の open をゲートで保留するミドルウェア
    class GatedOpenMiddleware extends MockMiddleware {
      public failNextClose = true;
      public gateOpens = false;
      public readonly entered = new Gate();
      public readonly release = new Gate();

      public override async open(c: IMiddleware.OpenContext): Promise<void> {
        if (this.gateOpens) {
          this.entered.open();
          await this.release.wait();
        }
        await super.open(c);
      }

      public override async close(_c: IMiddleware.CloseContext): Promise<void> {
        this.closeCallCount++;
        this.isOpen = false;
        if (this.failNextClose) {
          this.failNextClose = false;
          throw new Error("close failed");
        }
      }
    }
    const mock = new GatedOpenMiddleware();
    mock.isOpen = false;
    const middleware = UniKvsMiddleware.from(mock);
    await middleware.open(openContext());
    await expect(middleware.close(closeContext())).rejects.toThrow("close failed");

    // 実行: 所有権を引き継ぐ実 open を保留したまま retryClose を開始する
    mock.gateOpens = true;
    const opening = middleware.open(openContext());
    await mock.entered.wait();
    const retrying = middleware.retryClose(closeContext());
    mock.release.open();
    await opening;
    await retrying;

    // 検証: open が所有権を引き継いだため retryClose は実 close しない
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(1);

    // 後片付け: 引き継いだ利用者の close で実体が閉じられる
    await middleware.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(2);
  });

  test("retryClose は実体が既に閉じられているとき失敗状態だけを解消する", async ({ expect }) => {
    // 準備: 実体を閉じてから失敗するミドルウェア
    class CloseThenThrowMiddleware extends MockMiddleware {
      public failOnce = true;

      public override async close(_c: IMiddleware.CloseContext): Promise<void> {
        this.closeCallCount++;
        this.isOpen = false;
        if (this.failOnce) {
          this.failOnce = false;
          throw new Error("close failed");
        }
      }
    }
    const mock = new CloseThenThrowMiddleware();
    mock.isOpen = false;
    const middleware = UniKvsMiddleware.from(mock);
    await middleware.open(openContext());
    await expect(middleware.close(closeContext())).rejects.toThrow("close failed");

    // 実行: 実体が閉じられた状態で retryClose する
    await middleware.retryClose(closeContext());

    // 検証: 実 close はやり直されず、失敗状態も解消されている
    expect(mock.closeCallCount).toBe(1);
    expect(mock.isOpen).toBe(false);
    mock.isOpen = true;
    await middleware.close(closeContext());
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(1);
  });

  test("実 open 保留中の並行 open でも片方の close で実体は閉じられず、もう片方が操作できる", async ({
    expect,
  }) => {
    // 準備: 実 open をゲートで保留するミドルウェア
    class GatedOpenMiddleware extends MockMiddleware {
      public readonly entered = new Gate();
      public readonly release = new Gate();

      public override async open(c: IMiddleware.OpenContext): Promise<void> {
        this.entered.open();
        await this.release.wait();
        await super.open(c);
      }
    }
    const mock = new GatedOpenMiddleware();
    mock.isOpen = false;
    const middleware = UniKvsMiddleware.from(mock);

    // 実行: 1 つ目の実 open を保留したまま 2 つ目の open を並行に開始する
    const first = middleware.open(openContext());
    await mock.entered.wait();
    const second = middleware.open(openContext());
    mock.release.open();
    await first;
    await second;

    // 実行と検証: 片方の close ではまだ利用者が残るため実体は閉じられない
    await middleware.close(closeContext());
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(0);

    // 検証: もう片方の利用者は操作を続けられる
    const c = encodeContext("hello");
    await middleware.encode(c, noop);
    expect(c.destination).toBe("encoded:hello");

    // 後片付け: 最後の close で実体が閉じられる
    await middleware.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(1);
  });

  test("実 open 保留中に 3 つの open が並行しても 2 回の close では閉じられず、3 回目で閉じられる", async ({
    expect,
  }) => {
    // 準備: 実 open をゲートで保留するミドルウェア
    class GatedOpenMiddleware extends MockMiddleware {
      public readonly entered = new Gate();
      public readonly release = new Gate();

      public override async open(c: IMiddleware.OpenContext): Promise<void> {
        this.entered.open();
        await this.release.wait();
        await super.open(c);
      }
    }
    const mock = new GatedOpenMiddleware();
    mock.isOpen = false;
    const middleware = UniKvsMiddleware.from(mock);

    // 実行: 1 つ目の実 open を保留したまま 3 つの open を並行に開始する
    const first = middleware.open(openContext());
    await mock.entered.wait();
    const second = middleware.open(openContext());
    const third = middleware.open(openContext());
    mock.release.open();
    await first;
    await second;
    await third;

    // 実行と検証: 2 回の close ではまだ利用者が残るため実体は閉じられない
    await middleware.close(closeContext());
    await middleware.close(closeContext());
    expect(mock.isOpen).toBe(true);
    expect(mock.closeCallCount).toBe(0);

    // 後片付け: 最後の close で実体が閉じられる
    await middleware.close(closeContext());
    expect(mock.isOpen).toBe(false);
    expect(mock.closeCallCount).toBe(1);
  });
});

describe("UniKvsMiddleware - エンコード / デコード", () => {
  test("エンコードしたデータをデコードすると元の値に戻る", async ({ expect }) => {
    // 準備
    const middleware = UniKvsMiddleware.from(new MockMiddleware());
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
    const middleware = UniKvsMiddleware.from(mock);

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
    const middleware = UniKvsMiddleware.from(mock);

    // 実行と検証
    await expect(middleware.decode(decodeContext("data"), noop)).rejects.toThrow(
      MiddlewareIsNotOpenError,
    );
  });

  test("encodeStream でサポートしていないとき StreamEncodingNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const middleware = UniKvsMiddleware.from(new MockMiddleware());
    await middleware.open(openContext());

    // 実行と検証
    const c = new EncodeStreamContext({
      key: "k1",
      signal: new AbortController().signal,
      source: new ReadableStream(),
    });
    await expect(middleware.encodeStream(c, noop)).rejects.toThrow(StreamEncodingNotSupportedError);
  });

  test("decodeStream でサポートしていないとき StreamDecodingNotSupportedError を投げる", async ({
    expect,
  }) => {
    // 準備
    const middleware = UniKvsMiddleware.from(new MockMiddleware());
    await middleware.open(openContext());

    // 実行と検証
    const c = new DecodeStreamContext({
      key: "k1",
      signal: new AbortController().signal,
      source: new ReadableStream(),
    });
    await expect(middleware.decodeStream(c, noop)).rejects.toThrow(StreamDecodingNotSupportedError);
  });
});
