import { AllowRepair } from "@unikvs/allow-repair";
import { RepairNotAllowedError } from "@unikvs/core";
import { describe, test, vi } from "vitest";

import { logger, repairLogger } from "../src/_logger.js";
import { PluginOperationAggregateError } from "../src/errors.js";
import UniKvs from "../src/unikvs.js";
import type { PlainValue, StreamValue } from "../src/value-schemas.js";
import {
  FakeStorage,
  FakeStreamStorage,
  FakeStreamMiddleware,
  FakeMiddleware,
  Gate,
  collect,
  streamOf,
  withTimeout,
} from "./_helpers.js";

/**
 * encode のたびに自身のタグを末尾へ付与し、decode で除去するミドルウェアです。
 * 書き戻し先ごとに異なる段階のデータが保存されることを検証するために使用します。
 */
class TagMiddleware extends FakeMiddleware {
  readonly #tag: string;

  public constructor(tag: string) {
    super(`Tag(${tag})`);
    this.#tag = tag;
  }

  public override async encode(...args: Parameters<FakeMiddleware["encode"]>): Promise<void> {
    const [c, next] = args;
    await this.record("encode", { data: c.source, c });
    c.destination = `${String(c.source)}${this.#tag}`;
    await next!();
  }

  public override async decode(...args: Parameters<FakeMiddleware["decode"]>): Promise<void> {
    const [c, next] = args;
    await this.record("decode", { data: c.source, c });
    const data = String(c.source);
    c.destination = data.endsWith(this.#tag) ? data.slice(0, -this.#tag.length) : data;
    await next!();
  }
}

/**
 * チャンクの末尾にタグを付与し、デコードで検証して除去するストリーム対応ミドルウェアです。
 */
class TagStreamMiddleware extends FakeStreamMiddleware<Uint8Array> {
  readonly #tag: number;

  public constructor(tag: number) {
    super(`Tag(${tag})`);
    this.#tag = tag;
  }

  public override async encodeStream(
    c: import("@unikvs/core").IMiddleware.EncodeStreamContext,
    next: import("@unikvs/core").IMiddleware.INext,
  ): Promise<void> {
    const tag = this.#tag;
    // pre-next 変換: 子 (下流) が変換後ストリームを見るようにする
    await this.record("encodeStream", { data: undefined, c });
    const source = c.source as ReadableStream<Uint8Array>;
    c.destination = source.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const output = new Uint8Array(chunk.byteLength + 1);
          output.set(chunk);
          output[chunk.byteLength] = tag;
          controller.enqueue(output);
        },
      }),
    );
    await next();
  }

  public override async decodeStream(
    c: import("@unikvs/core").IMiddleware.DecodeStreamContext,
    next: import("@unikvs/core").IMiddleware.INext,
  ): Promise<void> {
    await this.record("decodeStream", { data: undefined, c });
    const tag = this.#tag;
    const source = c.source as ReadableStream<Uint8Array>;

    c.destination = source.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (chunk[chunk.byteLength - 1] !== tag) {
            throw new Error(`Expected tag ${tag}`);
          }

          controller.enqueue(chunk.subarray(0, chunk.byteLength - 1));
        },
      }),
    );
    await next();
  }
}

