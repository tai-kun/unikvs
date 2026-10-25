import { AllowRepair } from "@unikvs/allow-repair";
import type { IStorage, IMiddleware } from "@unikvs/core";
import { ReadonlyVariableError, RepairNotAllowedError } from "@unikvs/core";
import { instance } from "valibot";
import { vi, test, describe } from "vite-plus/test";

import { repairLogger } from "../src/_logger.js";
import { UniKvsIsNotOpenError, PluginOperationAggregateError } from "../src/errors.js";
import { Builder } from "../src/index.js";
import type { PlainValue } from "../src/value-schemas.js";
import { StreamValue } from "../src/value-schemas.js";
import { Gate, isPending, FakeStorage, FakeMiddleware, FakeStreamStorage } from "./_helpers.js";

/**
 * キーに接頭辞を付けて写像するミドルウェアです。
 * mapKey の写像結果が CRUD 全体で一貫して使われることの検証に使用します。
 */
class PrefixKeyMiddleware extends FakeMiddleware {
  public constructor() {
    super("PrefixKey");
  }

  public override mapKey(c: IMiddleware.MapKeyContext): string {
    return `p:${c.key}`;
  }
}

/**
 * use が常に失敗するミドルウェアです。
 * 操作の前段で失敗したときのストリーム後始末の検証に使用します。
 */
class ThrowingUseMiddleware extends FakeMiddleware {
  public constructor() {
    super("ThrowingUse");
  }

  public override async use(): Promise<void> {
    throw new Error("USE-FAILED");
  }
}

/**
 * write のコンテキストで変数を書き込むストレージです。
 * 読み取り専用変数の共有ストアがストレージまで引き継がれることの検証に使用します。
 */
class VarWritingStorage extends FakeStorage {
  public constructor() {
    super("VarWriting");
  }

  public override async write(
    c: Parameters<FakeStorage["write"]>[0],
    data: unknown,
  ): Promise<void> {
    (c as { set: (name: string, value: unknown) => void }).set("locked", "overwritten");
    await super.write(c, data);
  }
}

