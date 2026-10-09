import { describe, expect, test } from "vitest";

import { V8SerdeDecodeError, V8SerdeEncodeError } from "../src/errors.js";
import V8Serde from "../src/v8-serde.js";
import { concatBytes, pumpThrough, splitIntoChunks } from "./helpers.js";

const v8serde = new V8Serde();

/**
 * 値を 4 バイトの長さヘッダー付きフレームへ変換します。
 */
async function encodeFrame(data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const { outputChunks } = await pumpThrough(await v8serde.getEncodable(), [data]);

  return concatBytes(outputChunks);
}

describe("フレームの往復", () => {
  test("複数の値をストリームで往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const values = [
      1,
      "two",
      { three: 3 },
      [4, 5],
      null,
      undefined,
      -0,
      18446744073709551615n,
      Uint8Array.of(1, 2),
      new Date(0),
      new Map([[1, "one"]]),
      new Set([1, 2]),
      /ab+c/gi,
    ];

    // 実行
    const encoded = await pumpThrough(await v8serde.getEncodable(), values);
    const decoded = await pumpThrough(await v8serde.getDecodable(), encoded.outputChunks);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(encoded.outputChunks).toHaveLength(values.length);
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toHaveLength(values.length);
    for (const [index, value] of values.entries()) {
      if (typeof value === "number" && Object.is(value, -0)) {
        expect(Object.is(decoded.outputChunks[index], -0)).toBe(true);
      } else {
        expect(decoded.outputChunks[index]).toStrictEqual(value);
      }
    }
  });

  test("単体の値をストリームで往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const value = { message: "hello", count: 42 };

    // 実行
    const encoded = await pumpThrough(await v8serde.getEncodable(), [value]);
    const decoded = await pumpThrough(await v8serde.getDecodable(), encoded.outputChunks);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([value]);
  });

  test("1 つのチャンクに複数のフレームが含まれていても順にデコードされる", async ({ expect }) => {
    // 準備
    const values = [1, "two", [3]];
    const frames = await Promise.all(values.map((value) => encodeFrame(value)));
    const input = concatBytes(frames);

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), [input]);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("空のストリームは値を 1 つも生成しない", async ({ expect }) => {
    // 実行
    const encoded = await pumpThrough(await v8serde.getEncodable(), []);
    const decoded = await pumpThrough(await v8serde.getDecodable(), []);

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
    const chunks = [
      new Uint8Array(0),
      await encodeFrame(1),
      new Uint8Array(0),
      await encodeFrame(2),
      new Uint8Array(0),
    ];

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), chunks);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([1, 2]);
  });
});

describe("フレーム形式", () => {
  test("先頭の 4 バイトはビッグエンディアンのペイロード長である", async ({ expect }) => {
    // 準備
    const frame = await encodeFrame({ value: "hello" });

    // 実行
    const length = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(
      0,
      false,
    );

    // 検証
    expect(length).toBe(frame.byteLength - 4);
  });

  test("フレームの本体は単発のエンコード結果と一致する", async ({ expect }) => {
    // 準備
    const value = { value: [1, "two"] };

    // 実行
    const frame = await encodeFrame(value);
    const encoded = await v8serde.encode({ data: value });

    // 検証
    expect(frame.slice(4)).toStrictEqual(encoded);
  });
});

