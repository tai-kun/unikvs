import type { IMiddleware } from "@unikvs/core";
import {
  createClearContext,
  createDecodeContext,
  createDecodeStreamContext,
  createDeleteContext,
  createEncodeContext,
  createEncodeStreamContext,
  createGetContext,
  createHasContext,
  createNext,
  createSetContext,
  createStreamContext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { KeyNotFoundError, TtlInvalidValueError } from "../src/errors.js";
import Ttl, { type TtlInput } from "../src/ttl.js";

/**
 * テスト用の固定時刻 (epoch ミリ秒) です。
 */
const NOW = 1_000_000;

/**
 * 固定時刻で動作する Ttl を作成します。
 */
function createTtl(now: () => number = () => NOW, defaultTtl?: TtlInput): Ttl {
  return defaultTtl === undefined ? new Ttl({ now }) : new Ttl({ now, defaultTtl });
}

/**
 * エンコードして変換後の値を返します。
 */
async function encode(
  ttl: Ttl,
  source: unknown,
  key = "",
  values?: [string, unknown][],
): Promise<unknown> {
  const c = createEncodeContext(source, key, values === undefined ? {} : { values });
  await ttl.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * デコードして変換後の値を返します。
 */
async function decode(ttl: Ttl, source: unknown, key = ""): Promise<unknown> {
  const c = createDecodeContext(source, key);
  await ttl.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

describe("初期化と基本属性", () => {
  test("name は Ttl である", ({ expect }) => {
    expect(new Ttl().name).toBe("Ttl");
  });

  test("isOpen は常に true である", ({ expect }) => {
    expect(new Ttl().isOpen).toBe(true);
  });

  test("defaultTtl の既定値は undefined である", ({ expect }) => {
    expect(new Ttl().defaultTtl).toBeUndefined();
    expect(new Ttl({}).defaultTtl).toBeUndefined();
    expect(new Ttl(undefined).defaultTtl).toBeUndefined();
  });

  test("defaultTtl を保持する", ({ expect }) => {
    expect(new Ttl({ defaultTtl: 60 }).defaultTtl).toBe(60);
  });

  test("TTL_VAR_NAME と EXPIRES_AT_VAR_NAME が定義されている", ({ expect }) => {
    expect(Ttl.TTL_VAR_NAME).toBe("@unikvs/ttl:ttl");
    expect(Ttl.EXPIRES_AT_VAR_NAME).toBe("@unikvs/ttl:expiresAt");
  });

  test("不正な defaultTtl では構築に失敗する", ({ expect }) => {
    for (const actual of [Number.NaN, Number.POSITIVE_INFINITY, "60", true, {}, { ttl: "60" }]) {
      expect(() => new Ttl({ defaultTtl: actual as TtlInput })).toThrowError(TtlInvalidValueError);
    }
  });

  test("不正な now では構築に失敗する", ({ expect }) => {
    expect(() => new Ttl({ now: "now" as unknown as () => number })).toThrowError(
      TtlInvalidValueError,
    );
  });
});

describe("encode の透過と付与", () => {
  test("TTL 指定なしでは入力を同じ参照で返す", async ({ expect }) => {
    const ttl = createTtl();
    const data = { foo: "bar" };
    const c = createEncodeContext(data, "k");
    await ttl.encode(c as IMiddleware.EncodeContext, createNext());

    expect(c.destination).toBe(data);
  });

  test("defaultTtl では有効期限を同梱する", async ({ expect }) => {
    const ttl = createTtl(() => NOW, 60);
    const destination = await encode(ttl, "hello", "k");

    expect(destination).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: NOW + 60_000,
      data: "hello",
    });
  });

  test("defaultTtl の相対秒数は書き込み時点から数える", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    now += 5_000;

    expect(await encode(ttl, "hello", "k")).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: NOW + 65_000,
      data: "hello",
    });
  });

  test("書き込みごとの ttl 変数が defaultTtl に優先する", async ({ expect }) => {
    const ttl = createTtl(() => NOW, 60);
    const destination = await encode(ttl, "hello", "k", [["ttl", 10]]);

    expect(destination).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: NOW + 10_000,
      data: "hello",
    });
  });

  test("名前空間付き ttl 変数が非名前空間名に優先する", async ({ expect }) => {
    const ttl = createTtl();
    const destination = await encode(ttl, "hello", "k", [
      ["ttl", 10],
      ["@unikvs/ttl:ttl", 20],
    ]);

    expect(destination).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: NOW + 20_000,
      data: "hello",
    });
  });

  test("expiresAt 変数で絶対時刻を指定できる", async ({ expect }) => {
    const ttl = createTtl();
    const at = NOW + 5_000;
    expect(await encode(ttl, "v", "a", [["expiresAt", at]])).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: at,
      data: "v",
    });
    expect(await encode(ttl, "v", "b", [["@unikvs/ttl:expiresAt", new Date(at)]])).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: at,
      data: "v",
    });
    // 書き込みごとの絶対時刻は defaultTtl より優先されます。
    const withDefault = createTtl(() => NOW, 60);

    expect(await encode(withDefault, "v", "c", [["expiresAt", at]])).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: at,
      data: "v",
    });
  });

  test("Date とオブジェクト形式を受け付ける", async ({ expect }) => {
    const ttl = createTtl(() => NOW, new Date(NOW + 1_000));
    expect(await encode(ttl, "v", "a")).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: NOW + 1_000,
      data: "v",
    });
    expect(await encode(ttl, "v", "b", [["ttl", { ttl: 30 }]])).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: NOW + 30_000,
      data: "v",
    });
    expect(await encode(ttl, "v", "c", [["ttl", { expiresAt: NOW + 2_000 }]])).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: NOW + 2_000,
      data: "v",
    });
  });

  test("小数秒を受け付ける", async ({ expect }) => {
    const ttl = createTtl(() => NOW, 0.05);
    expect(await encode(ttl, "v", "k")).toStrictEqual({
      "@unikvs/ttl": 1,
      expiresAt: NOW + 50,
      data: "v",
    });
  });

  test("オーバーフローする相対秒数は TtlInvalidValueError を投げる", async ({ expect }) => {
    const ttl = createTtl();
    const cases: [string, unknown][][] = [[["ttl", 1e307]], [["ttl", { ttl: 1e307 }]]];

    for (const values of cases) {
      const c = createEncodeContext("v", "k", { values });
      await expect(ttl.encode(c as IMiddleware.EncodeContext, createNext())).rejects.toThrowError(
        TtlInvalidValueError,
      );
    }
  });

  test("不正な TTL 値では TtlInvalidValueError を投げる", async ({ expect }) => {
    const ttl = createTtl();

    for (const [key, values] of [
      ["a", [["ttl", Number.NaN]]],
      ["b", [["ttl", Number.POSITIVE_INFINITY]]],
      ["c", [["ttl", "60"]]],
      ["d", [["ttl", true]]],
      ["e", [["ttl", {}]]],
      ["f", [["ttl", { ttl: "60" }]]],
      ["g", [["ttl", new Date(Number.NaN)]]],
      ["h", [["expiresAt", Number.NaN]]],
      ["i", [["expiresAt", "later"]]],
    ] as [string, [string, unknown][]][]) {
      const c = createEncodeContext("v", key, { values });
      await expect(ttl.encode(c as IMiddleware.EncodeContext, createNext())).rejects.toThrowError(
        TtlInvalidValueError,
      );
    }
  });

  test("TtlInvalidValueError は実際の値とメタを持つ", async ({ expect }) => {
    const ttl = createTtl();
    const c = createEncodeContext("v", "k", { values: [["ttl", Number.NaN]] });
    const error = await ttl
      .encode(c as IMiddleware.EncodeContext, createNext())
      .catch((ex: unknown) => ex);

    expect(error).toBeInstanceOf(TtlInvalidValueError);
    expect(error).toMatchObject({ name: "TtlInvalidValueError", meta: { actual: Number.NaN } });
    expect((error as Error).message).toContain("Invalid TTL value NaN");

    const stringError = await ttl
      .encode(
        createEncodeContext("v", "k", { values: [["ttl", "60"]] }) as IMiddleware.EncodeContext,
        createNext(),
      )
      .catch((ex: unknown) => ex);

    expect((stringError as Error).message).toContain('Invalid TTL value "60"');

    for (const [actual, fragment] of [
      [null, "Invalid TTL value null"],
      [true, "Invalid TTL value true"],
    ] as [unknown, string][]) {
      const rejected = await ttl
        .encode(
          createEncodeContext("v", "k", { values: [["ttl", actual]] }) as IMiddleware.EncodeContext,
          createNext(),
        )
        .catch((ex: unknown) => ex);

      expect((rejected as Error).message).toContain(fragment);
    }

    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const circularError = await ttl
      .encode(
        createEncodeContext("v", "k", { values: [["ttl", circular]] }) as IMiddleware.EncodeContext,
        createNext(),
      )
      .catch((ex: unknown) => ex);

    expect((circularError as Error).message).toContain("Invalid TTL value [object Object]");
  });

  test("TTL なしの上書きでは記録を消して透過する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now });
    await encode(ttl, "old", "k", [["ttl", 60]]);

    const c = createEncodeContext("new", "k");
    await ttl.encode(c as IMiddleware.EncodeContext, createNext());

    expect(c.destination).toBe("new");

    // 以前の期限を引き継ぐと、この読み取りは KeyNotFoundError になります。
    now = NOW + 120_000;

    expect(await decode(ttl, "new", "k")).toBe("new");
  });
});