describe("UniKvs - ストレージの共有とライフサイクル", () => {
  test("同じストレージを共有する 2 つのクライアントを両方 close するとストレージは閉じられる", async ({
    expect,
  }) => {
    // 準備 : 同じビルダーから 2 つのクライアントを作り、同じストレージとミドルウェアを共有する。
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware();
    const builder = new Builder().use(middleware).persist(storage);
    const a = builder.build();
    const b = builder.build();
    await a.open();
    await b.open();

    // 実行 : 両方のクライアントを閉じる。
    await a.close();
    await b.close();

    // 検証 : 利用者がいなくなったのだから各プラグインは閉じられている。
    expect({
      storageIsOpen: storage.isOpen,
      middlewareIsOpen: middleware.isOpen,
      storageCloseCalls: storage.callsOf("close").length,
      middlewareCloseCalls: middleware.callsOf("close").length,
    }).toStrictEqual({
      storageIsOpen: false,
      middlewareIsOpen: false,
      storageCloseCalls: 1,
      middlewareCloseCalls: 1,
    });
  });

  test("実 open 保留中に 2 クライアントが並行 open しても片方の close で共有ストレージは閉じられない", async ({
    expect,
  }) => {
    // 準備 : 実 open をゲートで保留するストレージ。
    const storage = new FakeStorage();
    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "open") {
        entered.open();
        await release.wait();
      }
    };

    const builder = new Builder<{ a: PlainValue<string> }>().persist(storage);
    const a = builder.build();
    const b = builder.build();

    // 実行 : 実 open を保留したまま 2 クライアントが並行 open する。
    const aOpen = a.open();
    const bOpen = b.open();

    await entered.wait();
    // 待機側が実 open の完了待ちに入るまでマイクロタスクを流します。
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(isPending(aOpen)).resolves.toBe(true);
    await expect(isPending(bOpen)).resolves.toBe(true);
    release.open();
    await aOpen;
    await bOpen;

    // 実行 : 片方だけ close する。
    await a.close();

    // 検証 : 実体は閉じられず、もう片方のクライアントは操作を続けられる。
    expect(storage.isOpen).toBe(true);
    expect(storage.callsOf("close")).toHaveLength(0);
    await b.set("a", "value");
    await expect(b.get("a")).resolves.toBe("value");

    // 後片付け : 最後の close で実体が閉じられる。
    await b.close();
    expect(storage.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(1);
  });

  test("実 open 保留中に 2 クライアントが並行 open しても片方の close で共有ミドルウェアは閉じられない", async ({
    expect,
  }) => {
    // 準備 : 実 open をゲートで保留するミドルウェア。
    const storage = new FakeStorage();
    const middleware = new FakeMiddleware();
    const entered = new Gate();
    const release = new Gate();
    middleware.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "open") {
        entered.open();
        await release.wait();
      }
    };

    const builder = new Builder<{ a: PlainValue<string> }>().use(middleware).persist(storage);
    const a = builder.build();
    const b = builder.build();

    // 実行 : 実 open を保留したまま 2 クライアントが並行 open する。
    const aOpen = a.open();
    const bOpen = b.open();

    await entered.wait();
    // 待機側が実 open の完了待ちに入るまでマイクロタスクを流します。
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(isPending(aOpen)).resolves.toBe(true);
    await expect(isPending(bOpen)).resolves.toBe(true);
    release.open();
    await aOpen;
    await bOpen;

    // 実行 : 片方だけ close する。
    await a.close();

    // 検証 : 実体は閉じられず、もう片方のクライアントは操作を続けられる。
    expect(middleware.isOpen).toBe(true);
    expect(middleware.callsOf("close")).toHaveLength(0);
    await b.set("a", "value");
    await expect(b.get("a")).resolves.toBe("value");

    // 後片付け : 最後の close で実体が閉じられる。
    await b.close();
    expect(middleware.isOpen).toBe(false);
    expect(middleware.callsOf("close")).toHaveLength(1);
  });

  test("同じストレージを persist で複数回登録したとき open と close は重複しない", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStorage();
    const kvs = new Builder().persist(storage).persist(storage).build();

    // 実行：
    await kvs.open();
    await kvs.close();

    // 検証 : ラッパーは同じストレージの open/close を高々 1 回にまとめる。
    expect({
      openCalls: storage.callsOf("open").length,
      closeCalls: storage.callsOf("close").length,
    }).toStrictEqual({
      openCalls: 1,
      closeCalls: 1,
    });
  });

  test("close 進行中に開始した操作は UniKvsIsNotOpenError で失敗する", async ({ expect }) => {
    // 準備 : close をストレージのクローズ中で保留する。
    const storage = new FakeStorage();
    const entered = new Gate();
    const release = new Gate();
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "close") {
        entered.open();
        await release.wait();
      }
    };

    const kvs = new Builder<{ a: PlainValue<string> }>().persist(storage).build();
    await kvs.open();

    const closing = kvs.close();

    await entered.wait();

    // 実行と検証 : close 完了前の操作は拒否される。
    await expect(kvs.set("a", "value")).rejects.toThrow(UniKvsIsNotOpenError);
    await expect(kvs.has("a")).rejects.toThrow(UniKvsIsNotOpenError);

    // 後片付け。
    release.open();
    await closing;
    expect(kvs.isOpen).toBe(false);
  });

  test("close 進行中に開始した open は close 完了後に実 open する", async ({ expect }) => {
    // 準備 : 実 close をゲートで保留する。
    const storage = new FakeStorage();
    const probe = new FakeMiddleware("probe");
    const entered = new Gate();
    const release = new Gate();
    const bReachedOpen = new Gate();
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "close") {
        entered.open();
        await release.wait();
      }
    };

    const builder = new Builder<{ a: PlainValue<string> }>().use(probe).persist(storage);
    const a = builder.build();
    const b = builder.build();
    await a.open();
    // ストレージの open はミドルウェアの open より先に呼ばれるため、この通知で B が close 待ちに入ったことを確認できます。
    probe.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "open") {
        bReachedOpen.open();
      }
    };

    // 実行 : A の実 close が保留している間に B が open する。
    const closing = a.close();

    await entered.wait();
    const opening = b.open();

    await bReachedOpen.wait();

    // 検証 : B は close 完了前に実 open せず、close 待ちで保留している。
    await expect(isPending(opening)).resolves.toBe(true);
    expect(storage.callsOf("open")).toHaveLength(1);

    release.open();
    await closing;
    await opening;

    // 検証 : B は close 完了を待って実 open しており、操作を継続できる。
    await b.set("a", "value");
    await expect(b.get("a")).resolves.toBe("value");
    expect(storage.callsOf("open")).toHaveLength(2);

    // 後片付け。
    await b.close();
    expect(storage.isOpen).toBe(false);
  });

  test("参照が残っていても実ストレージが閉じられていれば open は実 open にフォールバックする", async ({
    expect,
  }) => {
    // 準備：
    const storage = new FakeStorage();
    const builder = new Builder<{ a: PlainValue<string> }>().persist(storage);
    const kvs1 = builder.build();
    const kvs2 = builder.build();
    await kvs1.open();

    // 実行 : 外部要因で実ストレージが閉じられる。
    storage.isOpen = false;

    // 実行 : 共有する kvs2 の open は既存参照を失わずに実 open する。
    await kvs2.open();
    await kvs2.set("a", "value");

    // 検証：
    expect(storage.callsOf("open")).toHaveLength(2);
    await expect(kvs2.get("a")).resolves.toBe("value");

    // 検証 : kvs2 の close では kvs1 の参照が残るため実 close しない。
    await kvs2.close();
    expect(storage.isOpen).toBe(true);
    expect(storage.callsOf("close")).toHaveLength(0);

    // 後片付け : kvs1 の close で実 close される。
    await kvs1.close();
    expect(storage.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(1);
  });

  test("close 失敗後に別のクライアントが open した場合、retry はその参照を解放しない", async ({
    expect,
  }) => {
    // 準備 : P の close が 1 回だけ失敗する。B の open を probe で観測して close 待ちに入ったことを確認する。
    const storage = new FakeStorage("P");
    const probe = new FakeMiddleware("probe");
    const entered = new Gate();
    const release = new Gate();
    const bReachedOpen = new Gate();
    let failClose = true;
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "close" && failClose) {
        failClose = false;
        entered.open();
        await release.wait();
        throw new Error("close failed");
      }
    };

    const builder = new Builder<{ a: PlainValue<string> }>().use(probe).persist(storage);
    const a = builder.build();
    const b = builder.build();
    await a.open();

    probe.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "open") {
        bReachedOpen.open();
      }
    };

    // 実行 : A の close を保留し、その間に B が open して所有権を引き継ぐ。
    const closing = a.close();

    await entered.wait();
    const opening = b.open();

    await bReachedOpen.wait();
    await expect(isPending(opening)).resolves.toBe(true);
    release.open();
    await expect(closing).rejects.toThrow(PluginOperationAggregateError);
    await opening;

    // 検証 : B が引き継いだ実体を retry が閉じていない。
    expect(storage.isOpen).toBe(true);
    expect(storage.callsOf("close")).toHaveLength(1);
    await b.set("a", "value");
    await expect(b.get("a")).resolves.toBe("value");

    // 後片付け : B の close でだけ実体が閉じられる。
    await b.close();
    expect(storage.isOpen).toBe(false);
    expect(storage.callsOf("close")).toHaveLength(2);
  });

  test("同期 throw する close の失敗後も再 open/close できる", async ({ expect }) => {
    // 準備 : 最初の close だけ同期的に投げるストレージ。
    class SyncThrowCloseStorage extends FakeStorage {
      public failSync = true;

      public override close(c: IStorage.CloseContext): Promise<void> {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (this.failSync) {
          this.failSync = false;
          throw new Error("sync close failed");
        }

        return super.close(c);
      }
    }

    const storage = new SyncThrowCloseStorage();
    const kvs = new Builder<{ a: PlainValue<string> }>().persist(storage).build();
    await kvs.open();

    // 実行と検証 : 同期 throw で close は失敗し、外部から見た接続は閉じている。
    await expect(kvs.close()).rejects.toThrow(PluginOperationAggregateError);
    expect(kvs.isOpen).toBe(false);

    // 実行 : 失敗状態から再 open して close する。
    await kvs.open();
    expect(kvs.isOpen).toBe(true);
    await kvs.close();

    // 検証 : 再 open/close が破綻せず、実体も閉じられている。
    expect(kvs.isOpen).toBe(false);
    expect(storage.isOpen).toBe(false);
  });

  test("共有ストレージと片方のクライアント固有ストレージの close 失敗で他方の参照を解放しない", async ({
    expect,
  }) => {
    // 準備 : A/B が P を共有し、A だけ Q を持つ。Q の close は 1 回だけ失敗する。
    const p = new FakeStorage("P");
    const q = new FakeStorage("Q");
    let failQClose = true;
    q.hook = (call): void => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "close" && failQClose) {
        failQClose = false;
        throw new Error("transient Q close failure");
      }
    };

    const a = new Builder<{ a: PlainValue<string> }>().persist(p).persist(q).build();
    const b = new Builder<{ a: PlainValue<string> }>().persist(p).build();
    await a.open();
    await b.open();

    // 実行 : A の close は Q の close 失敗で拒否される (Q は再試行で閉じられる)。
    await expect(a.close()).rejects.toThrow(PluginOperationAggregateError);
    expect(a.isOpen).toBe(false);

    expect(q.isOpen).toBe(false);

    // 検証 : 共有 P は B の参照が残るため実 close されない。
    expect(p.isOpen).toBe(true);
    expect(p.callsOf("close")).toHaveLength(0);

    // 後片付け : B はそのまま操作でき、B の close で P が実際に閉じられる。
    await b.set("a", "value");
    await expect(b.get("a")).resolves.toBe("value");
    await b.close();
    expect(p.isOpen).toBe(false);
    expect(p.callsOf("close")).toHaveLength(1);
  });
});

