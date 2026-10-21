import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { ExpiryInvalidExpiresAtError, KeyNotFoundError } from "../src/errors.js";
import Expiry from "../src/expiry.js";

const NOW = 1_000_000;
const FUTURE = NOW + 60_000;
const PAST = NOW - 1;

const EXPIRES_AT_VAR = "@unikvs/expiry:expiresAt";

const EXPIRY_MARKER = "@unikvs/expiry";

/**
 * 下流に保存される有効期限エンベロープを作成します。
 *
 * @param expiresAt 失効時刻 (epoch ミリ秒) または期限なしの `null` です。
 * @param data 包む値です。
 * @returns エンベロープを返します。
 */
function envelope(expiresAt: number | null, data: unknown) {
  return { [EXPIRY_MARKER]: 1, expiresAt, data };
}

function withExpiresAt(value: unknown) {
  return { values: { [EXPIRES_AT_VAR]: value } };
}

describe("初期化と基本属性", () => {
  test("name は Expiry である", ({ expect }) => {
    // 準備
    const transformer = new Expiry();

    // 実行と検証
    expect(transformer.name).toBe("Expiry");
  });

  test("isOpen は常に true である", ({ expect }) => {
    // 準備
    const transformer = new Expiry();

    // 実行と検証
    expect(transformer.isOpen).toBe(true);
  });

  test("defaultExpiresAt の既定値は undefined である", ({ expect }) => {
    // 実行と検証
    expect(new Expiry().defaultExpiresAt).toBeUndefined();
    expect(new Expiry({}).defaultExpiresAt).toBeUndefined();
    expect(new Expiry(undefined).defaultExpiresAt).toBeUndefined();
    expect(new Expiry({ defaultExpiresAt: undefined }).defaultExpiresAt).toBeUndefined();
  });

  test("defaultExpiresAt を指定できる", ({ expect }) => {
    // 準備
    const input = new Date(FUTURE);

    // 実行と検証
    expect(new Expiry({ defaultExpiresAt: FUTURE }).defaultExpiresAt).toBe(FUTURE);
    expect(new Expiry({ defaultExpiresAt: input }).defaultExpiresAt).toBe(input);
    expect(new Expiry({ defaultExpiresAt: new Date(FUTURE).toISOString() }).defaultExpiresAt).toBe(
      new Date(FUTURE).toISOString(),
    );
  });

  test("不正な defaultExpiresAt では構築に失敗する", ({ expect }) => {
    // 実行と検証
    expect(() => new Expiry({ defaultExpiresAt: "not-a-date" })).toThrow(
      ExpiryInvalidExpiresAtError,
    );
    expect(() => new Expiry({ defaultExpiresAt: Number.NaN })).toThrow(ExpiryInvalidExpiresAtError);
    expect(() => new Expiry({ defaultExpiresAt: new Date(Number.NaN) })).toThrow(
      ExpiryInvalidExpiresAtError,
    );
  });
});

describe("有効期限の解決", () => {
  test("encode は数値の expiresAt をそのまま包む", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();
    const c = createEncodeContext("hello", "k1", withExpiresAt(FUTURE));

    // 実行
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toStrictEqual(envelope(FUTURE, "hello"));
  });

  test("encode は Date の expiresAt を時刻に変換する", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();
    const c = createEncodeContext("hello", "k1", withExpiresAt(new Date(FUTURE)));

    // 実行
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toStrictEqual(envelope(FUTURE, "hello"));
  });

  test("encode は ISO 文字列の expiresAt を時刻に変換する", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();
    const c = createEncodeContext("hello", "k1", withExpiresAt(new Date(FUTURE).toISOString()));

    // 実行
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toStrictEqual(envelope(FUTURE, "hello"));
  });

  test("encode はキーごとの指定を既定値より優先する", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ defaultExpiresAt: PAST });
    const c = createEncodeContext("hello", "k1", withExpiresAt(FUTURE));

    // 実行
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toStrictEqual(envelope(FUTURE, "hello"));
  });

  test("encode は指定がなければ既定値を使う", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ defaultExpiresAt: FUTURE });
    const c = createEncodeContext("hello", "k1");

    // 実行
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toStrictEqual(envelope(FUTURE, "hello"));
  });

  test("encode は指定も既定値もなければ expiresAt を null にする", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();
    const c = createEncodeContext("hello", "k1");

    // 実行
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toStrictEqual(envelope(null, "hello"));
  });

  test("encode は null の指定を不在とみなす", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ defaultExpiresAt: FUTURE });
    const c = createEncodeContext("hello", "k1", withExpiresAt(null));

    // 実行
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toStrictEqual(envelope(FUTURE, "hello"));
  });

  test("encode は不正な指定で失敗する", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();

    // 実行と検証
    for (const actual of ["not-a-date", Number.NaN, true, {}, [FUTURE]]) {
      const c = createEncodeContext("hello", "k1", withExpiresAt(actual));

      const error = await transformer.encode(c as IMiddleware.EncodeContext, createNext()).then(
        () => undefined,
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(ExpiryInvalidExpiresAtError);
      expect((error as ExpiryInvalidExpiresAtError).meta).toStrictEqual({ key: "k1", actual });
    }
  });

  test("encode は next を呼び出す", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();
    const c = createEncodeContext("hello", "k1");
    let called = 0;
    const next: IMiddleware.INext = async () => {
      called += 1;
    };

    // 実行
    await transformer.encode(c as IMiddleware.EncodeContext, next);

    // 検証
    expect(called).toBe(1);
  });
});