describe("decode の透過と失効", () => {
  test("エンベロープなしでは入力を同じ参照で返す", async ({ expect }) => {
    const ttl = createTtl();
    const data = { foo: "bar" };

    expect(await decode(ttl, data, "k")).toBe(data);
  });

  test("有効期限内では data を取り出す", async ({ expect }) => {
    const writer = createTtl(() => NOW, 60);
    const stored = await encode(writer, "hello", "k");
    const reader = createTtl(() => NOW + 59_999);

    expect(await decode(reader, stored, "k")).toBe("hello");
  });

  test("期限切れでは KeyNotFoundError を投げる", async ({ expect }) => {
    const writer = createTtl(() => NOW, 60);
    const stored = await encode(writer, "hello", "key1");
    const reader = createTtl(() => NOW + 60_000);

    const c = createDecodeContext(stored, "key1");
    const error = await reader
      .decode(c as IMiddleware.DecodeContext, createNext())
      .catch((ex) => ex);

    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      meta: { key: "key1" },
    });
  });

  test("失効時刻ちょうどでは期限切れとして扱う", async ({ expect }) => {
    const writer = createTtl(() => NOW, 60);
    const stored = await encode(writer, "v", "k");
    const reader = createTtl(() => NOW + 60_000);

    await expect(decode(reader, stored, "k")).rejects.toThrowError(KeyNotFoundError);
  });

  test("即時失効 (ttl 0) の書き込みは読み取れない", async ({ expect }) => {
    const ttl = createTtl(() => NOW, 0);
    const stored = await encode(ttl, "v", "k");

    await expect(decode(ttl, stored, "k")).rejects.toThrowError(KeyNotFoundError);
  });

  test("過去の絶対時刻では読み取れない", async ({ expect }) => {
    const ttl = createTtl();
    const stored = await encode(ttl, "v", "k", [["expiresAt", NOW - 1]]);

    await expect(decode(createTtl(), stored, "k")).rejects.toThrowError(KeyNotFoundError);
  });

  test("期限切れの decode は記録を破棄する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    const stored = await encode(ttl, "v", "k");
    now = NOW + 61_000;

    await expect(decode(ttl, stored, "k")).rejects.toThrowError(KeyNotFoundError);
    // 記録は消えているため、生データは透過する (ストレージ直書きの復旧経路)。
    expect(await decode(ttl, "raw", "k")).toBe("raw");
  });

  test("エンベロープに似た利用者データは透過する", async ({ expect }) => {
    const ttl = createTtl();
    const lookalikes = [
      // data がない。
      { "@unikvs/ttl": 1, expiresAt: NOW },
      // 版数が異なる。
      { "@unikvs/ttl": 2, expiresAt: NOW, data: "x" },
      // expiresAt が数値でない。
      { "@unikvs/ttl": 1, expiresAt: "later", data: "x" },
      // 余分なプロパティーがある。
      { "@unikvs/ttl": 1, expiresAt: NOW, data: "x", extra: true },
    ];

    for (const lookalike of lookalikes) {
      expect(await decode(ttl, lookalike, "k")).toBe(lookalike);
    }
  });
});

