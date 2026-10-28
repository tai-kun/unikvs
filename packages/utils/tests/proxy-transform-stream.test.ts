import { readAll } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import proxyTransformStream from "../src/proxy-transform-stream.js";

/**
 * 読み取りと書き込みが連動しないソースを作ります。
 *
 * @param initialChunks 読み取り側に最初から積んでおくチャンクです。
 */
function createIndependentSource<T>(initialChunks: readonly T[] = []): {
  readable: ReadableStream<T>;
  writable: WritableStream<T>;
} {
  let controller!: ReadableStreamDefaultController<T>;

  return {
    readable: new ReadableStream<T>({
      start(readableController): void {
        controller = readableController;

        for (const chunk of initialChunks) {
          readableController.enqueue(chunk);
        }
      },
    }),
    writable: new WritableStream<T>({
      close(): void {
        controller.close();
      },
      write(chunk): void {
        controller.enqueue(chunk);
      },
    }),
  };
}

describe("proxyTransformStream", () => {
  test("関数形式の変換で入力から出力まで透過する", async ({ expect }) => {
    // 準備：
    const source = new TransformStream<string, string>({
      transform(chunk, controller): void {
        controller.enqueue(chunk.toUpperCase());
      },
    });
    const proxied = proxyTransformStream<string, string, number, number>(
      source,
      (chunk, controller): void => {
        controller.enqueue(String(chunk));
      },
      (chunk, controller): void => {
        controller.enqueue(chunk.length);
      },
    );
    // 読み取りを先に開始し、pipeTo の背圧デッドロックを避ける。
    const valuesPromise = readAll(proxied.readable);
    const writer = proxied.writable.getWriter();

    // 実行：
    await writer.write(1);
    await writer.write(22);
    await writer.write(333);
    await writer.close();
    await proxied.closePromise;

    // 検証：
    expect(await valuesPromise).toStrictEqual([1, 2, 3]);
    expect(proxied.closePromise.status).toBe("fulfilled");
  });

  test("オブジェクト形式の変換で入力から出力まで透過する", async ({ expect }) => {
    // 準備：
    const source = new TransformStream<number, number>({
      transform(chunk, controller): void {
        controller.enqueue(chunk * 2);
      },
    });
    const proxied = proxyTransformStream<number, number, number, number>(
      source,
      {
        transform(chunk, controller): void {
          controller.enqueue(chunk + 1);
        },
      },
      {
        transform(chunk, controller): void {
          controller.enqueue(chunk + 100);
        },
      },
    );
    // 読み取りを先に開始し、pipeTo の背圧デッドロックを避ける。
    const valuesPromise = readAll(proxied.readable);
    const writer = proxied.writable.getWriter();

    // 実行：
    await writer.write(1);
    await writer.write(2);
    await writer.close();
    await proxied.closePromise;

    // 検証：
    expect(await valuesPromise).toStrictEqual([104, 106]);
  });

  test("何も書き込まずに閉じても closePromise が解決する", async ({ expect }) => {
    // 準備：
    const source = new TransformStream<string, string>({
      transform(chunk, controller): void {
        controller.enqueue(chunk);
      },
    });
    const proxied = proxyTransformStream<string, string, string, string>(
      source,
      (chunk, controller): void => {
        controller.enqueue(chunk);
      },
      (chunk, controller): void => {
        controller.enqueue(chunk);
      },
    );
    // 読み取りを先に開始し、pipeTo の背圧デッドロックを避ける。
    const valuesPromise = readAll(proxied.readable);

    // 実行：
    await proxied.writable.close();
    await proxied.closePromise;

    // 検証：
    expect(await valuesPromise).toStrictEqual([]);
    await expect(proxied.closePromise.toPromise()).resolves.toBe(undefined);
  });

  test("出力変換の flush が失敗したら読み取りと closePromise へ伝える", async ({ expect }) => {
    // 準備：
    const source = new TransformStream<string, string>({
      transform(chunk, controller): void {
        controller.enqueue(chunk);
      },
    });
    const proxied = proxyTransformStream<string, string, string, string>(
      source,
      (chunk, controller): void => {
        controller.enqueue(chunk);
      },
      {
        flush(): void {
          throw new Error("output flush boom");
        },
        transform(chunk, controller): void {
          controller.enqueue(chunk);
        },
      },
    );
    const valuesPromise = readAll(proxied.readable);
    // 読み取りの拒否を先に監視し、未処理の拒否を発生させない。
    const valuesExpectation = expect(valuesPromise).rejects.toThrow("output flush boom");
    const writer = proxied.writable.getWriter();

    // 実行：
    await writer.write("data");
    await writer.close().catch(() => {});

    // 検証：
    await valuesExpectation;
    await expect(proxied.closePromise.toPromise()).rejects.toThrow("output flush boom");
  });

  test("出力変換の flush が完了するまで closePromise は解決しない", async ({ expect }) => {
    // 準備：
    let notifyFlushStarted!: () => void;
    const flushStarted = new Promise<void>((resolve) => {
      notifyFlushStarted = resolve;
    });
    let releaseFlush!: () => void;
    const flushFinished = new Promise<void>((resolve) => {
      releaseFlush = resolve;
    });
    // 入力側の接続が出力側の flush より先に完了することを保証するため、ソースの読み取りと書き込みを直接制御する。
    let sourceController!: ReadableStreamDefaultController<string>;
    const source = {
      readable: new ReadableStream<string>({
        start(controller): void {
          sourceController = controller;
        },
      }),
      writable: new WritableStream<string>({
        close(): void {
          sourceController.close();
        },
        write(chunk): void {
          sourceController.enqueue(chunk);
        },
      }),
    };
    const proxied = proxyTransformStream<string, string, string, string>(
      source,
      (chunk, controller): void => {
        controller.enqueue(chunk);
      },
      {
        async flush(): Promise<void> {
          notifyFlushStarted();
          await flushFinished;
        },
        transform(chunk, controller): void {
          controller.enqueue(chunk);
        },
      },
    );
    const valuesPromise = readAll(proxied.readable);
    const writer = proxied.writable.getWriter();

    // 実行：
    await writer.write("data");
    await writer.close();
    await flushStarted;
    // 入力側の接続が完了していれば closePromise は解決済みになるため、未処理のマイクロタスクを消化してから状態を確認する。
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    // 検証：
    expect(proxied.closePromise.status).toBe("pending");

    releaseFlush();
    await proxied.closePromise;
    expect(await valuesPromise).toStrictEqual(["data"]);
  });

  test("出力変換の途中の失敗を読み取りと closePromise へ伝える", async ({ expect }) => {
    // 準備：
    // ソースの読み取りと書き込みを独立させ、出力側の失敗が入力側の接続へ伝播しないようにする。
    const source = createIndependentSource<string>();
    const proxied = proxyTransformStream<string, string, string, string>(
      source,
      (chunk, controller): void => {
        controller.enqueue(chunk);
      },
      (chunk, controller): void => {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (chunk === "bad") {
          throw new Error("output boom");
        }

        controller.enqueue(chunk);
      },
    );
    const reader = proxied.readable.getReader();
    const writer = proxied.writable.getWriter();
    const readOnce = reader.read();

    // 実行：
    await writer.write("bad").catch(() => {});
    await writer.close().catch(() => {});

    // 検証：
    await expect(readOnce).rejects.toThrow("output boom");
    await expect(proxied.closePromise.toPromise()).rejects.toThrow("output boom");
    reader.releaseLock();
  });

  test("入力変換の失敗は出力側の背圧を待たずに closePromise を拒否する", async ({ expect }) => {
    // 準備：
    // 先頭のチャンクだけ読み取り、残りを読まないことで、ソースから出力への書き込みを背圧で停止させます。
    const source = createIndependentSource(["fill-1", "fill-2", "fill-3"]);
    const proxied = proxyTransformStream<string, string, string, string>(
      source,
      (chunk, controller): void => {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (chunk === "bad") {
          throw new Error("input boom");
        }

        controller.enqueue(chunk);
      },
      (chunk, controller): void => {
        controller.enqueue(chunk);
      },
    );
    const reader = proxied.readable.getReader();
    const writer = proxied.writable.getWriter();
    const firstChunk = await reader.read();
    expect(firstChunk.value).toBe("fill-1");
    // 後続の書き込みが背圧で停止するのを待ちます。
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    // 実行：
    await writer.write("bad").catch(() => {});

    // 検証：
    await expect(proxied.closePromise.toPromise()).rejects.toThrow("input boom");
    reader.releaseLock();
  });

  test("ソースの失敗を読み取りと closePromise へ伝える", async ({ expect }) => {
    // 準備：
    const source = new TransformStream<string, string>({
      transform(chunk, controller): void {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (chunk === "bad") {
          throw new Error("source boom");
        }

        controller.enqueue(chunk);
      },
    });
    const proxied = proxyTransformStream<string, string, string, string>(
      source,
      (chunk, controller): void => {
        controller.enqueue(chunk);
      },
      (chunk, controller): void => {
        controller.enqueue(chunk);
      },
    );
    const reader = proxied.readable.getReader();
    const writer = proxied.writable.getWriter();
    const readOnce = reader.read();

    // 実行：
    await writer.write("bad").catch(() => {});

    // 検証：
    await expect(readOnce).rejects.toThrow("source boom");
    await expect(proxied.closePromise.toPromise()).rejects.toThrow("source boom");
    reader.releaseLock();
  });
});
