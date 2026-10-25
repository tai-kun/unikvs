import { AllowRepair } from "@unikvs/allow-repair";
import type { IMiddleware } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import {
  MiddlewareNextNotCalledError,
  MiddlewareNextNotAwaitedError,
  PluginOperationAggregateError,
  MiddlewareNextCalledMultipleTimesError,
} from "../src/errors.js";
import UniKvsConfig from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import type { PlainValue } from "../src/value-schemas.js";
import { Gate, FakeStorage, withTimeout, FakeMiddleware } from "./_helpers.js";

/**
 * 操作ログの期待列を生成します。
 *
 * @param action 操作名です。
 *
 * @returns 期待されるログ列を返します。
 */
const expected = (action: string): string[] => [
  `${action}:A:pre`,
  `${action}:B:pre`,
  `${action}:C:pre`,
  `${action}:C:post`,
  `${action}:B:post`,
  `${action}:A:post`,
];

// -------------------------------------------------------------------------------------------------。
//
// ヘルパー。
//
// -------------------------------------------------------------------------------------------------。

/**
 * `encode` または `decode` の前後で自身のラベルを記録するミドルウェアです。
 * オニオン実行の pre/post 順序の検証に使用します。
 */
class OrderMiddleware extends FakeMiddleware {
  readonly #log: string[];

  readonly #kind: "encode" | "decode";

  /**
   * @param name ラベルです。
   * @param log 記録先です。
   * @param kind 記録する操作です。
   */
  public constructor(name: string, log: string[], kind: "encode" | "decode") {
    super(name);
    this.#log = log;
    this.#kind = kind;
  }

  public override async encode(
    c: IMiddleware.EncodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    if (this.#kind === "encode") {
      this.#log.push(`${this.name}:encode:pre`);
    }

    c.destination = c.source;
    await next();
    if (this.#kind === "encode") {
      this.#log.push(`${this.name}:encode:post`);
    }
  }

  public override async decode(
    c: IMiddleware.DecodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    if (this.#kind === "decode") {
      this.#log.push(`${this.name}:decode:pre`);
    }

    c.destination = c.source;
    await next();
    if (this.#kind === "decode") {
      this.#log.push(`${this.name}:decode:post`);
    }
  }
}

/**
 * `next()` の完了後に失敗する `encode` を持つミドルウェアです。
 * 下流の post 失敗が上流の post に伝播することを検証します。
 */
class PostThrowEncodeMiddleware extends OrderMiddleware {
  readonly #message: string;

  /**
   * @param name ラベルです。
   * @param log 記録先です。
   * @param message 投げるエラーのメッセージです。
   */
  public constructor(name: string, log: string[], message: string) {
    super(name, log, "encode");
    this.#message = message;
  }

  public override async encode(
    c: IMiddleware.EncodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await super.encode(c, next);
    throw new Error(this.#message);
  }
}

/**
 * `next()` の完了後に失敗する `decode` を持つミドルウェアです。
 */
class PostThrowDecodeMiddleware extends OrderMiddleware {
  readonly #message: string;

  /**
   * @param name ラベルです。
   * @param log 記録先です。
   * @param message 投げるエラーのメッセージです。
   */
  public constructor(name: string, log: string[], message: string) {
    super(name, log, "decode");
    this.#message = message;
  }

  public override async decode(
    c: IMiddleware.DecodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    await super.decode(c, next);
    throw new Error(this.#message);
  }
}

/**
 * `next()` を呼ぶ前に失敗する `encode` を持つミドルウェアです。
 */
class PreThrowEncodeMiddleware extends FakeMiddleware {
  readonly #log: string[];

  readonly #message: string;

  /**
   * @param name ラベルです。
   * @param log 記録先です。
   * @param message 投げるエラーのメッセージです。
   */
  public constructor(name: string, log: string[], message: string) {
    super(name);
    this.#log = log;
    this.#message = message;
  }

  public override async encode(
    c: IMiddleware.EncodeContext,
    _next: IMiddleware.INext,
  ): Promise<void> {
    this.#log.push(`${this.name}:encode:pre`);
    c.destination = c.source;
    throw new Error(this.#message);
  }
}

/**
 * 子の post をゲートで保留するミドルウェアです。
 * 親の post が子の非同期な post 完了を待つことの検証に使用します。
 */
class GatedPostEncodeMiddleware extends FakeMiddleware {
  public readonly entered = new Gate();