describe("ストリームの付与と失効", () => {
  test("入力ストリームを同じ参照で返し、塊を変更しない", async ({ expect }) => {
    for (const ttl of [createTtl(), createTtl(() => NOW, 60)]) {
      const chunks = ["a", "b", "c"];
      const source = sourceFrom(chunks);
      const c = createEncodeStreamContext(source, "k");
      await ttl.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

      expect(c.destination).toBe(source);
      expect(await readAll(c.destination)).toStrictEqual(chunks);
    }
  });

  test("有効期限内では decodeStream が透過する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    const chunks = ["a", "b", "c"];
    const encoded = createEncodeStreamContext(sourceFrom(chunks), "k");
    await ttl.encodeStream(encoded as IMiddleware.EncodeStreamContext, createNext());

    now = NOW + 1_000;
    const decoded = createDecodeStreamContext(sourceFrom(chunks), "k");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());

    expect(await readAll(decoded.destination)).toStrictEqual(chunks);
  });

  test("空ストリームでも記録だけが付く", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    const encoded = createEncodeStreamContext(sourceFrom([]), "k");
    await ttl.encodeStream(encoded as IMiddleware.EncodeStreamContext, createNext());

    now = NOW + 1_000;
    const decoded = createDecodeStreamContext(sourceFrom([]), "k");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());

    expect(await readAll(decoded.destination)).toStrictEqual([]);
  });

  test("記録上で期限切れなら decodeStream は KeyNotFoundError を投げる", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    const encoded = createEncodeStreamContext(sourceFrom(["a"]), "k");
    await ttl.encodeStream(encoded as IMiddleware.EncodeStreamContext, createNext());
    now = NOW + 61_000;

    const decoded = createDecodeStreamContext(sourceFrom(["a"]), "k");
    await expect(
      ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext()),
    ).rejects.toThrowError(KeyNotFoundError);
  });

  test("TTL なしの encodeStream では記録が消える", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now });
    const withTtl = createEncodeStreamContext(sourceFrom(["a"]), "k", {
      values: [["ttl", 60]],
    });
    await ttl.encodeStream(withTtl as IMiddleware.EncodeStreamContext, createNext());

    const withoutTtl = createEncodeStreamContext(sourceFrom(["a"]), "k");
    await ttl.encodeStream(withoutTtl as IMiddleware.EncodeStreamContext, createNext());

    now = NOW + 120_000;
    const decoded = createDecodeStreamContext(sourceFrom(["a"]), "k");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());

    expect(await readAll(decoded.destination)).toStrictEqual(["a"]);
  });

  test("未知のキーでは透過する", async ({ expect }) => {
    const ttl = createTtl(() => NOW + 61_000);
    const decoded = createDecodeStreamContext(sourceFrom(["x", "y"]), "unknown");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());

    expect(await readAll(decoded.destination)).toStrictEqual(["x", "y"]);
  });

  test("バイナリチャンクでも透過する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
    const encoded = createEncodeStreamContext(sourceFrom(chunks), "k");
    await ttl.encodeStream(encoded as IMiddleware.EncodeStreamContext, createNext());

    now = NOW + 1_000;
    const decoded = createDecodeStreamContext(encoded.destination, "k");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());

    expect(await readAll(decoded.destination)).toStrictEqual(chunks);
  });

  test("ストリームで付けた期限はプレーン読み取りの decode でも検出できる", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    const encoded = createEncodeStreamContext(sourceFrom(["a"]), "k");
    await ttl.encodeStream(encoded as IMiddleware.EncodeStreamContext, createNext());
    now = NOW + 61_000;

    await expect(decode(ttl, "raw", "k")).rejects.toThrowError(KeyNotFoundError);
  });
});

