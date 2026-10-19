import { AllowRepair } from "@unikvs/allow-repair";
import type { IMiddleware } from "@unikvs/core";
import { RepairNotAllowedError } from "@unikvs/core";
import { describe, test, vi } from "vitest";

import { logger, repairLogger } from "../src/_logger.js";
import { MiddlewareNextNotCalledError, PluginOperationAggregateError } from "../src/errors.js";
import UniKvs from "../src/unikvs.js";
import { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  FakeMiddleware,
  FakeStorage,
  FakeStreamMiddleware,
  FakeStreamStorage,
  Gate,
  collect,
  isPending,
  streamOf,
  withTimeout,
} from "./_helpers.js";

// -------------------------------------------------------------------------------------------------
//
// 共有ライフサイクル (3 クライアント以上)
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - 3 クライアント以上が共有するプラグインのライフサイクル", () => {
  test("最後の close が 1 回失敗しても retry で閉じられ、参照が残らない", async ({ expect }) => {
    // 準備: 3 クライアントが同じストレージを共有する。実 close は 1 回だけ失敗する。
    const storage = new FakeStorage();
    let failClose = true;
    storage.hook = (call) => {
      if (call.method === "close" && failClose) {
        failClose = false;
        throw new Error("transient close failure");
      }
    };
    const config = UniKvs.config<{ a: PlainValue<string> }>().persist(storage);
    const a = config.create();
    const b = config.create();
    const c = config.create();
    await a.open();
    await b.open();
    await c.open();

    // 実行: 参照が残る 2 つの close では実体を閉じず、最後の close だけが失敗して retry される
    await a.close();
    await b.close();
    await expect(c.close()).rejects.toThrow(PluginOperationAggregateError);

    // 検証: retry で実体は閉じられ、参照も残っていない
    expect(storage.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(2);
    expect(storage.callsOf("open")).toHaveLength(1);

    // 検証: 新しいクライアントは先頭から open し直せる
    const d = config.create();
    await d.open();
    await d.set("a", "value");
    await expect(d.get("a")).resolves.toBe("value");
    await d.close();
    expect(storage.isOpen).toBe(false);
  });

  test("実 open 保留中に close が走っても参照リークや早期クローズがない", async ({ expect }) => {
    // 準備: 外部要因で閉じられた後の再 open (フォールバック) をゲートで保留する
    const storage = new FakeStorage();
    const entered = new Gate();
    const release = new Gate();
    let gateOpen = false;
    storage.hook = async (call) => {
      if (call.method === "open" && gateOpen) {
        entered.open();
        await release.wait();
      }
    };
    const config = UniKvs.config<{ a: PlainValue<string> }>().persist(storage);
    const a = config.create();
    const b = config.create();
    const c = config.create();
    await a.open();
    storage.isOpen = false;

    // 実行: B と C の open を保留したまま A を close する
    gateOpen = true;
    const bOpen = b.open();
    const cOpen = c.open();
    await entered.wait();
    const aClose = a.close();

    // 検証: close はフォールバック open の完了を待ち、実体を閉じない
    await expect(isPending(aClose)).resolves.toBe(true);
    release.open();
    await bOpen;
    await cOpen;
    await aClose;
    expect(storage.isOpen).toBe(true);
    expect(storage.callsOf("open")).toHaveLength(2);
    expect(storage.callsOf("close")).toHaveLength(0);

    // 検証: B の close でも C の参照が残るため閉じられず、最後の close でだけ閉じられる
    await b.close();
    expect(storage.isOpen).toBe(true);
    await c.close();
    expect(storage.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(1);
  });

  test("abort 済み signal の close と通常 close が並行しても実 close は 1 回で、再 open できる", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ a: PlainValue<string> }>().persist(storage).create();
    await kvs.open();
    const reason = new Error("close aborted");

    // 実行: 失敗する close (abort 済み signal) と成功する close を同時に開始する
    const aborted = kvs.close({ signal: AbortSignal.abort(reason) });
    const normal = kvs.close();
    const results = await Promise.allSettled([aborted, normal]);

    // 検証: 片方だけが成功し、実 close の二重実行はない
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(kvs.isOpen).toBe(false);
    expect(storage.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(1);

    // 検証: 二重解放されておらず、再 open/close が一貫する
    await kvs.open();
    await kvs.set("a", "value");
    await expect(kvs.get("a")).resolves.toBe("value");
    await kvs.close();
    expect(storage.callsOf("close")).toHaveLength(2);
    expect(storage.callsOf("open")).toHaveLength(2);
  });
});

