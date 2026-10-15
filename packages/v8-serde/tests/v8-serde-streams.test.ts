import type { IMiddleware } from "@unikvs/core";
import {
  concatBytes,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  createOpenContext,
  sourceFrom,
  splitIntoChunks,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { V8SerdeDecodeError, V8SerdeEncodeError } from "../src/errors.js";
import V8Serde from "../src/v8-serde.js";

/**
 * 開済みのターゲットを作成します。
 */
async function createOpenedTarget(signal: AbortSignal): Promise<V8Serde> {
  const target = new V8Serde();
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

  return target;
}

/**
 * 読み取り中に起きたエラーを握り潰さずに観測しつつ、読み取れたデータをすべて集めます。
 * ストリームの読み取り時のエラーを検証するために使用します。
 */
async function collectSettled<T>(stream: ReadableStream<T>): Promise<{
  outputChunks: T[];
  writeError: undefined;
  readError: unknown;
}> {
  const outputChunks: T[] = [];
  let readError: unknown;
  const reader = stream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    }
  } catch (ex) {
    readError = ex;
  }

  return { outputChunks, writeError: undefined, readError };
}

/**
 * 値の列をエンコードストリームに流し、出力されたチャンクを返します。
 */
function pumpEncode(
  target: V8Serde,
  values: readonly unknown[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createEncodeStreamContext(sourceFrom(values));

  return target
    .encodeStream(
      c as IMiddleware.EncodeStreamContext<unknown, Uint8Array<ArrayBuffer>>,
      createNext(),
    )
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列をデコードストリームに流し、出力された値を返します。
 */
function pumpDecode(
  target: V8Serde,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: unknown[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return target
    .decodeStream(
      c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, unknown>,
      createNext(),
    )
    .then(() => collectSettled(c.destination as ReadableStream<unknown>));
}

/**
 * 値をシリアライズしてバイト列で返します。
 */
async function encode(target: V8Serde, data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(
    c as IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * 値を 4 バイトの長さヘッダー付きフレームへ変換します。
 */
async function encodeFrame(target: V8Serde, data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const { outputChunks } = await pumpEncode(target, [data]);

  return concatBytes(outputChunks);
}

/**
 * デコードストリームの出力リーダーを作成します。
 * 上流のチャンク投入を手動で制御するために使用します。
 */
async function createDecodeReader(target: V8Serde): Promise<{
  controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
  reader: ReadableStreamDefaultReader<unknown>;
  cancel: (reason?: unknown) => Promise<void>;
  close: () => void;
}> {
  let controller!: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(c) {
      controller = c;
    },
  });
  const c = createDecodeStreamContext(source);
  await target.decodeStream(
    c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, unknown>,
    createNext(),
  );
  const destination = c.destination as ReadableStream<unknown>;
  const reader = destination.getReader();

  return {
    controller,
    reader,
    cancel: (reason?: unknown) => reader.cancel(reason),
    close: () => controller.close(),
  };
}

describe("フレームの往復", () => {
  test("複数の値をストリームで往復すると元の値に戻る", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
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
    const encoded = await pumpEncode(target, values);
    const decoded = await pumpDecode(target, encoded.outputChunks);

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

  test("単体の値をストリームで往復すると元の値に戻る", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const value = { message: "hello", count: 42 };

    // 実行
    const encoded = await pumpEncode(target, [value]);
    const decoded = await pumpDecode(target, encoded.outputChunks);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([value]);
  });

  test("1 つのチャンクに複数のフレームが含まれていても順にデコードされる", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const values = [1, "two", [3]];
    const frames = await Promise.all(values.map((value) => encodeFrame(target, value)));
    const input = concatBytes(frames);

    // 実行
    const decoded = await pumpDecode(target, [input]);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("空のストリームは値を 1 つも生成しない", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);

    // 実行
    const encoded = await pumpEncode(target, []);
    const decoded = await pumpDecode(target, []);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(encoded.outputChunks).toStrictEqual([]);
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("長さ 0 のチャンクは無視される", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const chunks = [
      new Uint8Array(0),
      await encodeFrame(target, 1),
      new Uint8Array(0),
      await encodeFrame(target, 2),
      new Uint8Array(0),
    ];

    // 実行
    const decoded = await pumpDecode(target, chunks);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([1, 2]);
  });
});

describe("フレーム形式", () => {
  test("先頭の 4 バイトはビッグエンディアンのペイロード長である", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const frame = await encodeFrame(target, { value: "hello" });

    // 実行
    const length = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(
      0,
      false,
    );

    // 検証
    expect(length).toBe(frame.byteLength - 4);
  });

  test("フレームの本体は単発のエンコード結果と一致する", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const value = { value: [1, "two"] };

    // 実行
    const frame = await encodeFrame(target, value);
    const encoded = await encode(target, value);

    // 検証
    expect(frame.slice(4)).toStrictEqual(encoded);
  });
});

describe("チャンク境界", () => {
  test("1 バイトずつ届くフレーム列をデコードできる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const values = [1, "abcdef", { nested: [true, null] }, 18446744073709551615n];
    const frames = await Promise.all(values.map((value) => encodeFrame(target, value)));
    const input = concatBytes(frames);

    // 実行
    const decoded = await pumpDecode(target, splitIntoChunks(input, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("RegExp を 1 バイトずつ届くチャンクでデコードできる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const values = [/ab/gi, new RegExp("a".repeat(200), "g")];
    const frames = await Promise.all(values.map((value) => encodeFrame(target, value)));
    const input = concatBytes(frames);

    // 実行
    const decoded = await pumpDecode(target, splitIntoChunks(input, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("7 バイトずつ届くフレーム列をデコードできる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const values = [new Map([[1, "one"]]), new Set([1, 2]), new Date(0)];
    const frames = await Promise.all(values.map((value) => encodeFrame(target, value)));
    const input = concatBytes(frames);

    // 実行
    const decoded = await pumpDecode(target, splitIntoChunks(input, 7));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("途中までしか届いていない値は送出されない", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const frame = await encodeFrame(target, "hello world");
    const { controller, reader, close } = await createDecodeReader(target);

    // 実行
    controller.enqueue(frame.subarray(0, 1));

    let emitted = false;
    const reading = reader.read().then((result) => {
      emitted = true;
      return result;
    });

    // チャンクの処理を待ってから送出の有無を確認します。
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // 検証
    expect(emitted).toBe(false);

    // 実行
    controller.enqueue(frame.subarray(1));
    close();

    // 検証
    expect((await reading).value).toBe("hello world");
    expect(await reader.read()).toStrictEqual({ done: true, value: undefined });
  });

  test("完成済みの値と未完成の値が同じチャンクにあれば完成分だけ送出される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const first = await encodeFrame(target, 1);
    const second = await encodeFrame(target, 2);
    const partial = (await encodeFrame(target, "three")).subarray(0, 1);
    const { controller, reader, cancel } = await createDecodeReader(target);

    // 実行
    controller.enqueue(concatBytes([first, second, partial]));

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

    // チャンクの処理を待ってから送出の有無を確認します。
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(emitted).toBe(false);

    // 後始末
    await cancel();
    expect((await pending).done).toBe(true);
  });

  test("大きな値を 1 バイトずつ届くチャンクでデコードできる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = new Uint8Array(64 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const frame = await encodeFrame(target, input);
    const decoded = await pumpDecode(target, splitIntoChunks(frame, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([input]);
  });

  test("1 MiB の値を適度なチャンクに分割してもデコードできる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = new Uint8Array(1024 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const frame = await encodeFrame(target, input);
    const decoded = await pumpDecode(target, splitIntoChunks(frame, 1024));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([input]);
  });
});

describe("内部バッファーの参照共有の防止", () => {
  test.for([[3], [16], [1024], [65536]])(
    "%i バイトの型付き配列は内部バッファーの上書き後も不変である",
    async ([size], { expect, signal }) => {
      // 準備
      const target = await createOpenedTarget(signal);
      const input = new Uint8Array(size!);
      for (let index = 0; index < input.length; index++) {
        input[index] = index % 251;
      }
      const frame = await encodeFrame(target, input);
      // 復元値の本体はペイロードの末尾にあるため、上書きはそこまで届く長さにします。
      // 再確保が起きると古いバッファーが残り検証にならないため、容量内に収めます。
      const capacity = Math.max(frame.byteLength, 16);
      const filler = new Uint8Array(Math.min(capacity, 32)).fill(0xab);
      const { controller, reader, cancel } = await createDecodeReader(target);

      // 実行: 復元した直後に未完成バイト列を書き込み、内部バッファーを上書きします。
      controller.enqueue(frame);
      const first = await reader.read();
      controller.enqueue(filler);

      // 検証: 複写なしでは上書きで復元値が壊れるため、不変なら複写されています。
      expect(first.value).toStrictEqual(input);

      // 後始末
      await cancel();
    },
  );
});

describe("ストリームの異常系", () => {
  test("終了時に未完成のフレームが残ると完成済みの値を送出してから拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const frame = await encodeFrame(target, { a: 1 });
    const input = concatBytes([
      await encodeFrame(target, 1),
      frame.subarray(0, frame.byteLength - 1),
    ]);

    // 実行
    const decoded = await pumpDecode(target, [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([1]);
  });

  test("終了時に未完成のフレームだけが残ると値を送出せずに拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const frame = await encodeFrame(target, { a: 1 });

    // 実行
    const decoded = await pumpDecode(target, [frame.subarray(0, frame.byteLength - 1)]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("終了時にヘッダー断片だけが残ると V8SerdeDecodeError で拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);

    // 実行
    const decoded = await pumpDecode(target, [Uint8Array.of(0, 0)]);

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
    signal,
  }) => {
    // 準備: 本体 16 バイトを主張するヘッダーに 2 バイトだけ添えます。
    const target = await createOpenedTarget(signal);
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, 16, false);
    const input = concatBytes([header, Uint8Array.of(0, 0)]);

    // 実行
    const decoded = await pumpDecode(target, [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((error as V8SerdeDecodeError).cause as Error).message).toMatch(
      /Incomplete v8-serde frame payload/,
    );
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("巨大な長さを主張するヘッダーは確保せずに待機し終了時に拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備: 4GiB-1 バイトを主張するヘッダーだけを送り、本体は送りません。
    const target = await createOpenedTarget(signal);
    const input = Uint8Array.of(0xff, 0xff, 0xff, 0xff);

    // 実行
    const decoded = await pumpDecode(target, [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((error as V8SerdeDecodeError).cause as Error).message).toMatch(
      /Incomplete v8-serde frame payload/,
    );
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("本体が破損したフレームは V8SerdeDecodeError で拒否される", async ({ expect, signal }) => {
    // 準備: 長さは正しいまま本体の先頭バイトを反転させ、バージョン検査で失敗させます。
    const target = await createOpenedTarget(signal);
    const valid = await encodeFrame(target, { value: 1 });
    const corrupt = valid.slice();
    corrupt[4] = (valid[4] ?? 0) ^ 0xff;

    // 実行
    const decoded = await pumpDecode(target, [corrupt]);

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
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const valid = await encodeFrame(target, { value: 1 });
    const corrupt = valid.slice();
    corrupt[4] = (valid[4] ?? 0) ^ 0xff;
    const input = concatBytes([await encodeFrame(target, 1), corrupt]);

    // 実行
    const decoded = await pumpDecode(target, [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(V8SerdeDecodeError);
    expect((error as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([1]);
  });

  test("エンコードできない値を流すと V8SerdeEncodeError で拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);

    // 実行
    const encoded = await pumpEncode(target, [1, () => {}, 3]);

    // 検証
    const error = encoded.writeError ?? encoded.readError;
    expect(error).toBeInstanceOf(V8SerdeEncodeError);
    expect((error as V8SerdeEncodeError).cause).toBeInstanceOf(Error);
    expect(encoded.outputChunks).toStrictEqual([await encodeFrame(target, 1)]);
  });

  test("読み取り側をキャンセルすると上流のソースもキャンセルされる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    let cancelled = false;
    const frame = await encodeFrame(target, 1);
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(frame);
      },
      cancel() {
        cancelled = true;
      },
    });
    const c = createDecodeStreamContext(source);
    await target.decodeStream(
      c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, unknown>,
      createNext(),
    );
    const destination = c.destination as ReadableStream<unknown>;
    const reader = destination.getReader();

    // 実行
    const first = await reader.read();
    await reader.cancel();
    // キャンセルは非同期に上流へ伝播するため、伝播の完了を待ちます。
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // 検証
    expect(first.value).toBe(1);
    expect(cancelled).toBe(true);
  });
});