  public readonly release = new Gate();

  public constructor(name = "GatedPost") {
    super(name);
  }

  public override async encode(
    c: IMiddleware.EncodeContext,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source;
    await next();
    this.entered.open();
    await this.release.wait();
  }
}

/**
 * `use` の中で自身のラベルと操作名を記録するミドルウェアです。
 */
class UseOrderMiddleware extends FakeMiddleware {
  readonly #log: string[];

  /**
   * @param name ラベルです。
   * @param log 記録先です。
   */
  public constructor(name: string, log: string[]) {
    super(name);
    this.#log = log;
  }

  public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    this.#log.push(`${c.action}:${this.name}:pre`);
    await next();
    this.#log.push(`${c.action}:${this.name}:post`);
  }
}

/**
 * `use` が `next()` を呼ばずに戻るミドルウェアです。
 */
class NoNextUseMiddleware extends FakeMiddleware {
  public override async use(): Promise<void> {}
}

/**
 * `use` が `next()` を複数回呼ぶミドルウェアです。
 */
class DoubleNextUseMiddleware extends FakeMiddleware {
  public override async use(_c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    await next();
    await next();
  }
}

/**
 * `use` が `next()` を await せずに戻るミドルウェアです。
 */
class FireAndForgetUseMiddleware extends FakeMiddleware {
  public detached: Promise<void> | undefined;

  public override async use(_c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    this.detached = next();
  }
}

/**
 * `use` の実行中にゲートで保留できるミドルウェアです。
 */
class GatedUseMiddleware extends FakeMiddleware {
  public readonly entered = new Gate();

  public readonly release = new Gate();

  public constructor(name = "GatedUse") {
    super(name);
  }

  public override async use(_c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    this.entered.open();
    await this.release.wait();
    await next();
  }
}

/**
 * `mapKey` の呼び出し回数を数え、接頭辞を付けるミドルウェアです。
 */
class CountingMapKeyMiddleware extends FakeMiddleware {
  public count = 0;

  public constructor(name = "MapKey") {
    super(name);
  }

  public override mapKey(c: IMiddleware.MapKeyContext): string {
    this.count += 1;

    return `p:${c.key}`;
  }
}

// -------------------------------------------------------------------------------------------------。
//
// プレーン encode/decode のオニオン順序。
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - プレーン encode のオニオン順序", () => {
  test("plain set は共有節を 1 回だけ実行し、全分岐の post を登録順に完了する", async ({
    expect,
  }) => {
    // 準備 : A を 3 つの葉 (B 経由, C 経由, 直接) で共有する。
    const log: string[] = [];
    const a = new OrderMiddleware("A", log, "encode");
    const b = new OrderMiddleware("B", log, "encode");
    const c = new OrderMiddleware("C", log, "encode");
    const s1 = new FakeStorage("s1");
    const s2 = new FakeStorage("s2");
    const s3 = new FakeStorage("s3");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(a)
      .fork(UniKvs.branch().use(b).persist(s1))
      .fork(UniKvs.branch().use(c).persist(s2))
      .persist(s3)
      .create();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証 : 共有節 A は 1 回だけ実行され、子の post がすべて終わってから A の post が走る。
    expect(log).toStrictEqual([
      "A:encode:pre",
      "B:encode:pre",
      "B:encode:post",
      "C:encode:pre",
      "C:encode:post",
      "A:encode:post",
    ]);
    expect(log.filter((entry) => entry === "A:encode:pre")).toHaveLength(1);
    expect(log.filter((entry) => entry === "B:encode:pre")).toHaveLength(1);
    expect(log.filter((entry) => entry === "C:encode:pre")).toHaveLength(1);
    expect(s1.map.get("foo")).toBe("value");
    expect(s2.map.get("foo")).toBe("value");
    expect(s3.map.get("foo")).toBe("value");
  });

  test("plain set の親 post は子 post の非同期処理の完了を待つ", async ({ expect }) => {
    // 準備：
    const log: string[] = [];
    const a = new OrderMiddleware("A", log, "encode");
    const b = new GatedPostEncodeMiddleware("B");
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(a)
      .use(b)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行 : B の post を保留したまま set を開始する。
    const pending = kvs.set("foo", "value");

    await b.entered.wait();

    // 検証 : 子の post が終わるまで親の post は実行されない。
    expect(log).toStrictEqual(["A:encode:pre"]);

    // 後片付けと検証 : 解放後は親の post まで完了する。
    b.release.open();
    await expect(pending).resolves.toBeUndefined();
    expect(log).toStrictEqual(["A:encode:pre", "A:encode:post"]);
    expect(storage.map.get("foo")).toBe("value");
  });