// -------------------------------------------------------------------------------------------------
//
// ミドルウェアの close 回復
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - ミドルウェアの close 回復", () => {
  test("close が連続失敗しても参照は失われず、後続の open/close が一貫する", async ({ expect }) => {
    // 準備: close が 2 回連続で失敗するミドルウェア (通常 close と retry の両方を失敗させる)
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware("M");
    let failClose = 2;
    middleware.hook = (call) => {
      if (call.method === "close" && failClose > 0) {
        failClose--;
        throw new Error("close failed");
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(middleware)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行と検証: retry も失敗するが、参照は保持されて実体は開いたまま
    await expect(kvs.close()).rejects.toThrow(PluginOperationAggregateError);
    expect(kvs.isOpen).toBe(false);
    expect(middleware.isOpen).toBe(true);
    expect(middleware.callsOf("close")).toHaveLength(2);
    expect(storage.isOpen).toBe(false);

    // 実行: 失敗状態からの再 open は所有権を引き継ぎ、操作を継続できる
    await kvs.open();
    await kvs.set("foo", "value");
    await expect(kvs.get("foo")).resolves.toBe("value");

    // 後片付け: この close で実体が閉じられる
    await kvs.close();
    expect(middleware.isOpen).toBe(false);
    expect(middleware.callsOf("close")).toHaveLength(3);
  });
});

// -------------------------------------------------------------------------------------------------
//
// 外部で開かれたプラグイン
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - 外部で開かれたプラグインは管理対象外", () => {
  test("既に外部で開かれているストレージは open/close を呼ばない", async ({ expect }) => {
    // 準備: クライアントの open 前に外部要因で開かれているストレージ
    const storage = new FakeStorage();
    storage.isOpen = true;
    const kvs = UniKvs.config<{ a: PlainValue<string> }>().persist(storage).create();

    // 実行
    await kvs.open();
    await kvs.set("a", "value");

    // 検証: 外部の open を重ねず、操作はそのまま利用できる
    expect(storage.callsOf("open")).toHaveLength(0);
    await expect(kvs.get("a")).resolves.toBe("value");

    // 実行
    await kvs.close();

    // 検証: 管理下にない実体は閉じない
    expect(storage.callsOf("close")).toHaveLength(0);
    expect(storage.isOpen).toBe(true);
  });

  test("既に外部で開かれているミドルウェアは open/close を呼ばない", async ({ expect }) => {
    // 準備
    const middleware = new FakeMiddleware();
    middleware.isOpen = true;
    const storage = new FakeStorage();
    const kvs = UniKvs.config<{ a: PlainValue<string> }>()
      .use(middleware)
      .persist(storage)
      .create();

    // 実行
    await kvs.open();
    await kvs.set("a", "value");

    // 検証
    expect(middleware.callsOf("open")).toHaveLength(0);
    await expect(kvs.get("a")).resolves.toBe("value");

    // 実行
    await kvs.close();

    // 検証
    expect(middleware.callsOf("close")).toHaveLength(0);
    expect(middleware.isOpen).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------------
//
// stream repair の後段失敗
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - stream repair の next 後失敗", () => {
  test("next 後の非拒否失敗は error に記録して読み取りを成功させ、書き戻しも完了する", async ({
    expect,
  }) => {
    // 準備: next() 後に非拒否エラーを投げるストリームミドルウェア
    using errorSpy = vi.spyOn(logger, "error");
    class ThrowAfterNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        throw new Error("post-next stream failure");
      }
    }
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .use(new ThrowAfterNextStreamMiddleware("PostFailStream"))
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    const chunks = [new Uint8Array([1]), new Uint8Array([2])];
    server.map.set("logs", chunks);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    await expect(collect(vs)).resolves.toStrictEqual(chunks);

    // 検証: 補助処理の失敗は error に記録され、読み取り自体は壊れない
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      ["Failed to repair a storage: ", ""],
      expect.objectContaining({ message: "post-next stream failure" }),
    );

    // 検証: 書き戻しは dispose までに完了している
    await vs.dispose();
    expect(cache.map.get("logs")).toStrictEqual(chunks);
  });

  test("next 後の拒否は既定では warn のみで読み取り成功し、書き戻しも完了する", async ({
    expect,
  }) => {
    // 準備: next() 後に RepairNotAllowedError を投げるストリームミドルウェア
    using warnSpy = vi.spyOn(repairLogger, "warn");
    class DenyAfterNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        throw new RepairNotAllowedError({ names: [this.name] });
      }
    }
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .use(new DenyAfterNextStreamMiddleware("DenyAfterNextStream"))
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    const chunks = [new Uint8Array([1]), new Uint8Array([2])];
    server.map.set("logs", chunks);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    await expect(collect(vs)).resolves.toStrictEqual(chunks);

    // 検証: 拒否は warn に留められ、書き戻しは構築済みの分岐で完了する
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      ["Failed to repair a storage: ", ""],
      expect.any(RepairNotAllowedError),
    );
    await vs.dispose();
    expect(cache.map.get("logs")).toStrictEqual(chunks);
  });

  test("next 後の拒否は throwOnRepairDenied 指定時のみ読み取りを失敗させる", async ({ expect }) => {
    // 準備
    class DenyAfterNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        throw new RepairNotAllowedError({ names: [this.name] });
      }
    }
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .use(new DenyAfterNextStreamMiddleware("DenyAfterNextStream"))
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    // 実行
    const streaming = kvs.stream("logs", { repair: true, throwOnRepairDenied: true });

    // 検証: 厳格指定では読み取りが失敗し、書き戻しも行われない
    await expect(streaming).rejects.toThrow(RepairNotAllowedError);
    expect(cache.map.has("logs")).toBe(false);
  });

  test("子節のセットアップ失敗は best-effort に丸めず読み取りを失敗させる", async ({ expect }) => {
    // 準備: 親の next() 実行中に、子節の encodeStream がセットアップで失敗する
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const broken = new FakeStreamMiddleware<Uint8Array>("broken");
    broken.errors["encodeStream"] = new Error("child setup failed");
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AllowRepair())
      .use(new FakeStreamMiddleware<Uint8Array>("parent"))
      .use(broken)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    // 実行と検証: 親の後処理失敗と取り違えず、読み取り全体が失敗する
    await expect(kvs.stream("logs", { repair: true })).rejects.toThrow("child setup failed");
  });
});