describe("UniKvs - 同一キー書き込みのキーロック解放", () => {
  test("先行 set が abort 失敗しても待機中の set は成功する", async ({ expect }) => {
    // 準備 : 最初の書き込みだけをゲートで保留する。
    const storage = new FakeStorage();
    const entered = new Gate();
    const release = new Gate();
    let firstWrite = true;
    storage.hook = async (call): Promise<void> => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      if (call.method === "write" && call.key === "a" && firstWrite) {
        firstWrite = false;
        entered.open();
        await release.wait();
        call.signal?.throwIfAborted();
      }
    };

    await using kvs = new Builder<{ a: PlainValue<string> }>().persist(storage).build();
    await kvs.open();

    const controller = new AbortController();

    // 実行 : 先行 set を保留し、待機中の後続 set を開始してから先行を abort する。
    const first = kvs.set("a", "first", { signal: controller.signal });

    await entered.wait();
    const second = kvs.set("a", "second");

    controller.abort(new Error("USER-CANCEL"));
    release.open();

    // 検証 : キーロックは解放され、待機中の set が成功する。
    await expect(first).rejects.toThrow(PluginOperationAggregateError);
    await expect(second).resolves.toBeUndefined();
    expect(storage.map.get("a")).toBe("second");
  });
});

describe("UniKvs - set の前段失敗時のストリーム後始末", () => {
  test("abort 済み signal でのストリーム set はソースストリームをキャンセルする", async ({
    expect,
  }) => {
    // 準備：
    const reason = new Error("USER-CANCEL");
    const storage: IStorage = new FakeStreamStorage();
    await using kvs = new Builder({
      schema: { logs: StreamValue(instance(Uint8Array)) },
    })
      .persist(storage)
      .build();
    await kvs.open();

    const cancelled = { value: false };
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      cancel(): void {
        cancelled.value = true;
      },
    });

    // 実行：
    await expect(kvs.set("logs", source, { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    );

    // 検証 : 消費されないソースストリームは解放されている。
    await Promise.resolve();
    expect(cancelled.value).toBe(true);
  });

  test("use が失敗したストリーム set はソースストリームをキャンセルする", async ({ expect }) => {
    // 準備：
    const storage = new FakeStreamStorage();
    await using kvs = new Builder({ schema: { logs: StreamValue(instance(Uint8Array)) } })
      .use(new ThrowingUseMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    const cancelled = { value: false };
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      cancel(): void {
        cancelled.value = true;
      },
    });

    // 実行：
    await expect(kvs.set("logs", source)).rejects.toThrow(PluginOperationAggregateError);

    // 検証 : 消費されないソースストリームは解放されている。
    await Promise.resolve();
    expect(cancelled.value).toBe(true);
  });
});