  test("plain set で下流の encode が失敗すると上流の post は実行されず、どのストレージにも書かれない", async ({
    expect,
  }) => {
    // 準備：
    const log: string[] = [];
    const a = new OrderMiddleware("A", log, "encode");
    const b = new PreThrowEncodeMiddleware("B", log, "B-pre-boom");
    const s1 = new FakeStorage("s1");
    const s2 = new FakeStorage("s2");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(a)
      .use(b)
      .persist(s1)
      .persist(s2)
      .create();
    await kvs.open();

    // 実行：
    const setting = kvs.set("foo", "value");

    // 検証 : B の pre で失敗し、A の post は実行されない。
    await expect(setting).rejects.toThrow(Error);
    await expect(setting).rejects.toMatchObject({ message: "B-pre-boom" });

    expect(log).toStrictEqual(["A:encode:pre", "B:encode:pre"]);
    expect(s1.callsOf("write")).toHaveLength(0);
    expect(s2.callsOf("write")).toHaveLength(0);
  });

  test("plain set で共有節の兄弟分岐が post で失敗すると、兄弟の post までは実行されるが親の post は実行されない", async ({
    expect,
  }) => {
    // 準備 : A を共有し、B の分岐は成功、C の分岐は post で失敗する。
    const log: string[] = [];
    const a = new OrderMiddleware("A", log, "encode");
    const b = new OrderMiddleware("B", log, "encode");
    const c = new PostThrowEncodeMiddleware("C", log, "C-post-boom");
    const s1 = new FakeStorage("s1");
    const s2 = new FakeStorage("s2");
    await using kvs = new UniKvsConfig(UniKvs)
      .use(a)
      .fork(UniKvs.branch().use(b).persist(s1))
      .fork(UniKvs.branch().use(c).persist(s2))
      .create();
    await kvs.open();

    // 実行：
    const setting = kvs.set("foo", "value");

    // 検証 : 先に完了した兄弟 B の post は残り、C の失敗で A の post は実行されない。
    await expect(setting).rejects.toThrow(Error);
    await expect(setting).rejects.toMatchObject({ message: "C-post-boom" });

    expect(log).toStrictEqual([
      "A:encode:pre",
      "B:encode:pre",
      "B:encode:post",
      "C:encode:pre",
      "C:encode:post",
    ]);
    expect(s1.callsOf("write")).toHaveLength(0);
    expect(s2.callsOf("write")).toHaveLength(0);
  });
});

describe("UniKvs - プレーン decode のオニオン順序", () => {
  test("plain get はヒットした葉の経路だけを葉から根へ実行し、post を根から葉へ戻す", async ({
    expect,
  }) => {
    // 準備 : A を共有し、s2 にだけ値を置く。
    const log: string[] = [];
    const a = new OrderMiddleware("A", log, "decode");
    const b = new OrderMiddleware("B", log, "decode");
    const c = new OrderMiddleware("C", log, "decode");
    const s1 = new FakeStorage("s1");
    const s2 = new FakeStorage("s2");
    await using kvs = new UniKvsConfig(UniKvs)
      .use(a)
      .fork(UniKvs.branch().use(b).persist(s1))
      .fork(UniKvs.branch().use(c).persist(s2))
      .create();
    await kvs.open();
    s2.map.set("foo", "value");

    // 実行：
    const value = await kvs.get("foo");

    // 検証 : ヒットした s2 の経路だけが逆順に実行され、post は根側から戻る。
    expect(value).toBe("value");

    expect(log).toStrictEqual(["C:decode:pre", "A:decode:pre", "A:decode:post", "C:decode:post"]);
    expect(b.callsOf("decode")).toHaveLength(0);
  });

  test("plain get で根側の decode post が失敗すると、葉側の post は実行されず get は失敗する", async ({
    expect,
  }) => {
    // 準備：
    const log: string[] = [];
    const a = new PostThrowDecodeMiddleware("A", log, "A-decode-post-boom");
    const b = new OrderMiddleware("B", log, "decode");
    const storage = new FakeStorage();
    storage.map.set("foo", "value");

    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(a)
      .use(b)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行：
    const getting = kvs.get("foo");

    // 検証 : 根側 A の post で失敗し、葉側 B の post は実行されない。
    await expect(getting).rejects.toThrow(Error);
    await expect(getting).rejects.toMatchObject({ message: "A-decode-post-boom" });

    expect(log).toStrictEqual(["B:decode:pre", "A:decode:pre", "A:decode:post"]);
  });
});

