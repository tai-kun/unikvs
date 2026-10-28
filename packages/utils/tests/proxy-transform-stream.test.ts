import { readAll } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import proxyTransformStream from "../src/proxy-transform-stream.js";

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
