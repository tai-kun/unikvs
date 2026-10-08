import { describe, test } from "vitest";

import type { PlainValue, StreamValue } from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import {
  FakeStorage,
  FakeStreamStorage,
  FakeStreamTransformer,
  FakeTransformer,
  Gate,
  collect,
  streamOf,
  withTimeout,
} from "./_helpers.js";

/**
 * encode のたびに自身のタグを末尾へ付与し、decode で除去するトランスフォーマーです。
 * 書き戻し先ごとに異なる段階のデータが保存されることを検証するために使用します。
 */
class TagTransformer extends FakeTransformer {
  readonly #tag: string;

  public constructor(tag: string) {
    super(`Tag(${tag})`);
    this.#tag = tag;
  }

  public override async encode(args: Parameters<FakeTransformer["encode"]>[0]): Promise<string> {
    return `${String(await super.encode(args))}${this.#tag}`;
  }

  public override async decode(args: Parameters<FakeTransformer["decode"]>[0]): Promise<string> {
    const data = String(await super.decode(args));
    return data.endsWith(this.#tag) ? data.slice(0, -this.#tag.length) : data;
  }
}

/**
 * チャンクの末尾にタグを付与し、デコードで検証して除去するストリーム対応トランスフォーマーです。
 */
class TagStreamTransformer extends FakeStreamTransformer<Uint8Array> {
  readonly #tag: number;

  public constructor(tag: number) {
    super(`Tag(${tag})`);
    this.#tag = tag;
  }

  public override async getEncodable(
    args: Parameters<FakeStreamTransformer["getEncodable"]>[0],
  ): Promise<TransformStream<Uint8Array, Uint8Array>> {
    await super.getEncodable(args);
    const tag = this.#tag;

    return new TransformStream({
      transform(chunk, controller) {
        const output = new Uint8Array(chunk.byteLength + 1);
        output.set(chunk);
        output[chunk.byteLength] = tag;
        controller.enqueue(output);
      },
    });
  }

  public override async getDecodable(
    args: Parameters<FakeStreamTransformer["getDecodable"]>[0],
  ): Promise<TransformStream<Uint8Array, Uint8Array>> {
    await super.getDecodable(args);
    const tag = this.#tag;

    return new TransformStream({
      transform(chunk, controller) {
        if (chunk[chunk.byteLength - 1] !== tag) {
          throw new Error(`Expected tag ${tag}`);
        }

        controller.enqueue(chunk.subarray(0, chunk.byteLength - 1));
      },
    });
  }
}

describe("UniKvs - get の書き戻し", () => {
  test("後段ヒット時にデコード途中のデータが段階ごとに前段へ書き戻される", async ({ expect }) => {
    // 準備: キャッシュ (段階 0) → シリアライズ → ローカル (段階 1) → 圧縮 → サーバー (段階 2)
    const cache1 = new FakeStorage("cache1");
    const cache2 = new FakeStorage("cache2");
    const local = new FakeStorage("local");
    const server = new FakeStorage("server");
    const serialize = new TagTransformer("S");
    const compress = new TagTransformer("C");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(cache1)
      .appendStorage(cache2)
      .appendTransformer(serialize)
      .appendStorage(local)
      .appendTransformer(compress)
      .appendStorage(server)
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

    // 検証: 書き戻しの書き込みにだけ unikvs:repair が付与される
    expect(cache1.callsOf("write")[0]?.vars).toMatchObject({ "unikvs:repair": true });
    expect(cache2.callsOf("write")[0]?.vars).toMatchObject({ "unikvs:repair": true });
    expect(local.callsOf("write")[0]?.vars).toMatchObject({ "unikvs:repair": true });
    expect(server.callsOf("read")[0]?.vars).not.toHaveProperty("unikvs:repair");
    expect(serialize.callsOf("decode")[0]?.vars).not.toHaveProperty("unikvs:repair");
    expect(compress.callsOf("decode")[0]?.vars).not.toHaveProperty("unikvs:repair");

    // 後片付け
    await kvs.close();
  });

  test("repair を指定しない場合は前段へ書き戻さない", async ({ expect }) => {
    // 準備
    const cache = new FakeStorage("cache");
    const server = new FakeStorage("server");
    const serialize = new TagTransformer("S");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(cache)
      .appendTransformer(serialize)
      .appendStorage(server)
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
    const serialize = new TagTransformer("S");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(cache)
      .appendTransformer(serialize)
      .appendStorage(server)
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
    const serialize = new TagTransformer("S");
    const compress = new TagTransformer("C");
    const kvs = UniKvs.config<{ foo: PlainValue<string> }>()
      .appendStorage(cache)
      .appendTransformer(serialize)
      .appendStorage(local)
      .appendTransformer(compress)
      .appendStorage(server)
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
      .appendStorage(broken)
      .appendStorage(cache)
      .appendStorage(server)
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
    const serialize = new TagStreamTransformer(0x10);
    const compress = new TagStreamTransformer(0x20);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(cache)
      .appendTransformer(serialize)
      .appendStorage(local)
      .appendTransformer(compress)
      .appendStorage(server)
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

    // 検証: 書き戻しの書き込みにだけ unikvs:repair が付与される
    expect(cache.callsOf("getWritable")[0]?.vars).toMatchObject({ "unikvs:repair": true });
    expect(local.callsOf("getWritable")[0]?.vars).toMatchObject({ "unikvs:repair": true });
    expect(server.callsOf("getReadable")[0]?.vars).not.toHaveProperty("unikvs:repair");

    // 後片付け
    await vs.dispose();
    await kvs.close();
  });

  test("repair を指定しない場合は前段へ書き戻さない", async ({ expect }) => {
    // 準備
    const cache = new FakeStreamStorage("cache");
    const server = new FakeStreamStorage("server");
    const serialize = new TagStreamTransformer(0x10);
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(cache)
      .appendTransformer(serialize)
      .appendStorage(server)
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
    const serialize = new TagStreamTransformer(0x10);
    const writeGate = new Gate();
    cache.writeGate = writeGate;
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(cache)
      .appendTransformer(serialize)
      .appendStorage(server)
      .create();
    await kvs.open();
    server.map.set("logs", [new Uint8Array([1, 0x10])]);

    // 実行: 書き戻しの書き込みが保留中のまま破棄する
    const vs = await kvs.stream("logs", { repair: true });
    const reader = vs.getReader();
    await reader.read();
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
    const serialize = new TagStreamTransformer(0x10);
    cache.writeGate = new Gate();
    const kvs = UniKvs.config<{ logs: StreamValue<Uint8Array> }>()
      .appendStorage(cache)
      .appendTransformer(serialize)
      .appendStorage(server)
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