describe("UniKvs - get の書き戻し", () => {
  test("後段ヒット時にデコード途中のデータが段階ごとに前段へ書き戻される", async ({ expect }) => {
    // 準備: キャッシュ (段階 0) → シリアライズ → ローカル (段階 1) → 圧縮 → サーバー (段階 2)
    const cache1 = new FakeStorage("cache1");
    const cache2 = new FakeStorage("cache2");
    const local = new FakeStorage("local");
    const server = new FakeStorage("server");
    const serialize = new TagMiddleware("S");
    const compress = new TagMiddleware("C");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .persist(cache1)
      .persist(cache2)
      .connect(serialize)
      .persist(local)
      .connect(compress)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "valueSC");

    // 実行
    const value = await kvs.get("foo", { repair: true });

    // 検証: デコード結果が返り、各段階の形式で前段へ書き戻される
    expect(value).toBe("value");
    expect(cache1.map.get("foo")).toBe("value");
    expect(cache2.map.get("foo")).toBe("value");
    expect(local.map.get("foo")).toBe("valueS");
    expect(server.map.get("foo")).toBe("valueSC");

    // 検証: 書き戻しの書き込みが行われる (新方式では repair 要求は get/stream のコンテキストで伝達される)
    expect(cache1.callsOf("write")).toHaveLength(1);
    expect(cache2.callsOf("write")).toHaveLength(1);
    expect(local.callsOf("write")).toHaveLength(1);

    // 後片付け
    await kvs.close();
  });

  test("repair を指定しない場合は前段へ書き戻さない", async ({ expect }) => {
    // 準備
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const serialize = new TagMiddleware("S");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "valueS");

    // 実行
    const value = await kvs.get("foo");

    // 検証
    expect(value).toBe("value");
    expect(cache.map.has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("前段で見つかった場合は書き戻しを行わない", async ({ expect }) => {
    // 準備
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const serialize = new TagMiddleware("S");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    cache.map.set("foo", "value");

    // 実行
    const value = await kvs.get("foo", { repair: true });

    // 検証: 前段ヒット時は読み取りのみで、後段へのアクセスも書き戻しも発生しない
    expect(value).toBe("value");
    expect(server.callsOf("read")).toHaveLength(0);
    expect(server.callsOf("write")).toHaveLength(0);

    // 後片付け
    await kvs.close();
  });

  test("書き戻しに失敗しても読み取りは成功し、他の前段への書き戻しは続行される", async ({
    expect,
  }) => {
    // 準備
    const cache = new FakeStorage("cache");
    const local = new FakeStorage("local");
    const server = new FakeStorage("server");
    local.errors["write"] = new Error("repair failed");
    const serialize = new TagMiddleware("S");
    const compress = new TagMiddleware("C");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .persist(cache)
      .connect(serialize)
      .persist(local)
      .connect(compress)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "valueSC");

    // 実行
    const value = await kvs.get("foo", { repair: true });

    // 検証
    expect(value).toBe("value");
    expect(local.map.has("foo")).toBe(false);
    expect(cache.map.get("foo")).toBe("value");

    // 後片付け
    await kvs.close();
  });

  test("存在確認に失敗したストレージへは書き戻さない", async ({ expect }) => {
    // 準備
    const broken = new FakeStorage("broken");
    broken.errors["exists"] = new Error("exists failed");
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .persist(broken)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    // 実行
    const value = await kvs.get("foo", { repair: true });

    // 検証: 存在が確認できなかったストレージは書き戻し対象から除外される
    expect(value).toBe("value");
    expect(cache.map.get("foo")).toBe("value");
    expect(broken.map.has("foo")).toBe(false);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - stream の書き戻し", () => {
  test("後段ヒット時にデコード途中のチャンクが段階ごとに前段へ書き戻される", async ({ expect }) => {
    // 準備: キャッシュ (段階 0) → シリアライズ → ローカル (段階 1) → 圧縮 → サーバー (段階 2)
    const cache = new FakeStreamStorage("cache");
    const local = new FakeStreamStorage("local");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamMiddleware(0x10);
    const compress = new TagStreamMiddleware(0x20);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .persist(cache)
      .connect(serialize)
      .persist(local)
      .connect(compress)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 2, 0x10, 0x20]), new Uint8Array([3, 0x10, 0x20])]);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    const chunks = await collect(vs);

    // 検証: 読み切った時点で書き戻しも完了している
    expect(chunks).toStrictEqual([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect(cache.map.get("logs")).toStrictEqual([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect(local.map.get("logs")).toStrictEqual([
      new Uint8Array([1, 2, 0x10]),
      new Uint8Array([3, 0x10]),
    ]);
    expect(server.map.get("logs")).toStrictEqual([
      new Uint8Array([1, 2, 0x10, 0x20]),
      new Uint8Array([3, 0x10, 0x20]),
    ]);

    // 検証: 書き戻しの書き込みが行われる (新方式では repair 要求はコンテキストで伝達される)
    expect(cache.callsOf("getWritable")).toHaveLength(1);
    expect(local.callsOf("getWritable")).toHaveLength(1);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });

  test("repair を指定しない場合は前段へ書き戻さない", async ({ expect }) => {
    // 準備
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamMiddleware(0x10);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 0x10])]);

    // 実行
    const vs = await kvs.stream("logs");
    const chunks = await collect(vs);

    // 検証
    expect(chunks).toStrictEqual([new Uint8Array([1])]);
    expect(cache.map.has("logs")).toBe(false);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });

  test("途中で破棄すると書き戻しが中断され、ロックも解放される", async ({ expect }) => {
    // 準備
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamMiddleware(0x10);
    const writeGate = new Gate();
    cache.writeGate = writeGate;
    // ブラウザと Node で pipeTo の中断時の close 扱いが異なるため、ゲート解放後に中断を検出して書き込みを失敗させる。
    cache.failWriteOnAbort = true;
    const writeStarted = Promise.withResolvers<void>();
    cache.onWriteStart = () => writeStarted.resolve();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 0x10])]);

    // 実行: 書き戻しの書き込みが保留中のまま破棄する
    const vs = await kvs.stream("logs", { repair: true });
    const reader = vs.getReader();
    await reader.read();
    await withTimeout(writeStarted.promise, 1500, "repair-write-start");
    const pending = vs.dispose();
    cache.writeGate.open();
    await pending;

    // 検証: 書き戻しは完了せず、書き込みロックが解放されている
    expect(cache.map.has("logs")).toBe(false);
    await expect(
      withTimeout(kvs.set("logs", streamOf([new Uint8Array([2])])), 1500, "set-after-dispose"),
    ).resolves.toBeUndefined();

    // 後片付け
    await kvs.close();
  });

  test("読み切った場合は書き込みバックプレッシャーが解消するまでロックを保持する", async ({
    expect,
  }) => {
    // 準備
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamMiddleware(0x10);
    cache.writeGate = new Gate();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 0x10])]);

    // 実行: 書き戻しがゲートで保留されたまま読み切る
    const vs = await kvs.stream("logs", { repair: true });
    const pending = collect(vs);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 検証: 書き戻しが完了するまで collect は完了しない
    const settled = await Promise.race([
      pending.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 50)),
    ]);
    expect(settled).toBe(false);

    // 後片付け
    cache.writeGate.open();
    await expect(pending).resolves.toStrictEqual([new Uint8Array([1])]);
    expect(cache.map.get("logs")).toStrictEqual([new Uint8Array([1])]);
    await vs.dispose();
    await kvs.close();
  });
});