describe("UniKvs - プレーン repair のオニオン順序", () => {
  test("plain repair は共有節を 1 回だけ実行し、書き戻し先の encode post 順序を保つ", async ({
    expect,
  }) => {
    // 準備 : A を c1/c2 で共有し、server にだけ値を置く。
    const log: string[] = [];
    const a = new OrderMiddleware("A", log, "encode");
    const b = new OrderMiddleware("B", log, "encode");
    const c = new OrderMiddleware("C", log, "encode");
    const c1 = new FakeStorage("c1");
    const c2 = new FakeStorage("c2");
    const server = new FakeStorage("server");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new AllowRepair())
      .use(a)
      .fork(UniKvs.branch().use(b).persist(c1))
      .fork(UniKvs.branch().use(c).persist(c2))
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行：
    const value = await kvs.get("foo", { repair: true });

    // 検証：
    expect(value).toBe("value");

    expect(log).toStrictEqual([
      "A:encode:pre",
      "B:encode:pre",
      "B:encode:post",
      "C:encode:pre",
      "C:encode:post",
      "A:encode:post",
    ]);
    expect(log.filter((entry) => entry === "A:encode:pre")).toHaveLength(1);
    expect(c1.map.get("foo")).toBe("value");
    expect(c2.map.get("foo")).toBe("value");
  });
});

// -------------------------------------------------------------------------------------------------。
//
// 共有ストア。
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - プレーン実行の共有ストア", () => {
  test("plain set は上流が await next() の後に下流の変数変更を読める", async ({ expect }) => {
    // 準備：
    class Writer extends FakeMiddleware {
      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.set("marker", "from-writer");
        c.destination = c.source;
        await next();
      }
    }

    class Reader extends FakeMiddleware {
      public seen: unknown;

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        this.seen = c.get("marker");
      }
    }

    const reader = new Reader("Reader");
    const writer = new Writer("Writer");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(reader)
      .use(writer)
      .persist(new FakeStorage())
      .create();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証 : 上流の post から下流 pre の変更が見える。
    expect(reader.seen).toBe("from-writer");
  });

  test("plain get は葉側の post で根側の decode が設定した変数を読める", async ({ expect }) => {
    // 準備 : A は根側、B は葉側のミドルウェア。
    class RootWriter extends FakeMiddleware {
      public override async decode(
        c: IMiddleware.DecodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.set("from-root", "root");
        c.destination = c.source;
        await next();
      }
    }

    class LeafReader extends FakeMiddleware {
      public seen: unknown;

      public override async decode(
        c: IMiddleware.DecodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        this.seen = c.get("from-root");
      }
    }

    const leafReader = new LeafReader("LeafReader");
    const storage = new FakeStorage();
    storage.map.set("foo", "value");

    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new RootWriter("RootWriter"))
      .use(leafReader)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行：
    const value = await kvs.get("foo");

    // 検証 : 葉側の post から根側 pre の変更が見える。
    expect(value).toBe("value");

    expect(leafReader.seen).toBe("root");
  });

  test("共有節の分岐をまたいだ変数は親の post から見えるが、先に完了した兄弟の post からは見えない", async ({
    expect,
  }) => {
    // 準備 : A を共有する B/C の兄弟分岐。
    class BranchMiddleware extends FakeMiddleware {
      readonly #writeName: string;

      readonly #writeValue: string;

      readonly #readName: string;

      public seen: unknown;

      public constructor(name: string, writeName: string, writeValue: string, readName: string) {
        super(name);
        this.#writeName = writeName;
        this.#writeValue = writeValue;
        this.#readName = readName;
      }

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.set(this.#writeName, this.#writeValue);
        c.destination = c.source;
        await next();
        this.seen = c.get(this.#readName);
      }
    }

    class ParentMiddleware extends FakeMiddleware {
      public seen: unknown;

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        this.seen = {
          b: c.get("b"),
          c: c.get("c"),
        };
      }
    }

    const parent = new ParentMiddleware("Parent");
    const b = new BranchMiddleware("B", "b", "from-b", "c");
    const c = new BranchMiddleware("C", "c", "from-c", "b");
    await using kvs = new UniKvsConfig(UniKvs)
      .use(parent)
      .fork(UniKvs.branch().use(b).persist(new FakeStorage("s1")))
      .fork(UniKvs.branch().use(c).persist(new FakeStorage("s2")))
      .create();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証 : 分岐は登録順に逐次実行されるため、先の兄弟は後の兄弟の変更を見られない。
    expect(b.seen).toBeUndefined();
    expect(c.seen).toBe("from-b");
    expect(parent.seen).toStrictEqual({
      b: "from-b",
      c: "from-c",
    });
  });
});