// -------------------------------------------------------------------------------------------------
//
// close とストリーム操作の競合
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - close とストリーム操作の競合", () => {
  test("ライブ ValueStream を保持した close は dispose まで待機し、実 close を 1 回だけ行う", async ({
    expect,
  }) => {
    // 準備
    const storage = new FakeStreamStorage();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();
    await kvs.set("logs", streamOf([new Uint8Array([1]), new Uint8Array([2])]));
    const vs = await kvs.stream("logs");
    const reader = vs.getReader();
    await reader.read();

    // 実行: 読み取り中の close はキーの読み取りロック解放を待つ
    const closing = kvs.close();
    await expect(isPending(closing)).resolves.toBe(true);

    // 実行: 破棄すると close が完了する
    await vs.dispose();
    await expect(withTimeout(closing, 2000, "close-with-live-stream")).resolves.toBeUndefined();

    // 検証
    expect(kvs.isOpen).toBe(false);
    expect(storage.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(1);
  });

  test("ストリーム書き込み中の close は書き込み失敗を待って完了し、ソースを 1 回だけ解放する", async ({
    expect,
  }) => {
    // 準備: 書き込みをゲートで保留し、abort されたソースを書き込み失敗として報告する
    const storage = new FakeStreamStorage();
    const writeGate = new Gate();
    storage.writeGate = writeGate;
    storage.failWriteOnAbort = true;
    const entered = Promise.withResolvers<void>();
    storage.onWriteStart = () => entered.resolve();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>().persist(storage).create();
    await kvs.open();
    let cancelCount = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelCount++;
      },
    });

    // 実行: 書き込み開始後に close を呼ぶ
    const pending = kvs.set("logs", source);
    const setFails = expect(withTimeout(pending, 2000, "set-during-close")).rejects.toThrow(
      PluginOperationAggregateError,
    );
    await entered.promise;
    const closing = kvs.close();
    writeGate.open();

    // 検証: 書き込みは close の abort で集約エラーになり、close は待機後に完了する
    await setFails;
    await expect(withTimeout(closing, 2000, "close-during-set")).resolves.toBeUndefined();
    expect(kvs.isOpen).toBe(false);
    expect(storage.isOpen).toBe(false);

    // 検証: ソースは二重キャンセルされず、ロックも残らない
    expect(cancelCount).toBe(1);
    expect(source.locked).toBe(false);
    expect(storage.map.has("logs")).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------------