describe("復号", () => {
  test("decode は期限前の包みを剥がす", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });
    const c = createDecodeContext(envelope(FUTURE, "hello"), "k1");

    // 実行
    await transformer.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(c.destination).toBe("hello");
  });

  test("decode は expiresAt が null の包みを剥がす", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });
    const c = createDecodeContext(envelope(null, "hello"), "k1");

    // 実行
    await transformer.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(c.destination).toBe("hello");
  });

  test("decode は包まれていない値をそのまま返す", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });

    // 実行と検証
    for (const source of [
      "hello",
      42,
      null,
      undefined,
      [1, 2, 3],
      new Uint8Array([1, 2, 3]),
      { data: "hello" },
      { expiresAt: FUTURE },
      { expiresAt: "tomorrow", data: "hello" },
      { expiresAt: FUTURE, data: "hello" },
      { [EXPIRY_MARKER]: 2, expiresAt: FUTURE, data: "hello" },
      { [EXPIRY_MARKER]: 1, expiresAt: FUTURE },
      { [EXPIRY_MARKER]: 1, expiresAt: FUTURE, data: "hello", extra: true },
    ]) {
      const c = createDecodeContext(source, "k1");
      await transformer.decode(c as IMiddleware.DecodeContext, createNext());

      expect(c.destination).toBe(source);
    }
  });

  test("decode は期限切れで KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });
    const c = createDecodeContext(envelope(PAST, "hello"), "k1");

    // 実行
    const error = await transformer.decode(c as IMiddleware.DecodeContext, createNext()).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "k1" });
  });

  test("decode は now と同時刻の期限を期限切れとみなす", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });

    // 実行と検証: 同時刻は期限切れである。
    const expired = createDecodeContext(envelope(NOW, "hello"), "k1");
    await expect(
      transformer.decode(expired as IMiddleware.DecodeContext, createNext()),
    ).rejects.toThrow(KeyNotFoundError);

    // 実行と検証: 1 ミリ秒前は期限内である。
    const fresh = createDecodeContext(envelope(NOW, "hello"), "k1");
    const earlier = new Expiry({ now: () => NOW - 1 });
    await earlier.decode(fresh as IMiddleware.DecodeContext, createNext());
    expect(fresh.destination).toBe("hello");
  });

  test("decode は期限切れで onExpire を呼び出す", async ({ expect }) => {
    // 準備
    const calls: { key: string; expiresAt: number }[] = [];
    const transformer = new Expiry({
      now: () => NOW,
      onExpire: (info) => {
        calls.push({ ...info });
      },
    });

    // 実行: 期限切れでは呼び出される。
    const expired = createDecodeContext(envelope(PAST, "hello"), "k1");
    await transformer.decode(expired as IMiddleware.DecodeContext, createNext()).then(
      () => undefined,
      () => undefined,
    );

    // 実行: 期限内では呼び出されない。
    const fresh = createDecodeContext(envelope(FUTURE, "hello"), "k2");
    await transformer.decode(fresh as IMiddleware.DecodeContext, createNext());

    // 実行: 包まれていない値では呼び出されない。
    const legacy = createDecodeContext("hello", "k3");
    await transformer.decode(legacy as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(calls).toStrictEqual([{ key: "k1", expiresAt: PAST }]);
  });

  test("decode は既定の now として現在時刻を使う", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();

    // 実行と検証: 十分に未来の期限は剥がされる。
    const fresh = createDecodeContext(envelope(Date.now() + 60_000, "hello"), "k1");
    await transformer.decode(fresh as IMiddleware.DecodeContext, createNext());
    expect(fresh.destination).toBe("hello");

    // 実行と検証: 過去の期限は期限切れである。
    const expired = createDecodeContext(envelope(0, "hello"), "k1");
    await expect(
      transformer.decode(expired as IMiddleware.DecodeContext, createNext()),
    ).rejects.toThrow(KeyNotFoundError);
  });
});

