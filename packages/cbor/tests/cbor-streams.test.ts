import { describe, test } from "vitest";

import Cbor from "../src/cbor.js";
import { CborDecodeError, CborEncodeError } from "../src/errors.js";
import { concatBytes, pumpThrough, splitIntoChunks } from "./helpers.js";

const cbor = new Cbor();

/**
 * 値を CBOR のバイト列へ変換します。
 */
function encode(data: unknown): Uint8Array<ArrayBuffer> {
  return cbor.encode({ data });
}

describe("CBOR シーケンスの往復", () => {
  test("複数の値をストリームで往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const values = [
      1,
      "two",
      { three: 3 },
      [4, 5],
      null,
      undefined,
      18446744073709551615n,
      Uint8Array.of(1, 2),
      new Date(0),
      new Map([[1, "one"]]),
      new Set([1, 2]),
    ];

    // 実行
    const encoded = await pumpThrough(cbor.getEncodable(), values);
    const decoded = await pumpThrough(cbor.getDecodable(), encoded.outputChunks);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(encoded.outputChunks).toHaveLength(values.length);
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("単体の値をストリームで往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const value = { message: "hello", count: 42 };

    // 実行
    const encoded = await pumpThrough(cbor.getEncodable(), [value]);
    const decoded = await pumpThrough(cbor.getDecodable(), encoded.outputChunks);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([value]);
  });

  test("1 つのチャンクに複数の値が含まれていても順にデコードされる", async ({ expect }) => {
    // 準備
    const values = [1, "two", [3]];
    const input = concatBytes(values.map((value) => encode(value)));

    // 実行
    const decoded = await pumpThrough(cbor.getDecodable(), [input]);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("空のストリームは値を 1 つも生成しない", async ({ expect }) => {
    // 実行
    const encoded = await pumpThrough(cbor.getEncodable(), []);
    const decoded = await pumpThrough(cbor.getDecodable(), []);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(encoded.outputChunks).toStrictEqual([]);
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("長さ 0 のチャンクは無視される", async ({ expect }) => {
    // 準備
    const chunks = [new Uint8Array(0), encode(1), new Uint8Array(0), encode(2), new Uint8Array(0)];

    // 実行
    const decoded = await pumpThrough(cbor.getDecodable(), chunks);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([1, 2]);
  });
});

describe("チャンク境界", () => {
  test("1 バイトずつ届く CBOR シーケンスをデコードできる", async ({ expect }) => {
    // 準備
    const values = [1, "abcdef", { nested: [true, null] }, 18446744073709551615n];
    const input = concatBytes(values.map((value) => encode(value)));

    // 実行
    const decoded = await pumpThrough(cbor.getDecodable(), splitIntoChunks(input, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("RegExp を 1 バイトずつ届くチャンクでデコードできる", async ({ expect }) => {
    // 準備
    const values = [/ab/gi, new RegExp("a".repeat(200), "g")];
    const input = concatBytes(values.map((value) => encode(value)));

    // 実行
    const decoded = await pumpThrough(cbor.getDecodable(), splitIntoChunks(input, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("途中までしか届いていない値は送出されない", async ({ expect }) => {
    // 準備
    const encoded = encode("hello world");
    const transform = cbor.getDecodable();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    // 実行
    const writing = writer.write(encoded.subarray(0, 1));

    let emitted = false;
    const reading = reader.read().then((result) => {
      emitted = true;
      return result;
    });

    await writing;

    // 検証
    expect(emitted).toBe(false);

    // 実行
    await writer.write(encoded.subarray(1));
    await writer.close();

    // 検証
    expect((await reading).value).toBe("hello world");
    expect(await reader.read()).toStrictEqual({ done: true, value: undefined });
  });

  test("完成済みの値と未完成の値が同じチャンクにあれば完成分だけ送出される", async ({ expect }) => {
    // 準備
    const first = encode(1);
    const second = encode(2);
    const partial = encode("three").subarray(0, 1);
    const transform = cbor.getDecodable();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    // 実行
    const writing = writer.write(concatBytes([first, second, partial]));

    // 検証
    expect((await reader.read()).value).toBe(1);
    expect((await reader.read()).value).toBe(2);

    let emitted = false;
    const pending = reader.read().then(
      (result) => {
        emitted = true;
        return result;
      },
      (error) => {
        emitted = true;
        throw error;
      },
    );

    await writing;
    expect(emitted).toBe(false);

    // 後始末
    await reader.cancel();
    expect((await pending).done).toBe(true);
    await writer.closed.catch(() => {});
  });

  test("大きな値を 1 バイトずつ届くチャンクでデコードできる", async ({ expect }) => {
    // 準備
    const input = new Uint8Array(64 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const encoded = encode(input);
    const decoded = await pumpThrough(cbor.getDecodable(), splitIntoChunks(encoded, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([input]);
  });

  test("1 MiB の値を適度なチャンクに分割してもデコードできる", async ({ expect }) => {
    // 準備
    const input = new Uint8Array(1024 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const encoded = encode(input);
    const decoded = await pumpThrough(cbor.getDecodable(), splitIntoChunks(encoded, 1024));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([input]);
  });
});

describe("ストリームの異常系", () => {
  test("終了時に未完成のアイテムが残ると完成済みの値を送出してから拒否される", async ({
    expect,
  }) => {
    // 準備
    const encoded = encode({ a: 1 });
    const input = concatBytes([encode(1), encoded.subarray(0, encoded.length - 1)]);

    // 実行
    const decoded = await pumpThrough(cbor.getDecodable(), [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(CborDecodeError);
    expect((error as CborDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([1]);
  });

  test("終了時に未完成のアイテムだけが残ると値を送出せずに拒否される", async ({ expect }) => {
    // 準備
    const encoded = encode({ a: 1 });

    // 実行
    const decoded = await pumpThrough(cbor.getDecodable(), [
      encoded.subarray(0, encoded.length - 1),
    ]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(CborDecodeError);
    expect((error as CborDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("CBOR として不正なバイト列は CborDecodeError で拒否される", async ({ expect }) => {
    // 実行
    const decoded = await pumpThrough(cbor.getDecodable(), [Uint8Array.of(0x1c)]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(CborDecodeError);
    expect((error as CborDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("完成済みの値の直後に不正なバイト列が届いても拒否される", async ({ expect }) => {
    // 準備
    const input = concatBytes([encode(1), Uint8Array.of(0x1c)]);

    // 実行
    const decoded = await pumpThrough(cbor.getDecodable(), [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(CborDecodeError);
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("エンコードできない値を流すと CborEncodeError で拒否される", async ({ expect }) => {
    // 実行
    const encoded = await pumpThrough(cbor.getEncodable(), [1, () => {}, 3]);

    // 検証
    const error = encoded.writeError ?? encoded.readError;
    expect(error).toBeInstanceOf(CborEncodeError);
    expect((error as CborEncodeError).cause).toBeInstanceOf(Error);
    expect(encoded.outputChunks).toStrictEqual([encode(1)]);
  });

  test("読み取り側のキャンセルは書き込み側へ伝播する", async ({ expect }) => {
    // 準備
    const transform = cbor.getDecodable();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();
    const reason = new Error("キャンセル");

    // 実行
    await reader.cancel(reason);

    // 検証
    await expect(writer.write(encode(1))).rejects.toBe(reason);
    await expect(writer.closed).rejects.toBe(reason);
  });

  test("書き込み側の abort は読み取り側へ伝播する", async ({ expect }) => {
    // 準備
    const transform = cbor.getDecodable();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();
    const reason = new Error("中断");

    // 実行
    const reading = reader.read();
    await writer.abort(reason);

    // 検証
    await expect(reading).rejects.toBe(reason);
    await expect(writer.closed).rejects.toBe(reason);
  });
});