describe("use と mapKey による失効の先取り", () => {
  test("期限内の has/get/stream は元のキーへ写像する", async ({ expect }) => {
    const ttl = new Ttl({ now: () => NOW, defaultTtl: 60 });
    await encode(ttl, "v", "k");

    for (const c of [createHasContext("k"), createGetContext("k"), createStreamContext("k")]) {
      await ttl.use(c as IMiddleware.UseContext, createNext());
      expect(ttl.mapKey(c as IMiddleware.MapKeyContext)).toBe("k");
    }
  });

  test("期限切れの has/get/stream は実在しないキーへ写像する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    await encode(ttl, "v", "k");
    now = NOW + 61_000;

    for (const c of [createHasContext("k"), createGetContext("k"), createStreamContext("k")]) {
      await ttl.use(c as IMiddleware.UseContext, createNext());
      expect(ttl.mapKey(c as IMiddleware.MapKeyContext)).not.toBe("k");
    }
  });

  test("set/delete/clear の use は期限切れでも元のキーへ写像する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: () => now, defaultTtl: 60 });
    await encode(ttl, "v", "k");
    // clear のコンテキストはキーが空なので、そのキーにも期限付きの記録を作っておきます。
    await encode(ttl, "v", "");
    now = NOW + 61_000;

    for (const c of [createSetContext("k"), createDeleteContext("k"), createClearContext()]) {
      await ttl.use(c as IMiddleware.UseContext, createNext());
      expect(ttl.mapKey(c as IMiddleware.MapKeyContext)).toBe(c.key);
    }
  });

  test("記録のないキーは元のキーへ写像する", async ({ expect }) => {
    const ttl = new Ttl({ now: () => NOW + 61_000 });

    for (const c of [createHasContext("missing"), createGetContext("missing")]) {
      await ttl.use(c as IMiddleware.UseContext, createNext());
      expect(ttl.mapKey(c as IMiddleware.MapKeyContext)).toBe("missing");
    }
  });
});