describe("ExpiryInvalidExpiresAtError", () => {
  test("キー付きのエラーは実際値とキーを英語メッセージに含める", ({ expect }) => {
    // 準備
    const error = new ExpiryInvalidExpiresAtError({ key: "k1", actual: "not-a-date" });

    // 実行と検証
    expect(error.name).toBe("ExpiryInvalidExpiresAtError");
    expect(error.message).toBe(
      'Invalid expiresAt "not-a-date" for key "k1". Expected a Date, epoch milliseconds, or an ISO 8601 string.',
    );
    expect(error.meta).toStrictEqual({ key: "k1", actual: "not-a-date" });
  });

  test("キーなしのエラーはキー部分を省略する", ({ expect }) => {
    // 準備
    const error = new ExpiryInvalidExpiresAtError({ actual: 0 });

    // 実行と検証
    expect(error.message).toBe(
      "Invalid expiresAt 0. Expected a Date, epoch milliseconds, or an ISO 8601 string.",
    );
    expect(error.meta).toStrictEqual({ key: undefined, actual: 0 });
  });
});

describe("ストリーム", () => {
  test("encodeStream は各チャンクを包む", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });
    const c = createEncodeStreamContext(sourceFrom(["a", "b", "c"]), "k1", withExpiresAt(FUTURE));

    // 実行
    await transformer.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toStrictEqual([
      envelope(FUTURE, "a"),
      envelope(FUTURE, "b"),
      envelope(FUTURE, "c"),
    ]);
  });

  test("encodeStream は指定がなければ expiresAt を null にする", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();
    const c = createEncodeStreamContext(sourceFrom(["a"]), "k1");

    // 実行
    await transformer.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toStrictEqual([envelope(null, "a")]);
  });

  test("encodeStream は不正な指定で失敗する", async ({ expect }) => {
    // 準備
    const transformer = new Expiry();
    const c = createEncodeStreamContext(sourceFrom(["a"]), "k1", withExpiresAt("not-a-date"));

    // 実行と検証
    await expect(
      transformer.encodeStream(c as IMiddleware.EncodeStreamContext, createNext()),
    ).rejects.toThrow(ExpiryInvalidExpiresAtError);
  });

  test("decodeStream は各チャンクの包みを剥がす", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });
    const c = createDecodeStreamContext(
      sourceFrom([envelope(FUTURE, "a"), envelope(FUTURE, "b")]),
      "k1",
    );

    // 実行
    await transformer.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toStrictEqual(["a", "b"]);
  });

  test("decodeStream は包まれていないチャンクをそのまま通す", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });
    const chunks = ["a", 42, null, { data: "b" }];
    const c = createDecodeStreamContext(sourceFrom(chunks), "k1");

    // 実行
    await transformer.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toStrictEqual(chunks);
  });

  test("decodeStream は期限切れのチャンクで KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const calls: { key: string; expiresAt: number }[] = [];
    const transformer = new Expiry({
      now: () => NOW,
      onExpire: (info) => {
        calls.push({ ...info });
      },
    });
    const c = createDecodeStreamContext(
      sourceFrom([envelope(FUTURE, "a"), envelope(PAST, "b")]),
      "k1",
    );

    // 実行
    await transformer.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const error = await readAll(c.destination).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "k1" });
    expect(calls).toStrictEqual([{ key: "k1", expiresAt: PAST }]);
  });

  test("decodeStream は空の入力を空のまま返す", async ({ expect }) => {
    // 準備
    const transformer = new Expiry({ now: () => NOW });
    const c = createDecodeStreamContext(sourceFrom([]), "k1");

    // 実行
    await transformer.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toStrictEqual([]);
  });
});
