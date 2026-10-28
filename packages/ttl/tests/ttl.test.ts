import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
  createClearContext,
  createDecodeContext,
  createDeleteContext,
  createEncodeContext,
  createStreamContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError, TtlInvalidValueError } from "../src/errors.js";
import Ttl, { type TtlInput } from "../src/ttl.js";

/**
 * テスト用の固定時刻 (epoch ミリ秒) です。
 */
const NOW = 1_000_000;

/**
 * 固定時刻で動作する Ttl を作成します。
 */
function createTtl(now: () => number = (): number => NOW, defaultTtl?: TtlInput): Ttl {
  return defaultTtl === undefined
    ? new Ttl({ now })
    : new Ttl({
        now,
        defaultTtl,
      });
}

/**
 * 宛先 1 件分の結果を作成します。
 */
function target(
  status: IMiddleware.UseTargetOutcome["status"],
  error?: unknown,
): IMiddleware.UseTargetOutcome {
  return error === undefined
    ? {
        name: "storage",
        index: 0,
        status,
      }
    : {
        name: "storage",
        error,
        index: 0,
        status,
      };
}

/**
 * 操作全体の結果を作成します。
 */
function outcome(
  status: IMiddleware.UseOutcome["status"] = "success",
  targets: IMiddleware.UseTargetOutcome[] = [target("committed")],
  error?: unknown,
): IMiddleware.UseOutcome {
  return error === undefined
    ? {
        status,
        targets,
      }
    : {
        error,
        status,
        targets,
      };
}

/**
 * エンコードして成功を確定し、変換後の値を返します。
 */
async function encode(
  ttl: Ttl,
  source: unknown,
  key = "",
  values?: [string, unknown][],
): Promise<unknown> {
  const c = createEncodeContext(source, key, values === undefined ? {} : { values });
  await ttl.encode(c as IMiddleware.EncodeContext, createNext());
  await ttl.afterUse(c as IMiddleware.UseContext, outcome());

  return c.destination;
}

/**
 * ストリームをエンコードして成功を確定し、コンテキストを返します。
 */
async function encodeStream(
  ttl: Ttl,
  source: ReadableStream,
  key = "",
  values?: [string, unknown][],
): Promise<ReturnType<typeof createEncodeStreamContext>> {
  const c = createEncodeStreamContext(source, key, values === undefined ? {} : { values });
  await ttl.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());
  await ttl.afterUse(c as IMiddleware.UseContext, outcome());

  return c;
}

/**
 * コピー・移動の前段フックを実行します。
 */
async function transfer(
  ttl: Ttl,
  action: "copy" | "move",
  key: string,
  destinationKey: string,
): Promise<IMiddleware.UseContext> {
  const c =
    action === "copy"
      ? createCopyContext(key, destinationKey)
      : createMoveContext(key, destinationKey);
  await ttl.use(c as IMiddleware.UseContext, createNext());

  return c;
}

/**
 * 削除の前段フックを実行します。
 */
async function prepareDelete(ttl: Ttl, key: string): Promise<IMiddleware.UseContext> {
  const c = createDeleteContext(key);
  await ttl.use(c as IMiddleware.UseContext, createNext());

  return c;
}

/**
 * 全削除の前段フックを実行します。
 */
async function prepareClear(ttl: Ttl): Promise<IMiddleware.UseContext> {
  const c = createClearContext();
  await ttl.use(c as IMiddleware.UseContext, createNext());

  return c;
}

/**
 * 記録上で失効していないストリームを開けるかを判定します。
 */