// -------------------------------------------------------------------------------------------------。
//
// use のオニオン実行。
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - use のオニオン実行", () => {
  test("use は set/get/has/delete/clear の前に 1 回だけオニオン順で実行される", async ({
    expect,
  }) => {
    // 準備：
    const log: string[] = [];
    const a = new UseOrderMiddleware("A", log);
    const b = new UseOrderMiddleware("B", log);
    const c = new UseOrderMiddleware("C", log);
    const storage = new FakeStorage();
    storage.map.set("foo", "value");

    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(a)
      .use(b)
      .use(c)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行と検証：
    log.length = 0;
    await kvs.set("foo", "next");
    expect(log).toStrictEqual(expected("set"));
    expect(storage.callsOf("write")).toHaveLength(1);

    log.length = 0;
    await expect(kvs.get("foo")).resolves.toBe("next");
    expect(log).toStrictEqual(expected("get"));
    expect(storage.callsOf("read")).toHaveLength(1);

    log.length = 0;
    await expect(kvs.has("foo")).resolves.toBe(true);
    expect(log).toStrictEqual(expected("has"));

    log.length = 0;
    await kvs.delete("foo");
    expect(log).toStrictEqual(expected("delete"));
    expect(storage.callsOf("delete")).toHaveLength(1);

    log.length = 0;
    await kvs.clear();
    expect(log).toStrictEqual(expected("clear"));
    expect(storage.callsOf("clear")).toHaveLength(1);
  });

  test("use の post は下流の use が共有ストアに書いた変数を読める", async ({ expect }) => {
    // 準備：
    class Writer extends FakeMiddleware {
      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        c.set("marker", "from-writer");
        await next();
      }
    }

    class Reader extends FakeMiddleware {
      public seen: unknown;

      public override async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
        await next();
        this.seen = c.get("marker");
      }
    }

    const reader = new Reader("Reader");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(reader)
      .use(new Writer("Writer"))
      .persist(new FakeStorage())
      .create();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証：
    expect(reader.seen).toBe("from-writer");
  });

  test("use の post で失敗したとき、失敗したミドルウェアが集約エラーに報告される", async ({
    expect,
  }) => {
    // 準備 : B の use が next() の後に失敗する。
    class PostThrowUse extends FakeMiddleware {
      public override async use(
        _c: IMiddleware.UseContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        await next();
        throw new Error("B-use-boom");
      }
    }

    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new FakeMiddleware("A"))
      .use(new PostThrowUse("B"))
      .persist(storage)
      .create();
    await kvs.open();

    // 実行：
    const setting = kvs.set("foo", "value");

    // 検証 : 集約エラーは実際に失敗した B を単一件で報告する。
    await expect(setting).rejects.toThrow(PluginOperationAggregateError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [
            expect.objectContaining({
              name: "B",
              index: 1,
              reason: expect.any(Error),
            }),
          ],
        }),
      }),
    );
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          errors: [
            expect.objectContaining({
              reason: expect.objectContaining({ message: "B-use-boom" }),
            }),
          ],
        }),
      }),
    );

    expect(storage.map.has("foo")).toBe(false);
  });

  test("use が next を呼ばない場合、MiddlewareNextNotCalledError で失敗し、後続の use と操作は実行されない", async ({
    expect,
  }) => {
    // 準備 : A が next() を呼ばずに戻る。
    const downstream = new FakeMiddleware("B");
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new NoNextUseMiddleware("A"))
      .use(downstream)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行 : フェイルクローズのため操作は失敗する。
    const setting = kvs.set("foo", "value");

    // 検証 : 規約違反が報告され、後段の use と書き込みは実行されない。
    await expect(setting).rejects.toThrow(MiddlewareNextNotCalledError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: {
          name: "A",
          operation: "use",
        },
      }),
    );

    expect(downstream.callsOf("use")).toHaveLength(0);
    expect(storage.map.has("foo")).toBe(false);
  });

  test("use が next を複数回呼ぶと MiddlewareNextCalledMultipleTimesError で失敗し、後続の use と操作は実行されない", async ({
    expect,
  }) => {
    // 準備：
    const downstream = new FakeMiddleware("B");
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(new DoubleNextUseMiddleware("A"))
      .use(downstream)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行：
    const setting = kvs.set("foo", "value");

    // 検証 : 2 回目の next() は下流を実行せず、規約違反として報告される。
    await expect(setting).rejects.toThrow(MiddlewareNextCalledMultipleTimesError);
    await expect(setting).rejects.toEqual(
      expect.objectContaining({
        meta: {
          name: "A",
          operation: "use",
        },
      }),
    );

    expect(downstream.callsOf("use")).toHaveLength(1);
    expect(storage.callsOf("write")).toHaveLength(0);
    expect(storage.map.has("foo")).toBe(false);
  });

  test("use が next を await しない場合、MiddlewareNextNotAwaitedError で失敗し、操作は実行されない", async ({
    expect,
  }) => {
    // 準備 : A は next() を切り離し、B はゲートで保留する。
    const fireAndForget = new FireAndForgetUseMiddleware("A");
    const slow = new GatedUseMiddleware("B");
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(fireAndForget)
      .use(slow)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行 : B の use を保留したまま set を開始する。
    const pending = kvs.set("foo", "value");

    await slow.entered.wait();

    // 検証 : 切り離された next() の完了を待たずに規約違反として失敗し、書き込みは行われない。
    const setFails = withTimeout(pending, 1000, "set-before-use-complete");
    await expect(setFails).rejects.toThrow(MiddlewareNextNotAwaitedError);
    await expect(setFails).rejects.toEqual(
      expect.objectContaining({
        meta: {
          name: "A",
          operation: "use",
        },
      }),
    );

    expect(storage.callsOf("write")).toHaveLength(0);

    // 後片付け : 切り離した next() の完了を待つ。
    slow.release.open();
    await fireAndForget.detached;
  });
});