describe("UniKvs - キー写像と CRUD", () => {
  test("mapKey の写像結果が set/get/has/delete で一貫して使われる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = new Builder<{ a: PlainValue<string> }>()
      .use(new PrefixKeyMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("a", "value");

    // 検証 : 物理キーは写像後。
    expect(storage.map.get("p:a")).toBe("value");
    expect(storage.map.has("a")).toBe(false);
    await expect(kvs.has("a")).resolves.toBe(true);
    await expect(kvs.get("a")).resolves.toBe("value");

    // 実行：
    await kvs.delete("a");

    // 検証：
    expect(storage.map.has("p:a")).toBe(false);
    await expect(kvs.has("a")).resolves.toBe(false);
  });

  test("falsy な値でも get は保存した値をそのまま返す", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    await using kvs = new Builder<{
      a: PlainValue<false>;
      b: PlainValue<0>;
      c: PlainValue<"">;
      d: PlainValue<null>;
    }>()
      .persist(storage)
      .build();
    await kvs.open();

    // 実行と検証：
    await kvs.set("a", false);
    await kvs.set("b", 0);
    await kvs.set("c", "");
    await kvs.set("d", null);
    await expect(kvs.get("a")).resolves.toBe(false);
    await expect(kvs.get("b")).resolves.toBe(0);
    await expect(kvs.get("c")).resolves.toBe("");
    await expect(kvs.get("d")).resolves.toBe(null);
    await expect(kvs.has("a")).resolves.toBe(true);
    await expect(kvs.has("d")).resolves.toBe(true);
  });
});