async function canDecodeStream(ttl: Ttl, key: string): Promise<boolean> {
  const c = createDecodeStreamContext(sourceFrom([]), key);

  try {
    await ttl.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

    return true;
  } catch (ex) {
    // oxlint-disable-next-line vitest/no-conditional-in-test -- 失効だけを結果として扱うための分岐です。
    if (ex instanceof KeyNotFoundError) {
      return false;
    }

    throw ex;
  }
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
      expect(() => new Ttl({ defaultTtl: actual as TtlInput })).toThrow(TtlInvalidValueError);
    }
  });

  test("不正な now では構築に失敗する", ({ expect }) => {
    expect(() => new Ttl({ now: "now" as unknown as () => number })).toThrow(TtlInvalidValueError);
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
    const ttl = createTtl((): number => NOW, 60);
    const destination = await encode(ttl, "hello", "k");
    expect(destination).toStrictEqual({
      data: "hello",
      expiresAt: NOW + 60_000,
      "@unikvs/ttl": 1,
    });
  });

  test("defaultTtl の相対秒数は書き込み時点から数える", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    now += 5000;
    expect(await encode(ttl, "hello", "k")).toStrictEqual({
      data: "hello",
      expiresAt: NOW + 65_000,
      "@unikvs/ttl": 1,
    });
  });

  test("書き込みごとの ttl 変数が defaultTtl に優先する", async ({ expect }) => {
    const ttl = createTtl((): number => NOW, 60);
    const destination = await encode(ttl, "hello", "k", [["ttl", 10]]);
    expect(destination).toStrictEqual({
      data: "hello",
      expiresAt: NOW + 10_000,
      "@unikvs/ttl": 1,
    });
  });

  test("名前空間付き ttl 変数が非名前空間名に優先する", async ({ expect }) => {
    const ttl = createTtl();
    const destination = await encode(ttl, "hello", "k", [
      ["ttl", 10],
      ["@unikvs/ttl:ttl", 20],
    ]);
    expect(destination).toStrictEqual({
      data: "hello",
      expiresAt: NOW + 20_000,
      "@unikvs/ttl": 1,
    });
  });

  test("expiresAt 変数で絶対時刻を指定できる", async ({ expect }) => {
    const ttl = createTtl();
    const at = NOW + 5000;
    expect(await encode(ttl, "v", "a", [["expiresAt", at]])).toStrictEqual({
      data: "v",
      expiresAt: at,
      "@unikvs/ttl": 1,
    });
    expect(await encode(ttl, "v", "b", [["@unikvs/ttl:expiresAt", new Date(at)]])).toStrictEqual({
      data: "v",
      expiresAt: at,
      "@unikvs/ttl": 1,
    });
    // 書き込みごとの絶対時刻は defaultTtl より優先されます。
    const withDefault = createTtl((): number => NOW, 60);
    expect(await encode(withDefault, "v", "c", [["expiresAt", at]])).toStrictEqual({
      data: "v",
      expiresAt: at,
      "@unikvs/ttl": 1,
    });
  });

  test("Date とオブジェクト形式を受け付ける", async ({ expect }) => {
    const ttl = createTtl((): number => NOW, new Date(NOW + 1000));
    expect(await encode(ttl, "v", "a")).toStrictEqual({
      data: "v",
      expiresAt: NOW + 1000,
      "@unikvs/ttl": 1,
    });
    expect(await encode(ttl, "v", "b", [["ttl", { ttl: 30 }]])).toStrictEqual({
      data: "v",
      expiresAt: NOW + 30_000,
      "@unikvs/ttl": 1,
    });
    expect(await encode(ttl, "v", "c", [["ttl", { expiresAt: NOW + 2000 }]])).toStrictEqual({
      data: "v",
      expiresAt: NOW + 2000,
      "@unikvs/ttl": 1,
    });
  });

  test("小数秒を受け付ける", async ({ expect }) => {
    const ttl = createTtl((): number => NOW, 0.05);
    expect(await encode(ttl, "v", "k")).toStrictEqual({
      data: "v",
      expiresAt: NOW + 50,
      "@unikvs/ttl": 1,
    });
  });

  test("オーバーフローする相対秒数は TtlInvalidValueError を投げる", async ({ expect }) => {
    const ttl = createTtl();
    const cases: [string, unknown][][] = [[["ttl", 1e307]], [["ttl", { ttl: 1e307 }]]];

    for (const values of cases) {
      const c = createEncodeContext("v", "k", { values });
      await expect(ttl.encode(c as IMiddleware.EncodeContext, createNext())).rejects.toThrow(
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
      await expect(ttl.encode(c as IMiddleware.EncodeContext, createNext())).rejects.toThrow(
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
    expect(error).toMatchObject({
      meta: { actual: Number.NaN },
      name: "TtlInvalidValueError",
    });
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
    const ttl = new Ttl({ now: (): number => now });
    await encode(ttl, "old", "k", [["ttl", 60]]);

    const c = createEncodeContext("new", "k");
    await ttl.encode(c as IMiddleware.EncodeContext, createNext());
    expect(c.destination).toBe("new");
    await ttl.afterUse(c as IMiddleware.UseContext, outcome());

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
    const writer = createTtl((): number => NOW, 60);
    const stored = await encode(writer, "hello", "k");
    const reader = createTtl((): number => NOW + 59_999);
    expect(await decode(reader, stored, "k")).toBe("hello");
  });

  test("期限切れでは KeyNotFoundError を投げる", async ({ expect }) => {
    const writer = createTtl((): number => NOW, 60);
    const stored = await encode(writer, "hello", "key1");
    const reader = createTtl((): number => NOW + 60_000);

    const c = createDecodeContext(stored, "key1");
    const error = await reader
      .decode(c as IMiddleware.DecodeContext, createNext())
      .catch((ex) => ex);
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      meta: { key: "key1" },
      name: "UniKvsKeyNotFoundError",
    });
  });

  test("失効時刻ちょうどでは期限切れとして扱う", async ({ expect }) => {
    const writer = createTtl((): number => NOW, 60);
    const stored = await encode(writer, "v", "k");
    const reader = createTtl((): number => NOW + 60_000);
    await expect(decode(reader, stored, "k")).rejects.toThrow(KeyNotFoundError);
  });

  test("即時失効 (ttl 0) の書き込みは読み取れない", async ({ expect }) => {
    const ttl = createTtl((): number => NOW, 0);
    const stored = await encode(ttl, "v", "k");
    await expect(decode(ttl, stored, "k")).rejects.toThrow(KeyNotFoundError);
  });

  test("過去の絶対時刻では読み取れない", async ({ expect }) => {
    const ttl = createTtl();
    const stored = await encode(ttl, "v", "k", [["expiresAt", NOW - 1]]);
    await expect(decode(createTtl(), stored, "k")).rejects.toThrow(KeyNotFoundError);
  });

  test("期限切れの decode は記録を破棄する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    const stored = await encode(ttl, "v", "k");
    now = NOW + 61_000;
    await expect(decode(ttl, stored, "k")).rejects.toThrow(KeyNotFoundError);
    // 記録は消えているため、生データは透過する (ストレージ直書きの復旧経路)。
    expect(await decode(ttl, "raw", "k")).toBe("raw");
  });

  test("エンベロープに似た利用者データは透過する", async ({ expect }) => {
    const ttl = createTtl();
    const lookalikes = [
      // data がない。
      {
        expiresAt: NOW,
        "@unikvs/ttl": 1,
      },
      // 版数が異なる。
      {
        data: "x",
        expiresAt: NOW,
        "@unikvs/ttl": 2,
      },
      // expiresAt が数値でない。
      {
        data: "x",
        expiresAt: "later",
        "@unikvs/ttl": 1,
      },
      // 余分なプロパティーがある。
      {
        data: "x",
        extra: true,
        expiresAt: NOW,
        "@unikvs/ttl": 1,
      },
    ];

    for (const lookalike of lookalikes) {
      expect(await decode(ttl, lookalike, "k")).toBe(lookalike);
    }
  });
});