// -------------------------------------------------------------------------------------------------。
//
// mapKey の適用タイミング。
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - mapKey の適用タイミング", () => {
  test("plain set は共有節と分岐の mapKey を操作内で各 1 回だけ呼ぶ", async ({ expect }) => {
    // 準備：
    const a = new CountingMapKeyMiddleware("A");
    const b = new CountingMapKeyMiddleware("B");
    const c = new CountingMapKeyMiddleware("C");
    const s1 = new FakeStorage("s1");
    const s2 = new FakeStorage("s2");
    const s3 = new FakeStorage("s3");
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(a)
      .fork(UniKvs.branch().use(b).persist(s1))
      .fork(UniKvs.branch().use(c).persist(s2))
      .persist(s3)
      .create();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "value");

    // 検証 : 共有節 A も分岐 B/C も 1 回だけ写像する。
    expect([a.count, b.count, c.count]).toStrictEqual([1, 1, 1]);
    expect(s1.map.get("p:p:foo")).toBe("value");
    expect(s2.map.get("p:p:foo")).toBe("value");
    expect(s3.map.get("p:foo")).toBe("value");
  });

  test("plain get と has は最初にヒットした葉までの mapKey だけを各 1 回呼ぶ", async ({
    expect,
  }) => {
    // 準備 : s1 にだけ値を置き、s1 でヒットさせる。
    const a = new CountingMapKeyMiddleware("A");
    const b = new CountingMapKeyMiddleware("B");
    const c = new CountingMapKeyMiddleware("C");
    const s1 = new FakeStorage("s1");
    const s2 = new FakeStorage("s2");
    await using kvs = new UniKvsConfig(UniKvs)
      .use(a)
      .fork(UniKvs.branch().use(b).persist(s1))
      .fork(UniKvs.branch().use(c).persist(s2))
      .create();
    await kvs.open();
    s1.map.set("p:p:foo", "value");

    // 実行：
    await expect(kvs.get("foo")).resolves.toBe("value");

    // 検証 : ヒットしなかった s2 の分岐 C は写像しない。
    expect([a.count, b.count, c.count]).toStrictEqual([1, 1, 0]);

    // 実行：
    a.count = 0;
    b.count = 0;
    c.count = 0;
    await expect(kvs.has("foo")).resolves.toBe(true);

    // 検証 : has も同じ経路だけを写像する。
    expect([a.count, b.count, c.count]).toStrictEqual([1, 1, 0]);
  });
});