describe("チャンク境界", () => {
  test("1 バイトずつ届くフレーム列をデコードできる", async ({ expect }) => {
    // 準備
    const values = [1, "abcdef", { nested: [true, null] }, 18446744073709551615n];
    const frames = await Promise.all(values.map((value) => encodeFrame(value)));
    const input = concatBytes(frames);

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), splitIntoChunks(input, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("RegExp を 1 バイトずつ届くチャンクでデコードできる", async ({ expect }) => {
    // 準備
    const values = [/ab/gi, new RegExp("a".repeat(200), "g")];
    const frames = await Promise.all(values.map((value) => encodeFrame(value)));
    const input = concatBytes(frames);

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), splitIntoChunks(input, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("7 バイトずつ届くフレーム列をデコードできる", async ({ expect }) => {
    // 準備
    const values = [new Map([[1, "one"]]), new Set([1, 2]), new Date(0)];
    const frames = await Promise.all(values.map((value) => encodeFrame(value)));
    const input = concatBytes(frames);

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), splitIntoChunks(input, 7));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("途中までしか届いていない値は送出されない", async ({ expect }) => {
    // 準備
    const frame = await encodeFrame("hello world");
    const transform = await v8serde.getDecodable();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    // 実行
    const writing = writer.write(frame.subarray(0, 1));

    let emitted = false;
    const reading = reader.read().then((result) => {
      emitted = true;
      return result;
    });

    await writing;

    // 検証
    expect(emitted).toBe(false);

    // 実行
    await writer.write(frame.subarray(1));
    await writer.close();

    // 検証
    expect((await reading).value).toBe("hello world");
    expect(await reader.read()).toStrictEqual({ done: true, value: undefined });
  });

  test("完成済みの値と未完成の値が同じチャンクにあれば完成分だけ送出される", async ({ expect }) => {
    // 準備
    const first = await encodeFrame(1);
    const second = await encodeFrame(2);
    const partial = (await encodeFrame("three")).subarray(0, 1);
    const transform = await v8serde.getDecodable();
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
    const frame = await encodeFrame(input);
    const decoded = await pumpThrough(await v8serde.getDecodable(), splitIntoChunks(frame, 1));

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
    const frame = await encodeFrame(input);
    const decoded = await pumpThrough(await v8serde.getDecodable(), splitIntoChunks(frame, 1024));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([input]);
  });
});

describe("内部バッファーの参照共有の防止", () => {
  test.each([[3], [16], [1024], [65536]])(
    "%i バイトの型付き配列は内部バッファーの上書き後も不変である",
    async (size) => {
      // 準備
      const input = new Uint8Array(size);
      for (let index = 0; index < input.length; index++) {
        input[index] = index % 251;
      }
      const frame = await encodeFrame(input);
      // 復元値の本体はペイロードの末尾にあるため、上書きはそこまで届く長さにします。
      // 再確保が起きると古いバッファーが残り検証にならないため、容量内に収めます。
      const capacity = Math.max(frame.byteLength, 16);
      const filler = new Uint8Array(Math.min(capacity, 32)).fill(0xab);
      const transform = await v8serde.getDecodable();
      const writer = transform.writable.getWriter();
      const reader = transform.readable.getReader();

      // 実行: 復元した直後に未完成バイト列を書き込み、内部バッファーを上書きします。
      // 書き込みは読み取りと並行させないとバックプレッシャーで待機するため、先に読みを開始します。
      // 未完成のため読みは解決せず、後始末で取り消します。
      const writing = writer.write(frame);
      const first = await reader.read();
      await writing;
      const pendingRead = reader.read().then(
        () => undefined,
        () => undefined,
      );
      await writer.write(filler);

      // 検証: 複写なしでは上書きで復元値が壊れるため、不変なら複写されています。
      expect(first.value).toStrictEqual(input);

      // 後始末
      await reader.cancel();
      await pendingRead;
      await writer.close().catch(() => {});
    },
  );
});

describe("ストリームの異常系", () => {
  test("終了時に未完成のフレームが残ると完成済みの値を送出してから拒否される", async ({
    expect,
  }) => {
    // 準備
    const frame = await encodeFrame({ a: 1 });
    const input = concatBytes([await encodeFrame(1), frame.subarray(0, frame.byteLength - 1)]);

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([1]);
  });

  test("終了時に未完成のフレームだけが残ると値を送出せずに拒否される", async ({ expect }) => {
    // 準備
    const frame = await encodeFrame({ a: 1 });

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), [
      frame.subarray(0, frame.byteLength - 1),
    ]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("終了時にヘッダー断片だけが残ると V8SerdeDecodeError で拒否される", async ({ expect }) => {
    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), [Uint8Array.of(0, 0)]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((error as V8SerdeDecodeError).cause as Error).message).toMatch(
      /Incomplete v8-serde frame header/,
    );
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("終了時に本体が不足したフレームが残ると V8SerdeDecodeError で拒否される", async ({
    expect,
  }) => {
    // 準備: 本体 16 バイトを主張するヘッダーに 2 バイトだけ添えます。
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, 16, false);
    const input = concatBytes([header, Uint8Array.of(0, 0)]);

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((error as V8SerdeDecodeError).cause as Error).message).toMatch(
      /Incomplete v8-serde frame payload/,
    );
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("巨大な長さを主張するヘッダーは確保せずに待機し終了時に拒否される", async ({ expect }) => {
    // 準備: 4GiB-1 バイトを主張するヘッダーだけを送り、本体は送りません。
    const input = Uint8Array.of(0xff, 0xff, 0xff, 0xff);

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((error as V8SerdeDecodeError).cause as Error).message).toMatch(
      /Incomplete v8-serde frame payload/,
    );
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("本体が破損したフレームは V8SerdeDecodeError で拒否される", async ({ expect }) => {
    // 準備: 長さは正しいまま本体の先頭バイトを反転させ、バージョン検査で失敗させます。
    const valid = await encodeFrame({ value: 1 });
    const corrupt = valid.slice();
    corrupt[4] = (valid[4] ?? 0) ^ 0xff;

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), [corrupt]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((error as V8SerdeDecodeError).cause as Error).message).toContain(
      "Unable to deserialize cloned data",
    );
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("完成済みの値の直後に破損したフレームが届くと完成分を送出してから拒否される", async ({
    expect,
  }) => {
    // 準備
    const valid = await encodeFrame({ value: 1 });
    const corrupt = valid.slice();
    corrupt[4] = (valid[4] ?? 0) ^ 0xff;
    const input = concatBytes([await encodeFrame(1), corrupt]);

    // 実行
    const decoded = await pumpThrough(await v8serde.getDecodable(), [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([1]);
  });

  test("エンコードできない値を流すと V8SerdeEncodeError で拒否される", async ({ expect }) => {
    // 実行
    const encoded = await pumpThrough(await v8serde.getEncodable(), [1, () => {}, 3]);

    // 検証
    const error = encoded.writeError ?? encoded.readError;
    expect(error).toBeInstanceOf(V8SerdeEncodeError);
    expect((error as V8SerdeEncodeError).cause).toBeInstanceOf(Error);
    expect(encoded.outputChunks).toStrictEqual([await encodeFrame(1)]);
  });

  test("読み取り側のキャンセルは書き込み側へ伝播する", async ({ expect }) => {
    // 準備
    const transform = await v8serde.getDecodable();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();
    const reason = new Error("キャンセル");

    // 実行
    await reader.cancel(reason);

    // 検証
    await expect(writer.write(await encodeFrame(1))).rejects.toBe(reason);
    await expect(writer.closed).rejects.toBe(reason);
  });

  test("書き込み側の abort は読み取り側へ伝播する", async ({ expect }) => {
    // 準備
    const transform = await v8serde.getDecodable();
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