describe("ストリームの付与と失効", () => {
  test("入力ストリームを同じ参照で返し、塊を変更しない", async ({ expect }) => {
    for (const ttl of [createTtl(), createTtl((): number => NOW, 60)]) {
      const chunks = ["a", "b", "c"];
      const source = sourceFrom(chunks);
      const c = await encodeStream(ttl, source, "k");
      expect(c.destination).toBe(source);
      expect(await readAll(c.destination)).toStrictEqual(chunks);
    }
  });

  test("有効期限内では decodeStream が透過する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    const chunks = ["a", "b", "c"];
    await encodeStream(ttl, sourceFrom(chunks), "k");
    now = NOW + 1000;

    const decoded = createDecodeStreamContext(sourceFrom(chunks), "k");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());
    expect(await readAll(decoded.destination)).toStrictEqual(chunks);
  });

  test("空ストリームでも記録だけが付く", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    await encodeStream(ttl, sourceFrom([]), "k");
    now = NOW + 1000;

    const decoded = createDecodeStreamContext(sourceFrom([]), "k");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());
    expect(await readAll(decoded.destination)).toStrictEqual([]);
  });

  test("記録上で期限切れなら decodeStream は KeyNotFoundError を投げる", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    await encodeStream(ttl, sourceFrom(["a"]), "k");
    now = NOW + 61_000;

    const decoded = createDecodeStreamContext(sourceFrom(["a"]), "k");
    await expect(
      ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext()),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("TTL なしの encodeStream では記録が消える", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom(["a"]), "k", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom(["a"]), "k");
    now = NOW + 120_000;

    const decoded = createDecodeStreamContext(sourceFrom(["a"]), "k");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());
    expect(await readAll(decoded.destination)).toStrictEqual(["a"]);
  });

  test("未知のキーでは透過する", async ({ expect }) => {
    const ttl = createTtl((): number => NOW + 61_000);
    const decoded = createDecodeStreamContext(sourceFrom(["x", "y"]), "unknown");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());
    expect(await readAll(decoded.destination)).toStrictEqual(["x", "y"]);
  });

  test("バイナリチャンクでも透過する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
    const encoded = await encodeStream(ttl, sourceFrom(chunks), "k");
    now = NOW + 1000;

    const decoded = createDecodeStreamContext(encoded.destination, "k");
    await ttl.decodeStream(decoded as IMiddleware.DecodeStreamContext, createNext());
    expect(await readAll(decoded.destination)).toStrictEqual(chunks);
  });

  test("ストリームで付けた期限はプレーン読み取りの decode でも検出できる", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    await encodeStream(ttl, sourceFrom(["a"]), "k");
    now = NOW + 61_000;
    await expect(decode(ttl, "raw", "k")).rejects.toThrow(KeyNotFoundError);
  });
});