//
// ミドルウェア失敗時のソース解放 (回帰)
//
// -------------------------------------------------------------------------------------------------

describe("UniKvs - ミドルウェア失敗時のソース解放", () => {
  test("encodeStream が destination を分岐させたまま next を呼ばずに失敗してもソースは解放される", async ({
    expect,
  }) => {
    // 準備: pipeThrough でソースをロックした destination を設定し、next() を呼ばずに失敗する。
    // next() 内でのみ output が streams に登録される実装では、ソースがロックされたまま残っていた。
    class WrapThenThrowStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        _next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source.pipeThrough(new TransformStream());
        throw new Error("boom after wrap without next");
      }
    }
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new WrapThenThrowStreamMiddleware("WrapThenThrow"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const setting = kvs.set("logs", source);

    // 検証: 失敗してもソースのリソースは解放される
    await expect(setting).rejects.toMatchObject({ message: "boom after wrap without next" });
    expect(cancelled).toBe(true);
    expect(source.locked).toBe(false);
  });

  test("decodeStream が destination を分岐させて失敗してもソースは解放される", async ({
    expect,
  }) => {
    // 準備: pipeThrough でソースをロックした destination を設定して失敗する。
    // 失敗時のキャンセル対象は pipes に未登録のため、ソースがロックされたまま残っていた。
    class WrapThenThrowDecodeMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async decodeStream(
        c: IMiddleware.DecodeStreamContext,
        _next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source.pipeThrough(new TransformStream());
        throw new Error("decode boom after wrap");
      }
    }
    class CancelObservableReadStorage extends FakeStreamStorage {
      public cancelled = false;

      public override getReadable(): ReadableStream<Uint8Array> {
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
          cancel: () => {
            this.cancelled = true;
          },
        });
      }
    }
    const storage = new CancelObservableReadStorage("cancelaware");
    storage.map.set("logs", [new Uint8Array([1])]);
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new WrapThenThrowDecodeMiddleware("WrapThenThrowDecode"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const streaming = kvs.stream("logs");

    // 検証: 失敗してもソースのリソースは解放される
    await expect(streaming).rejects.toMatchObject({ message: "decode boom after wrap" });
    expect(storage.cancelled).toBe(true);
  });

  test("decodeStream の next 完了後に abort してもソースストリームが解放される", async ({
    expect,
  }) => {
    // 準備: pipeThrough でソースをロックした destination を設定し、next() 完了直後に中断する。
    // abort では catch が destination の収集より先に抜ける実装では、ソースがロックされたまま残っていた。
    const reason = new Error("abort after next");
    const ac = new AbortController();
    class AbortAfterNextDecodeMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async decodeStream(
        c: IMiddleware.DecodeStreamContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source.pipeThrough(new TransformStream());
        await next();
        ac.abort(reason);
      }
    }
    class CancelObservableReadStorage extends FakeStreamStorage {
      public cancelled = false;

      public override getReadable(): ReadableStream<Uint8Array> {
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
          cancel: () => {
            this.cancelled = true;
          },
        });
      }
    }
    const storage = new CancelObservableReadStorage("cancelaware-abort-after-next");
    storage.map.set("logs", [new Uint8Array([1])]);
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new AbortAfterNextDecodeMiddleware("AbortAfterNextDecode"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const streaming = kvs.stream("logs", { signal: ac.signal });

    // 検証: 中断理由で失敗し、ロックされたソースも解放される
    await expect(streaming).rejects.toBe(reason);
    expect(storage.cancelled).toBe(true);
  });

  test("encodeStream が destination を設定して next を呼ばず規約違反で失敗してもソースは解放される", async ({
    expect,
  }) => {
    // 準備: pipeThrough でソースをロックした destination を設定し、next() を呼ばずに正常終了する (規約違反)。
    // 規約違反では catch が destination の収集より先に抜ける実装では、ソースがロックされたまま残っていた。
    class WrapWithoutNextStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
      public override async encodeStream(
        c: IMiddleware.EncodeStreamContext,
        _next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source.pipeThrough(new TransformStream());
      }
    }
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const storage = new FakeStreamStorage();
    await using kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .use(new WrapWithoutNextStreamMiddleware("WrapWithoutNext"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行
    const setting = kvs.set("logs", source);

    // 検証: 規約違反エラーは維持され、失敗してもソースのリソースは解放される
    await expect(setting).rejects.toThrow(MiddlewareNextNotCalledError);
    expect(cancelled).toBe(true);
    expect(source.locked).toBe(false);
  });
});