describe("UniKvs - 読み取り専用の変数", () => {
  test("use で読み取り専用にした変数はストレージ書き込みで ReadonlyVariableError になる", async ({
    expect,
  }) => {
    // 準備 : encode で読み取り専用変数を設定するミドルウェア。
    class LockVarMiddleware extends FakeMiddleware {
      public constructor() {
        super("LockVar");
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.setReadonly("locked", "original");
        c.destination = c.source;
        await next();
      }
    }

    const storage = new VarWritingStorage();
    await using kvs = new Builder<{ a: PlainValue<string> }>()
      .use(new LockVarMiddleware())
      .persist(storage)
      .build();
    await kvs.open();

    // 実行：
    const setting = kvs.set("a", "value");

    // 検証 : 共有ストアの読み取り専用がストレージのコンテキストまで引き継がれる。
    await expect(setting).rejects.toThrow(PluginOperationAggregateError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [expect.objectContaining({ reason: expect.any(ReadonlyVariableError) })],
        }),
      }),
    );
  });
});

describe("UniKvs - フォークの入力検証", () => {
  test("new Branch() で作られていないブランチを fork すると TypeError を投げる", ({ expect }) => {
    // 準備：
    const builder = new Builder();

    // 実行と検証 : ブランドの無いオブジェクトは拒否される。
    expect(() => builder.fork({} as never)).toThrow(TypeError);
  });
});

describe("UniKvs - repair の next 後の拒否", () => {
  test("encode が next 後に投げた RepairNotAllowedError は throwOnRepairDenied 指定時のみ失敗させる", async ({
    expect,
  }) => {
    // 準備 : next 後に拒否を投げるミドルウェア。
    using warnSpy = vi.spyOn(repairLogger, "warn");

    class DenyAfterNextMiddleware extends FakeMiddleware {
      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        throw new RepairNotAllowedError({ names: [this.name] });
      }
    }

    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    await using kvs = new Builder<{ foo: PlainValue<string> }>()
      .use(new AllowRepair())
      .use(new DenyAfterNextMiddleware("DenyAfterNext"))
      .persist(cache)
      .persist(server)
      .build();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行 : 既定では拒否を警告に留め、読み取りは成功する。
    const value = await kvs.get("foo", { repair: true });

    // 検証：
    expect(value).toBe("value");

    expect(warnSpy).toHaveBeenCalledTimes(1);

    // 実行 : 厳格指定では拒否で読み取りが失敗する。
    cache.map.delete("foo");
    warnSpy.mockClear();
    await expect(
      kvs.get("foo", {
        repair: true,
        throwOnRepairDenied: true,
      }),
    ).rejects.toThrow(RepairNotAllowedError);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