describe("メタデータの確定タイミング", () => {
  test("encode は afterUse まで記録を変更しない", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    const c = createEncodeContext("v", "k", { values: [["ttl", 60]] });
    await ttl.encode(c as IMiddleware.EncodeContext, createNext());
    now = NOW + 61_000;

    // まだ記録がないため、エンベロープのない読み取りは透過します。
    expect(await decode(ttl, "raw", "k")).toBe("raw");
    await ttl.afterUse(c as IMiddleware.UseContext, outcome());
    await expect(decode(ttl, "raw", "k")).rejects.toThrow(KeyNotFoundError);
  });

  test("TTL なしの上書きは afterUse まで既存の記録を残す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encode(ttl, "old", "k", [["ttl", 60]]);

    const c = createEncodeContext("new", "k");
    await ttl.encode(c as IMiddleware.EncodeContext, createNext());

    now = NOW + 61_000;

    // 確定前は以前の期限が残るため、古い記録で失効します。
    await expect(decode(ttl, "new", "k")).rejects.toThrow(KeyNotFoundError);

    await ttl.afterUse(c as IMiddleware.UseContext, outcome());
    expect(await decode(ttl, "new", "k")).toBe("new");
  });

  test("set の失敗では確定待ちの期限を記録に反映しない", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encode(ttl, "old", "k");

    const failure = new Error("write failed");
    const c = createEncodeContext("new", "k", { values: [["ttl", 10]] });
    await ttl.encode(c as IMiddleware.EncodeContext, createNext());
    await ttl.afterUse(
      c as IMiddleware.UseContext,
      outcome("error", [target("failed", failure)], failure),
    );

    now = NOW + 20_000;

    // TTL なしの古い値に期限が付かないため、そのまま読めます。
    expect(await decode(ttl, "old", "k")).toBe("old");
  });

  test("set の中断でも全宛先が確定していれば期限を記録する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    const c = createEncodeContext("v", "k", { values: [["ttl", 60]] });
    await ttl.encode(c as IMiddleware.EncodeContext, createNext());
    await ttl.afterUse(c as IMiddleware.UseContext, outcome("aborted"));
    now = NOW + 61_000;
    await expect(decode(ttl, "raw", "k")).rejects.toThrow(KeyNotFoundError);
  });
});