describe("UniKvs - get の書き戻し不許可", () => {
  test("ゲートなしでは warn を残して読み取り成功し書き戻さない", async ({ expect }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    using errorSpy = vi.spyOn(logger, "error");
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行
      const value = await kvs.get("foo", { repair: true });

      // 検証
      expect(value).toBe("value");
      expect(cache.map.has("foo")).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("ゲートなしで throwOnRepairDenied を指定すると警告のうえ読み取り失敗する", async ({
    expect,
  }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    using errorSpy = vi.spyOn(logger, "error");
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行と検証
      const error = await kvs.get("foo", { repair: true, throwOnRepairDenied: true }).then(
        () => null,
        (ex) => ex as RepairNotAllowedError,
      );
      expect(error).toBeInstanceOf(RepairNotAllowedError);
      expect(error?.meta).toStrictEqual({ names: ["cache"] });
      expect(error?.cause).toBeUndefined();
      expect(cache.map.has("foo")).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("ゲートありでは警告なく書き戻される", async ({ expect }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    using errorSpy = vi.spyOn(logger, "error");
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行
      const value = await kvs.get("foo", { repair: true });

      // 検証
      expect(value).toBe("value");
      expect(cache.map.get("foo")).toBe("value");
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("disable 中は読み取りで失敗する (新方式では fail-fast)", async ({ expect }) => {
    // 準備: 新方式の AllowRepair は get/stream の repair 要求で判定し、無効時は即時に投げる
    const gate = new AllowRepair();
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");
    gate.disable();

    try {
      // 実行と検証: fail-fast で集約経由で投げる
      const error = await kvs.get("foo", { repair: true }).catch((ex) => ex);
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect((error as PluginOperationAggregateError).meta.errors[0]?.reason).toBeInstanceOf(
        RepairNotAllowedError,
      );
      expect(cache.map.has("foo")).toBe(false);
    } finally {
      await kvs.close();
    }
  });

  test("disable 中に throwOnRepairDenied を指定すると正規化して読み取り失敗する", async ({
    expect,
  }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    using errorSpy = vi.spyOn(logger, "error");
    const gate = new AllowRepair();
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");
    gate.disable();

    try {
      // 実行と検証
      const error = await kvs.get("foo", { repair: true, throwOnRepairDenied: true }).then(
        () => null,
        (ex) => ex as PluginOperationAggregateError,
      );
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect((error as PluginOperationAggregateError).meta.action).toBe("read");
      expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
      const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
      expect(reason).toBeInstanceOf(RepairNotAllowedError);
      expect((reason as RepairNotAllowedError).meta).toStrictEqual({
        names: ["cache", "server"],
      });
      expect(cache.map.has("foo")).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("enable と toggle で書き戻しが再許可される", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");
    gate.disable();
    gate.enable();

    try {
      // 実行
      const value = await kvs.get("foo", { repair: true });

      // 検証
      expect(value).toBe("value");
      expect(cache.map.get("foo")).toBe("value");
    } finally {
      await kvs.close();
    }

    // 準備: toggle で再び拒否と許可を切り替える
    const cache2 = new FakeStorage("cache2");
    const server2 = new FakeStorage("server2");
    const gate2 = new AllowRepair();
    const kvs2 = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate2)
      .persist(cache2)
      .persist(server2)
      .create();
    await kvs2.open();
    server2.map.set("foo", "value");
    gate2.toggle();

    try {
      // 実行: 拒否中は新方式では fail-fast で投げる
      const error = await kvs2.get("foo", { repair: true }).catch((ex) => ex);
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect(cache2.map.has("foo")).toBe(false);

      // 実行: 再度 toggle で許可される
      gate2.toggle();
      const value2 = await kvs2.get("foo", { repair: true });
      expect(value2).toBe("value");
      expect(cache2.map.get("foo")).toBe("value");
    } finally {
      await kvs2.close();
    }
  });

  test("書き戻しの encode には repair の目印が渡される", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const probe = new FakeMiddleware("probe");
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .connect(probe)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行: 新方式では repair 要求は get/stream のコンテキストで伝達され、vars の目印は付与されない
      await kvs.get("foo", { repair: true });

      // 検証: 書き戻しが行われる
      expect(cache.map.get("foo")).toBe("value");
    } finally {
      await kvs.close();
    }
  });

  test("宛先単位で許可が判定されゲートなし宛先のみ skip される", async ({ expect }) => {
    // 準備: 先にゲートなし宛先を登録し、後からゲート付き宛先を登録する
    const cacheB = new FakeStorage("cacheB");
    const cacheA = new FakeStorage("cacheA");
    const server = new FakeStorage("server");
    const gateA = new AllowRepair();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(cacheB)
      .connect(gateA)
      .persist(cacheA)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行
      using warnSpy = vi.spyOn(repairLogger, "warn");
      const value = await kvs.get("foo", { repair: true });

      // 検証: ゲートあり宛先のみ書き戻される
      expect(value).toBe("value");
      expect(cacheA.map.get("foo")).toBe("value");
      expect(cacheB.map.has("foo")).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      await kvs.close();
    }
  });

  test("共有インスタンスの disable は含む全宛先に効く", async ({ expect }) => {
    // 準備
    const shared = new AllowRepair();
    const cacheA = new FakeStorage("cacheA");
    const cacheB = new FakeStorage("cacheB");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(shared)
      .persist(cacheA)
      .persist(cacheB)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");
    shared.disable();

    try {
      // 実行: 現行仕様では use の throw を無条件ラップするため集約エラーで失敗する
      const error = await kvs.get("foo", { repair: true }).then(
        () => null,
        (ex) => ex as PluginOperationAggregateError,
      );

      // 検証
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect((error as PluginOperationAggregateError).meta.action).toBe("read");
      expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
      const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
      expect(reason).toBeInstanceOf(RepairNotAllowedError);
      expect((reason as RepairNotAllowedError).meta).toStrictEqual({
        names: ["cacheA", "cacheB", "server"],
      });
      expect(cacheA.map.has("foo")).toBe(false);
      expect(cacheB.map.has("foo")).toBe(false);
    } finally {
      await kvs.close();
    }
  });

  test("repair なしでは throwOnRepairDenied は不活性である", async ({ expect }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行
      const value = await kvs.get("foo", { throwOnRepairDenied: true });

      // 検証
      expect(value).toBe("value");
      expect(cache.map.has("foo")).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("非拒否の書き戻し失敗は error で記録され読み取り成功する", async ({ expect }) => {
    // 準備
    using _warnSpy = vi.spyOn(repairLogger, "warn");
    using errorSpy = vi.spyOn(logger, "error");
    const cache = new FakeStorage("cache");
    const local = new FakeStorage("local");
    const server = new FakeStorage("server");
    local.errors["write"] = new Error("storage failed");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(new AllowRepair())
      .persist(cache)
      .persist(local)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行
      const value = await kvs.get("foo", { repair: true });

      // 検証
      expect(value).toBe("value");
      expect(cache.map.get("foo")).toBe("value");
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("中断時は warn なく中断理由で失敗する (不在)", async ({ expect }) => {
    // 準備: 読み取り中に中断し書き戻し時には中断済みにする
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const ac = new AbortController();
    const abortReason = new Error("aborted");
    server.hook = async (call) => {
      if (call.method === "read") {
        ac.abort(abortReason);
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行と検証
      await expect(
        kvs.get("foo", {
          repair: true,
          throwOnRepairDenied: true,
          signal: ac.signal,
        }),
      ).rejects.toBe(abortReason);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("中断時は warn なく中断理由で失敗する (disable 中)", async ({ expect }) => {
    // 準備: 読み取り中に中断し書き戻し時には中断済みにする
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const gate = new AllowRepair();
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const ac = new AbortController();
    const abortReason = new Error("aborted");
    server.hook = async (call) => {
      if (call.method === "read") {
        ac.abort(abortReason);
      }
    };
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");
    gate.disable();

    try {
      // 実行と検証: 現行仕様では use の throw を無条件ラップするため集約エラーで失敗する
      const error = await kvs.get("foo", { repair: true, signal: ac.signal }).then(
        () => null,
        (ex) => ex as PluginOperationAggregateError,
      );
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect((error as PluginOperationAggregateError).meta.action).toBe("read");
      expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
      const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
      expect(reason).toBeInstanceOf(RepairNotAllowedError);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });
});

describe("UniKvs - stream の書き戻し不許可", () => {
  test("ゲートなしでは warn を残して読み取り成功し書き戻さない", async ({ expect }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamMiddleware(0x10);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 0x10])]);

    try {
      // 実行
      const vs = await kvs.stream("logs", { repair: true });
      const chunks = await collect(vs);

      // 検証
      expect(chunks).toStrictEqual([new Uint8Array([1])]);
      expect(cache.map.has("logs")).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("ゲートなしで throwOnRepairDenied を指定すると警告のうえ全体失敗する", async ({
    expect,
  }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamMiddleware(0x10);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 0x10])]);

    try {
      // 実行と検証
      await expect(kvs.stream("logs", { repair: true, throwOnRepairDenied: true })).rejects.toThrow(
        RepairNotAllowedError,
      );
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("書き戻しの encodeStream には repair の目印が渡される", async ({ expect }) => {
    // 準備
    const gate = new AllowRepair();
    const probe = new FakeStreamMiddleware<Uint8Array>("probe");
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(gate)
      .connect(probe)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    try {
      // 実行
      const vs = await kvs.stream("logs", { repair: true });
      await collect(vs);

      // 検証
      // 新方式では repair 要求はコンテキストで伝達され、vars の目印は付与されない
      expect(probe.callsOf("encodeStream")).toHaveLength(1);
      await vs.dispose();
    } finally {
      await kvs.close();
    }
  });

  test("fill 中の拒否は throwOnRepairDenied でも握りつぶされる", async ({ expect }) => {
    // 準備: 書き戻し時に拒否を投げるストレージを用意する
    class DenyOnRepairStorage extends FakeStreamStorage {
      public override getWritable(
        ..._args: Parameters<FakeStreamStorage["getWritable"]>
      ): WritableStream<Uint8Array> {
        throw new RepairNotAllowedError({ names: [this.name] });
      }
    }
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const cache = new DenyOnRepairStorage("cache");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamMiddleware(0x10);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 0x10])]);

    try {
      // 実行: 厳格指定でも fill の拒否は成功扱いになる
      const vs = await kvs.stream("logs", { repair: true, throwOnRepairDenied: true });
      const chunks = await collect(vs);

      // 検証
      expect(chunks).toStrictEqual([new Uint8Array([1])]);
      expect(warnSpy).toHaveBeenCalled();
      await vs.dispose();
    } finally {
      await kvs.close();
    }
  });

  test("setup 中の非拒否失敗は全体失敗のままである", async ({ expect }) => {
    // 準備
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const broken = new FakeStreamMiddleware<Uint8Array>("broken");
    broken.errors["encodeStream"] = new Error("setup failed");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .connect(broken)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);

    try {
      // 実行と検証
      await expect(kvs.stream("logs", { repair: true })).rejects.toThrow("setup failed");
    } finally {
      await kvs.close();
    }
  });

  test("中断時は warn なく中断理由で失敗する (setup)", async ({ expect }) => {
    // 準備: 読み取り中に中断し書き戻し時には中断済みにする
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamMiddleware(0x10);
    const ac = new AbortController();
    const abortReason = new Error("aborted");
    server.hook = async (call) => {
      if (call.method === "exists") {
        ac.abort(abortReason);
      }
    };
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 0x10])]);

    try {
      // 実行と検証
      await expect(
        kvs.stream("logs", {
          repair: true,
          throwOnRepairDenied: true,
          signal: ac.signal,
        }),
      ).rejects.toBe(abortReason);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("disable 中は warn を残して読み取り成功し書き戻さない (stream)", async ({ expect }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const gate = new AllowRepair();
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(gate)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);
    gate.disable();

    try {
      // 実行: 現行仕様では use の throw を無条件ラップするため集約エラーで失敗する
      const error = await kvs.stream("logs", { repair: true }).then(
        () => null,
        (ex) => ex as PluginOperationAggregateError,
      );

      // 検証
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect((error as PluginOperationAggregateError).meta.action).toBe("read");
      expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
      const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
      expect(reason).toBeInstanceOf(RepairNotAllowedError);
      expect((reason as RepairNotAllowedError).meta).toStrictEqual({
        names: ["cache", "server"],
      });
      expect(cache.map.has("logs")).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("disable 中に throwOnRepairDenied を指定すると警告のうえ全体失敗する (stream)", async ({
    expect,
  }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    const gate = new AllowRepair();
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(gate)
      .persist(cache)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1])]);
    gate.disable();

    try {
      // 実行と検証
      const error = await kvs.stream("logs", { repair: true, throwOnRepairDenied: true }).then(
        () => null,
        (ex) => ex as PluginOperationAggregateError,
      );
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect((error as PluginOperationAggregateError).meta.action).toBe("read");
      expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
      const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
      expect(reason).toBeInstanceOf(RepairNotAllowedError);
      expect((reason as RepairNotAllowedError).meta).toStrictEqual({
        names: ["cache", "server"],
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("AllowRepair と他ミドルウェアの組合せでも書き戻される", async ({ expect }) => {
    // 準備
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const serialize = new TagMiddleware("S");
    const gate = new AllowRepair();
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .persist(cache)
      .connect(serialize)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "valueS");

    try {
      // 実行
      const value = await kvs.get("foo", { repair: true });

      // 検証
      expect(value).toBe("value");
      expect(cache.map.get("foo")).toBe("value");
    } finally {
      await kvs.close();
    }
  });
});

describe("UniKvs - 共有 prefix の修復", () => {
  test("複数 missing の prefix 拒否は fail-fast で読み取り失敗する", async ({ expect }) => {
    // 準備: 新方式では共有 prefix の拒否は走査前に即時確定する
    const gate = new AllowRepair();
    const cacheA = new FakeStorage("cacheA");
    const cacheB = new FakeStorage("cacheB");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .persist(cacheA)
      .persist(cacheB)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");
    gate.disable();

    try {
      // 実行と検証: fail-fast で投げる
      const error = await kvs.get("foo", { repair: true }).catch((ex) => ex);
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect(cacheA.map.has("foo")).toBe(false);
      expect(cacheB.map.has("foo")).toBe(false);
    } finally {
      await kvs.close();
    }
  });

  test("複数 missing の prefix 拒否は複数名で読み取り失敗する", async ({ expect }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    using errorSpy = vi.spyOn(logger, "error");
    const gate = new AllowRepair();
    const cacheA = new FakeStorage("cacheA");
    const cacheB = new FakeStorage("cacheB");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(gate)
      .persist(cacheA)
      .persist(cacheB)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");
    gate.disable();

    try {
      // 実行と検証
      const error = await kvs.get("foo", { repair: true, throwOnRepairDenied: true }).then(
        () => null,
        (ex) => ex as PluginOperationAggregateError,
      );
      expect(error).toBeInstanceOf(PluginOperationAggregateError);
      expect((error as PluginOperationAggregateError).meta.action).toBe("read");
      expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
      const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
      expect(reason).toBeInstanceOf(RepairNotAllowedError);
      expect((reason as RepairNotAllowedError).meta).toStrictEqual({
        names: ["cacheA", "cacheB", "server"],
      });
      expect((reason as RepairNotAllowedError).message).toBe(
        'Repair writes via "cacheA, cacheB, server" are not allowed',
      );
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      await kvs.close();
    }
  });

  test("prefix の非ゲート失敗は読取成功し全書戻しを skip する", async ({ expect }) => {
    // 準備
    using warnSpy = vi.spyOn(repairLogger, "warn");
    using errorSpy = vi.spyOn(logger, "error");
    const broken = new FakeMiddleware("broken");
    broken.errors["encode"] = new Error("prefix failed");
    const cacheA = new FakeStorage("cacheA");
    const cacheB = new FakeStorage("cacheB");
    const server = new FakeStorage("server");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .connect(broken)
      .persist(cacheA)
      .persist(cacheB)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("foo", "value");

    try {
      // 実行
      const value = await kvs.get("foo", { repair: true });

      // 検証
      expect(value).toBe("value");
      expect(cacheA.map.has("foo")).toBe(false);
      expect(cacheB.map.has("foo")).toBe(false);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();

      // 実行: 厳格指定でも投げない
      errorSpy.mockClear();
      const value2 = await kvs.get("foo", { repair: true, throwOnRepairDenied: true });

      // 検証
      expect(value2).toBe("value");
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      await kvs.close();
    }
  });

  test("複数 missing の stream 修復は prefix を共有し読取結果を変えない", async ({ expect }) => {
    // 準備
    const cacheA = new FakeStreamStorage("cacheA");
    const cacheB = new FakeStreamStorage("cacheB");
    const server = new FakeStreamStorage("server");
    const prefix = new TagStreamMiddleware(0x10);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .connect(new AllowRepair())
      .connect(prefix)
      .persist(cacheA)
      .persist(cacheB)
      .persist(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 2, 0x10]), new Uint8Array([3, 0x10])]);

    // 実行
    const vs = await kvs.stream("logs", { repair: true });
    const chunks = await collect(vs);

    // 検証: 共有 prefix は 1 操作内で 1 回だけ実行される
    expect(prefix.callsOf("encodeStream")).toHaveLength(1);
    expect(prefix.callsOf("encodeStream")[0]?.key).toBe("logs");
    expect(cacheA.callsOf("getWritable")).toHaveLength(1);
    expect(cacheB.callsOf("getWritable")).toHaveLength(1);
    expect(chunks).toStrictEqual([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect(cacheA.map.get("logs")).toStrictEqual([
      new Uint8Array([1, 2, 0x10]),
      new Uint8Array([3, 0x10]),
    ]);
    expect(cacheB.map.get("logs")).toStrictEqual([
      new Uint8Array([1, 2, 0x10]),
      new Uint8Array([3, 0x10]),
    ]);

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });
});