// -------------------------------------------------------------------------------------------------。
//
// abort。
//
// -------------------------------------------------------------------------------------------------。

describe("UniKvs - use 実行中の abort", () => {
  test("use の実行中に abort すると set/get/has/delete は abort 理由で失敗し、操作を実行しない", async ({
    expect,
  }) => {
    for (const action of ["set", "get", "has", "delete"] as const) {
      // 準備：
      const use = new GatedUseMiddleware(`Gated-${action}`);
      const storage = new FakeStorage(`s-${action}`);
      storage.map.set("foo", "stored");

      await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
        .use(use)
        .persist(storage)
        .create();
      await kvs.open();

      const ac = new AbortController();
      const reason = new Error(`ABORT-${action}`);

      // 実行 : use を保留したまま abort する。
      let pending: Promise<unknown>;

      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      switch (action) {
        case "set": {
          pending = kvs.set("foo", "next", { signal: ac.signal });
          break;
        }

        case "get": {
          pending = kvs.get("foo", { signal: ac.signal });
          break;
        }

        case "has": {
          pending = kvs.has("foo", { signal: ac.signal });
          break;
        }

        case "delete": {
          pending = kvs.delete("foo", { signal: ac.signal });
          break;
        }
      }

      await use.entered.wait();
      ac.abort(reason);
      use.release.open();

      // 検証 : abort 理由で失敗し、ストレージは変更されない。
      await expect(pending).rejects.toBe(reason);
      expect(storage.map.get("foo")).toBe("stored");
      expect(storage.callsOf("write")).toHaveLength(0);
      expect(storage.callsOf("delete")).toHaveLength(0);
    }
  });

  test("use の実行中に abort すると clear も abort 理由で失敗し、削除しない", async ({
    expect,
  }) => {
    // 準備：
    const use = new GatedUseMiddleware("Gated-clear");
    const storage = new FakeStorage();
    storage.map.set("foo", "stored");

    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(use)
      .persist(storage)
      .create();
    await kvs.open();

    const ac = new AbortController();
    const reason = new Error("ABORT-clear");

    // 実行 : use を保留したまま abort する。
    const pending = kvs.clear({ signal: ac.signal });

    await use.entered.wait();
    ac.abort(reason);
    use.release.open();

    // 検証 : clear も abort 理由で失敗し、ストレージは削除されない。
    await expect(pending).rejects.toBe(reason);
    expect(storage.map.get("foo")).toBe("stored");
    expect(storage.callsOf("clear")).toHaveLength(0);
  });
});

describe("UniKvs - プレーン実行の post 中の abort", () => {
  test("plain set の post で abort すると abort 理由で失敗し、書き込みは行われない", async ({
    expect,
  }) => {
    // 準備：
    class PostAbort extends FakeMiddleware {
      public readonly ac = new AbortController();

      public readonly reason = new Error("SET-POST-ABORT");

      public override async encode(
        c: IMiddleware.EncodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        this.ac.abort(this.reason);
      }
    }

    const middleware = new PostAbort("PostAbort");
    const storage = new FakeStorage();
    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(middleware)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行：
    const setting = kvs.set("foo", "value", { signal: middleware.ac.signal });

    // 検証 : post の abort は理由ごと伝播し、encode が完了しないため書き込まれない。
    await expect(setting).rejects.toBe(middleware.reason);

    expect(storage.callsOf("write")).toHaveLength(0);
  });

  test("plain get の post で abort すると abort 理由で失敗する", async ({ expect }) => {
    // 準備：
    class PostAbort extends FakeMiddleware {
      public readonly ac = new AbortController();

      public readonly reason = new Error("GET-POST-ABORT");

      public override async decode(
        c: IMiddleware.DecodeContext,
        next: IMiddleware.INext,
      ): Promise<void> {
        c.destination = c.source;
        await next();
        this.ac.abort(this.reason);
      }
    }

    const middleware = new PostAbort("PostAbort");
    const storage = new FakeStorage();
    storage.map.set("foo", "value");

    await using kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .use(middleware)
      .persist(storage)
      .create();
    await kvs.open();

    // 実行と検証：
    await expect(kvs.get("foo", { signal: middleware.ac.signal })).rejects.toBe(middleware.reason);
  });
});