describe("コピーと移動のトランザクション", () => {
  test("copy 成功時にコピー元の期限をコピー先へ引き継ぐ", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const c = await transfer(ttl, "copy", "source", "destination");
    await ttl.afterUse(c, outcome());

    now = NOW + 10_000;

    expect(await canDecodeStream(ttl, "destination")).toBe(true);
  });

  test("copy の失敗ではコピー先の記録を変更しない", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const failure = new Error("copy failed");
    const c = await transfer(ttl, "copy", "source", "destination");
    await ttl.afterUse(c, outcome("error", [target("failed", failure)], failure));

    now = NOW + 10_000;

    // コピー先の古い期限 (5 秒) が残るため失効します。
    expect(await canDecodeStream(ttl, "destination")).toBe(false);
  });

  test("copy はコピー元に期限がなければコピー先の記録を消す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source");
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const c = await transfer(ttl, "copy", "source", "destination");
    await ttl.afterUse(c, outcome());

    now = NOW + 10_000;

    // コピー元に期限がないため、コピー先の古い記録は消えます。
    expect(await canDecodeStream(ttl, "destination")).toBe(true);
  });

  test("copy は未確定の宛先があるとコピー先の記録を変更しない", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const c = await transfer(ttl, "copy", "source", "destination");
    // 一部の宛先でコピー元が見つからない部分成功です。
    await ttl.afterUse(c, outcome("success", [target("committed"), target("notFound")]));

    now = NOW + 10_000;

    // 触れていない宛先の古い期限を復活させないため、コピー先の記録は変更しません。
    expect(await canDecodeStream(ttl, "destination")).toBe(false);
    expect(await canDecodeStream(ttl, "source")).toBe(true);
  });

  test("move 成功時に移動先の期限を更新し、移動元の記録を消す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const c = await transfer(ttl, "move", "source", "destination");
    await ttl.afterUse(c, outcome());

    now = NOW + 10_000;
    expect(await canDecodeStream(ttl, "destination")).toBe(true);

    now = NOW + 61_000;

    // 移動元の記録が消えているため、失効した記録に邪魔されません。
    expect(await canDecodeStream(ttl, "source")).toBe(true);
  });

  test("copy の中断でも全宛先が確定していればコピー先の記録を更新する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const c = await transfer(ttl, "copy", "source", "destination");
    await ttl.afterUse(c, outcome("aborted"));

    now = NOW + 10_000;

    // ストレージ確定後の中断でも、全宛先が committed なら期限を引き継ぎます。
    expect(await canDecodeStream(ttl, "destination")).toBe(true);
  });

  test("move の中断でも全宛先が確定していれば移動元の記録を消す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const c = await transfer(ttl, "move", "source", "destination");
    await ttl.afterUse(c, outcome("aborted"));

    now = NOW + 10_000;
    expect(await canDecodeStream(ttl, "destination")).toBe(true);

    now = NOW + 61_000;

    // 移動元の記録も消えているため、失効した記録に邪魔されません。
    expect(await canDecodeStream(ttl, "source")).toBe(true);
  });

  test("move の失敗では移動元を残し、移動先の記録を変更しない", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const failure = new Error("move failed");
    const c = await transfer(ttl, "move", "source", "destination");
    await ttl.afterUse(c, outcome("error", [target("failed", failure)], failure));

    now = NOW + 10_000;

    expect(await canDecodeStream(ttl, "source")).toBe(true);
    expect(await canDecodeStream(ttl, "destination")).toBe(false);
  });

  test("move の部分成功では移動元を残し、移動先の記録を変更しない", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const failure = new Error("move failed");
    const c = await transfer(ttl, "move", "source", "destination");
    await ttl.afterUse(
      c,
      outcome("error", [target("committed"), target("failed", failure)], failure),
    );

    now = NOW + 10_000;

    expect(await canDecodeStream(ttl, "source")).toBe(true);
    expect(await canDecodeStream(ttl, "destination")).toBe(false);
  });

  test("move は未確定の宛先があると移動元を残し、移動先の記録を変更しない", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const c = await transfer(ttl, "move", "source", "destination");
    // 一部の宛先で移動元が見つからない部分成功です。
    await ttl.afterUse(c, outcome("success", [target("committed"), target("notFound")]));

    now = NOW + 10_000;

    // 移動元の記録を残し、触れていない宛先の古い期限を復活させないため移動先の記録も変更しません。
    expect(await canDecodeStream(ttl, "source")).toBe(true);
    expect(await canDecodeStream(ttl, "destination")).toBe(false);
  });

  test("move は移動元に期限がなければ移動先の記録を消す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source");
    await encodeStream(ttl, sourceFrom([]), "destination", [["ttl", 5]]);

    const c = await transfer(ttl, "move", "source", "destination");
    await ttl.afterUse(c, outcome());

    now = NOW + 10_000;

    // 移動元に期限がないため、移動先の古い記録は消えます。
    expect(await canDecodeStream(ttl, "destination")).toBe(true);
    expect(await canDecodeStream(ttl, "source")).toBe(true);
  });

  test("同じキーへの move は記録を消さない", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "key", [["ttl", 60]]);

    const c = await transfer(ttl, "move", "key", "key");
    await ttl.afterUse(c, outcome());

    now = NOW + 61_000;

    expect(await canDecodeStream(ttl, "key")).toBe(false);
  });

  test("期限切れのコピー元・移動元は記録を残し、delete の成功で消える", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "source", [["ttl", 60]]);
    now = NOW + 61_000;

    for (const action of ["copy", "move"] as const) {
      const c = await transfer(ttl, action, "source", "destination");

      // 失効済みのキーは実在しないキーへ写像されます。
      expect(ttl.mapKey(c as IMiddleware.MapKeyContext)).not.toBe("source");
      await ttl.afterUse(c, outcome("error", [target("notFound")]));

      // ストリームの失効情報を失わないよう、記録は残ります。
      expect(await canDecodeStream(ttl, "source")).toBe(false);
      expect(await canDecodeStream(ttl, "destination")).toBe(true);
    }

    const c = await prepareDelete(ttl, "source");
    await ttl.afterUse(c, outcome());

    // 削除が成功したときだけ記録が消えます。
    expect(await canDecodeStream(ttl, "source")).toBe(true);
  });

  test("decodeStream の失効は記録を残し、delete の成功で消える", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "key", [["ttl", 60]]);
    now = NOW + 61_000;
    await expect(
      ttl.decodeStream(
        createDecodeStreamContext(sourceFrom([]), "key") as IMiddleware.DecodeStreamContext,
        createNext(),
      ),
    ).rejects.toThrow(KeyNotFoundError);
    // 2 回目も同じ記録で失効します。
    expect(await canDecodeStream(ttl, "key")).toBe(false);

    const c = await prepareDelete(ttl, "key");
    await ttl.afterUse(c, outcome());

    expect(await canDecodeStream(ttl, "key")).toBe(true);
  });
});