describe("ミドルウェア連鎖", () => {
  test("各フックは次へ処理を渡す", async ({ expect }) => {
    let calls = 0;
    const next = async () => {
      calls += 1;
    };
    // 期限切れの use も下流へ処理を渡します (失効の判定は mapKey に委ねます)。
    let now = NOW;
    const expired = new Ttl({ now: () => now, defaultTtl: 60 });
    await encode(expired, "v", "k");
    now = NOW + 61_000;
    await expired.use(createGetContext("k") as IMiddleware.UseContext, next);

    const ttl = new Ttl({ now: () => NOW, defaultTtl: 60 });
    const encoded = createEncodeContext("v", "k");
    await ttl.encode(encoded as IMiddleware.EncodeContext, next);
    const decoded = createDecodeContext(encoded.destination, "k");
    await ttl.decode(decoded as IMiddleware.DecodeContext, next);
    const encodedStream = createEncodeStreamContext(sourceFrom(["a"]), "k");
    await ttl.encodeStream(encodedStream as IMiddleware.EncodeStreamContext, next);
    const decodedStream = createDecodeStreamContext(encodedStream.destination, "k");
    await ttl.decodeStream(decodedStream as IMiddleware.DecodeStreamContext, next);

    expect(calls).toBe(5);
  });
});