describe("削除と全削除のトランザクション", () => {
  test("delete の成功で記録を消す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "key", [["ttl", 60]]);

    const c = await prepareDelete(ttl, "key");
    await ttl.afterUse(c, outcome());

    now = NOW + 61_000;

    expect(await canDecodeStream(ttl, "key")).toBe(true);
  });

  test("存在しないキーの delete でも成功なら記録を消す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "key", [["ttl", 5]]);

    const c = await prepareDelete(ttl, "key");
    await ttl.afterUse(c, outcome("success", [target("notFound")]));

    now = NOW + 10_000;

    expect(await canDecodeStream(ttl, "key")).toBe(true);
  });

  test("delete の失敗では記録を残す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "key", [["ttl", 5]]);

    const failure = new Error("delete failed");
    const c = await prepareDelete(ttl, "key");
    await ttl.afterUse(c, outcome("error", [target("failed", failure)], failure));

    now = NOW + 10_000;

    expect(await canDecodeStream(ttl, "key")).toBe(false);
  });

  test("clear の成功で全記録を消す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "a", [["ttl", 5]]);
    await encodeStream(ttl, sourceFrom([]), "b", [["ttl", 5]]);

    const c = await prepareClear(ttl);
    await ttl.afterUse(c, outcome());

    now = NOW + 10_000;

    expect(await canDecodeStream(ttl, "a")).toBe(true);
    expect(await canDecodeStream(ttl, "b")).toBe(true);
  });

  test("clear の失敗では記録を残す", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({ now: (): number => now });
    await encodeStream(ttl, sourceFrom([]), "a", [["ttl", 5]]);
    await encodeStream(ttl, sourceFrom([]), "b", [["ttl", 5]]);

    const failure = new Error("clear failed");
    const c = await prepareClear(ttl);
    await ttl.afterUse(c, outcome("error", [target("failed", failure)], failure));

    now = NOW + 10_000;

    expect(await canDecodeStream(ttl, "a")).toBe(false);
    expect(await canDecodeStream(ttl, "b")).toBe(false);
  });
});

describe("use と mapKey による失効の先取り", () => {
  test("期限内の has/get/stream は元のキーへ写像する", async ({ expect }) => {
    const ttl = new Ttl({
      now: (): number => NOW,
      defaultTtl: 60,
    });
    await encode(ttl, "v", "k");

    for (const c of [createHasContext("k"), createGetContext("k"), createStreamContext("k")]) {
      await ttl.use(c as IMiddleware.UseContext, createNext());
      expect(ttl.mapKey(c as IMiddleware.MapKeyContext)).toBe("k");
    }
  });

  test("期限切れの has/get/stream は実在しないキーへ写像する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    await encode(ttl, "v", "k");
    now = NOW + 61_000;

    for (const c of [createHasContext("k"), createGetContext("k"), createStreamContext("k")]) {
      await ttl.use(c as IMiddleware.UseContext, createNext());
      expect(ttl.mapKey(c as IMiddleware.MapKeyContext)).not.toBe("k");
    }
  });

  test("set/delete/clear の use は期限切れでも元のキーへ写像する", async ({ expect }) => {
    let now = NOW;
    const ttl = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
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
    const ttl = new Ttl({ now: (): number => NOW + 61_000 });

    for (const c of [createHasContext("missing"), createGetContext("missing")]) {
      await ttl.use(c as IMiddleware.UseContext, createNext());
      expect(ttl.mapKey(c as IMiddleware.MapKeyContext)).toBe("missing");
    }
  });
});

describe("ミドルウェア連鎖", () => {
  test("各フックは次へ処理を渡す", async ({ expect }) => {
    let calls = 0;
    const next = async (): Promise<void> => {
      calls += 1;
      await Promise.resolve();
    };
    // 期限切れの use も下流へ処理を渡します (失効の判定は mapKey に委ねます)。
    let now = NOW;
    const expired = new Ttl({
      now: (): number => now,
      defaultTtl: 60,
    });
    await encode(expired, "v", "k");
    now = NOW + 61_000;
    await expired.use(createGetContext("k") as IMiddleware.UseContext, next);

    const ttl = new Ttl({
      now: (): number => NOW,
      defaultTtl: 60,
    });
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
