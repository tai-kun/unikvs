import { afterEach, describe, test, vi } from "vitest";

import { HttpNetworkError, HttpResponseError } from "../src/errors.js";
import Http, { type IFetch } from "../src/http.js";
import {
  abortedSignal,
  captureRejection,
  createMockServer,
  errorResponse,
  fallbackResponse,
  rejectingFallbackResponse,
} from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("通信失敗の分類", () => {
  test("fetch が投げたとき、write は HttpNetworkError に包む", async ({ expect }) => {
    // 準備
    const cause = new TypeError("fetch failed");
    const failingFetch: IFetch = async () => {
      throw cause;
    };
    const storage = new Http(baseUrl, { fetch: failingFetch });

    // 実行
    const error = await captureRejection(
      storage.write({
        key: "k",
        data: new Uint8Array([1]),
        signal: AbortSignal.timeout(5_000),
        vars: {},
      }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpNetworkError);
    expect((error as HttpNetworkError).meta.method).toBe("PUT");
    expect((error as HttpNetworkError).meta.key).toBe("k");
    expect((error as HttpNetworkError).cause).toBe(cause);
  });

  test("fetch が投げたとき、read と delete は HttpNetworkError に包む", async ({ expect }) => {
    // 準備
    const failingFetch: IFetch = async () => {
      throw new TypeError("down");
    };
    const storage = new Http(baseUrl, { fetch: failingFetch });

    // 実行
    const readError = await captureRejection(
      storage.read({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );
    const deleteError = await captureRejection(
      storage.delete({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(readError).toBeInstanceOf(HttpNetworkError);
    expect((readError as HttpNetworkError).meta.method).toBe("GET");
    expect(deleteError).toBeInstanceOf(HttpNetworkError);
    expect((deleteError as HttpNetworkError).meta.method).toBe("DELETE");
  });

  test("fetch が投げたとき、clear は key なしの HttpNetworkError に包む", async ({ expect }) => {
    // 準備
    const failingFetch: IFetch = async () => {
      throw new TypeError("down");
    };
    const storage = new Http(baseUrl, { fetch: failingFetch });

    // 実行
    const error = await captureRejection(
      storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpNetworkError);
    expect((error as HttpNetworkError).meta).toStrictEqual({
      method: "DELETE",
      url: `${baseUrl}/?prefix=${encodeURIComponent("unikvs:")}`,
      key: undefined,
    });
  });

  test("fetch 注入なしでは globalThis.fetch を使う", async ({ expect }) => {
    // 準備
    const { fetch, calls } = createMockServer();
    vi.stubGlobal("fetch", fetch);
    const storage = new Http(baseUrl);

    // 実行
    await storage.write({
      key: "k",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(calls.length).toBe(1);
  });

  test("非 ok 応答のとき、method と url と status を報告する", async ({ expect }) => {
    // 準備
    const badFetch: IFetch = async () => errorResponse(500, "Internal Server Error");
    const storage = new Http(baseUrl, { fetch: badFetch });

    // 実行
    const error = await captureRejection(
      storage.write({
        key: "k",
        data: new Uint8Array([1]),
        signal: AbortSignal.timeout(5_000),
        vars: {},
      }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
    expect((error as HttpResponseError).meta).toStrictEqual({
      method: "PUT",
      url: `${baseUrl}/${encodeURIComponent("unikvs:k").replaceAll(".", "%2E")}`,
      status: 500,
      statusText: "Internal Server Error",
      key: "k",
    });
    expect((error as HttpResponseError).message).toBe(
      `Request PUT ${baseUrl}/${encodeURIComponent("unikvs:k").replaceAll(".", "%2E")} failed with 500 Internal Server Error`,
    );
  });

  test("statusText が空のとき、末尾空白なしで整形される", async ({ expect }) => {
    // 準備
    const badFetch: IFetch = async () => errorResponse(503, "");
    const storage = new Http(baseUrl, { fetch: badFetch });

    // 実行
    const error = await captureRejection(
      storage.read({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
    expect((error as HttpResponseError).message).toBe(
      `Request GET ${baseUrl}/${encodeURIComponent("unikvs:k").replaceAll(".", "%2E")} failed with 503`,
    );
  });

  test("PUT の 404 も HttpResponseError になる", async ({ expect }) => {
    // 準備
    const badFetch: IFetch = async () => errorResponse(404, "Not Found");
    const storage = new Http(baseUrl, { fetch: badFetch });

    // 実行
    const error = await captureRejection(
      storage.write({
        key: "k",
        data: new Uint8Array([1]),
        signal: AbortSignal.timeout(5_000),
        vars: {},
      }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
  });

  test("delete の 500 は HttpResponseError を投げる", async ({ expect }) => {
    // 準備
    const badFetch: IFetch = async () => errorResponse(500, "Internal Server Error");
    const storage = new Http(baseUrl, { fetch: badFetch });

    // 実行
    const error = await captureRejection(
      storage.delete({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
    expect((error as HttpResponseError).meta.method).toBe("DELETE");
  });

  test("getReadable の 500 は HttpResponseError を投げる", async ({ expect }) => {
    // 準備
    const badFetch: IFetch = async () => errorResponse(500, "Internal Server Error");
    const storage = new Http(baseUrl, { fetch: badFetch });

    // 実行
    const error = await captureRejection(
      storage.getReadable({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
    expect((error as HttpResponseError).meta.method).toBe("GET");
  });
});

describe("中断の透過", () => {
  test("進行中の中断は HttpNetworkError に包まず再送出する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const hangingFetch: IFetch = async (request: Request) => {
      controller.abort();
      request.signal.throwIfAborted();
      throw new Error("到達しないはずです");
    };
    const storage = new Http(baseUrl, { fetch: hangingFetch });

    // 実行
    const error = await captureRejection(
      storage.read({ key: "k", signal: controller.signal, vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(error).not.toBeInstanceOf(HttpNetworkError);
  });

  test("exists の HEAD 失敗時も中断は再送出する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const hangingFetch: IFetch = async (request: Request) => {
      controller.abort();
      request.signal.throwIfAborted();
      throw new Error("到達しないはずです");
    };
    const storage = new Http(baseUrl, { fetch: hangingFetch });

    // 実行
    const error = await captureRejection(
      storage.exists({ key: "k", signal: controller.signal, vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(error).not.toBeInstanceOf(HttpNetworkError);
  });

  test("exists フォールバック GET の失敗時も中断は再送出する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    let calls = 0;
    const flakyFetch: IFetch = async (request: Request) => {
      calls += 1;

      if (calls === 1) {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      controller.abort();
      request.signal.throwIfAborted();
      throw new Error("到達しないはずです");
    };
    const storage = new Http(baseUrl, { fetch: flakyFetch });

    // 実行
    const error = await captureRejection(
      storage.exists({ key: "k", signal: controller.signal, vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(error).not.toBeInstanceOf(HttpNetworkError);
  });

  test("delete の失敗時も中断は再送出する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const hangingFetch: IFetch = async (request: Request) => {
      controller.abort();
      request.signal.throwIfAborted();
      throw new Error("到達しないはずです");
    };
    const storage = new Http(baseUrl, { fetch: hangingFetch });

    // 実行
    const deleteError = await captureRejection(
      storage.delete({ key: "k", signal: controller.signal, vars: {} }),
    );

    // 検証
    expect(deleteError).toBeInstanceOf(DOMException);
    expect(deleteError).not.toBeInstanceOf(HttpNetworkError);
  });

  test("clear の失敗時も中断は再送出する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const hangingFetch: IFetch = async (request: Request) => {
      controller.abort();
      request.signal.throwIfAborted();
      throw new Error("到達しないはずです");
    };
    const storage = new Http(baseUrl, { fetch: hangingFetch });

    // 実行
    const error = await captureRejection(storage.clear({ signal: controller.signal, vars: {} }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(error).not.toBeInstanceOf(HttpNetworkError);
  });

  test("getReadable の失敗時も中断は再送出する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const hangingFetch: IFetch = async (request: Request) => {
      controller.abort();
      request.signal.throwIfAborted();
      throw new Error("到達しないはずです");
    };
    const storage = new Http(baseUrl, { fetch: hangingFetch });

    // 実行
    const error = await captureRejection(
      storage.getReadable({ key: "k", signal: controller.signal, vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(error).not.toBeInstanceOf(HttpNetworkError);
  });

  test("getWritable の close 失敗時も中断は再送出する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const hangingFetch: IFetch = async (request: Request) => {
      controller.abort();
      request.signal.throwIfAborted();
      throw new Error("到達しないはずです");
    };
    const storage = new Http(baseUrl, { fetch: hangingFetch });
    const writer = storage
      .getWritable({ key: "k", signal: controller.signal, vars: {} })
      .getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行
    const error = await captureRejection(writer.close());

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(error).not.toBeInstanceOf(HttpNetworkError);
  });

  test("getWritable の close 失敗時は中断なしなら HttpNetworkError に包む", async ({ expect }) => {
    // 準備
    const failingFetch: IFetch = async () => {
      throw new TypeError("down");
    };
    const storage = new Http(baseUrl, { fetch: failingFetch });
    const writer = storage
      .getWritable({
        key: "k",
        signal: AbortSignal.timeout(5_000),
        vars: {},
      })
      .getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行
    const error = await captureRejection(writer.close());

    // 検証
    expect(error).toBeInstanceOf(HttpNetworkError);
    expect((error as HttpNetworkError).meta.method).toBe("PUT");
  });

  test("getWritable の close 非 ok 時は HttpResponseError を投げる", async ({ expect }) => {
    // 準備
    const badFetch: IFetch = async () => errorResponse(500, "Internal Server Error");
    const storage = new Http(baseUrl, { fetch: badFetch });
    const writer = storage
      .getWritable({
        key: "k",
        signal: AbortSignal.timeout(5_000),
        vars: {},
      })
      .getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行
    const error = await captureRejection(writer.close());

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
  });

  test("中断済みシグナルでは fetch を呼ばず中断例外を投げる", async ({ expect }) => {
    // 準備
    let called = 0;
    const countingFetch: IFetch = async () => {
      called += 1;

      return new Response(null, { status: 200, statusText: "OK" });
    };
    const storage = new Http(baseUrl, { fetch: countingFetch });

    // 実行
    const error = await captureRejection(
      storage.write({
        key: "k",
        data: new Uint8Array([1]),
        signal: abortedSignal(),
        vars: {},
      }),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(called).toBe(0);
  });
});

describe("exists のフォールバック", () => {
  test("HEAD 405 では GET にフォールバックして true を返す", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer({ headNotSupported: true });
    const storage = new Http(baseUrl, { fetch });
    await storage.write({
      key: "k",
      data: new Uint8Array([1, 2, 3]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 実行
    const result = await storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(result).toBe(true);
  });

  test("HEAD 501 では GET にフォールバックする", async ({ expect }) => {
    // 準備
    let headCalls = 0;
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        headCalls += 1;

        return new Response(null, { status: 501, statusText: "Not Implemented" });
      }

      return new Response(new Uint8Array([1]), { status: 206, statusText: "Partial Content" });
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const result = await storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(result).toBe(true);
    expect(headCalls).toBe(1);
  });

  test("フォールバック GET の 206 でも true を返す", async ({ expect }) => {
    // 準備
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      return fallbackResponse(206);
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const result = await storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(result).toBe(true);
  });

  test("フォールバック GET の 404 と 410 は false を返す", async ({ expect }) => {
    // 準備と実行と検証
    for (const status of [404, 410]) {
      const fetch: IFetch = async (request: Request) => {
        if (request.method === "HEAD") {
          return new Response(null, { status: 405, statusText: "Method Not Allowed" });
        }

        return fallbackResponse(status);
      };
      const storage = new Http(baseUrl, { fetch });
      const result = await storage.exists({
        key: "k",
        signal: AbortSignal.timeout(5_000),
        vars: {},
      });
      expect(result).toBe(false);
    }
  });

  test("HEAD 403 ではフォールバックせず HttpResponseError を投げる", async ({ expect }) => {
    // 準備
    let getCalls = 0;
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        return new Response(null, { status: 403, statusText: "Forbidden" });
      }

      getCalls += 1;

      return new Response(null, { status: 200, statusText: "OK" });
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
    expect((error as HttpResponseError).meta.method).toBe("HEAD");
    expect(getCalls).toBe(0);
  });

  test("フォールバック GET の 500 は HttpResponseError を投げる", async ({ expect }) => {
    // 準備
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      return fallbackResponse(500);
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(HttpResponseError);
    expect((error as HttpResponseError).meta.method).toBe("GET");
  });

  test("フォールバックではボディを破棄してから判定する", async ({ expect }) => {
    // 準備
    let canceled = false;
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      return fallbackResponse(200, () => {
        canceled = true;
      });
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const result = await storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(result).toBe(true);
    expect(canceled).toBe(true);
  });

  test("body が null でもフォールバックは成功する", async ({ expect }) => {
    // 準備
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      return fallbackResponse(200, undefined, true);
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const result = await storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(result).toBe(true);
  });

  test("cancel が拒否したとき、そのエラーをそのまま伝播する", async ({ expect }) => {
    // 準備
    const cause = new Error("cancel failed");
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      return rejectingFallbackResponse(200, cause);
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBe(cause);
  });

  test("非 2xx 送出前の cancel 失敗は cancel 由来エラーを投げる", async ({ expect }) => {
    // 準備
    const cause = new Error("cancel failed");
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      return rejectingFallbackResponse(500, cause);
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBe(cause);
  });

  test("404 判定前の cancel 失敗も cancel 由来エラーを投げる", async ({ expect }) => {
    // 準備
    const cause = new Error("cancel failed");
    const fetch: IFetch = async (request: Request) => {
      if (request.method === "HEAD") {
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
      }

      return rejectingFallbackResponse(404, cause);
    };
    const storage = new Http(baseUrl, { fetch });

    // 実行
    const error = await captureRejection(
      storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBe(cause);
  });

  test("HEAD の 404 と 410 は false を返す", async ({ expect }) => {
    // 準備と実行と検証
    for (const status of [404, 410]) {
      const fetch: IFetch = async () => new Response(null, { status, statusText: "Missing" });
      const storage = new Http(baseUrl, { fetch });
      const result = await storage.exists({
        key: "k",
        signal: AbortSignal.timeout(5_000),
        vars: {},
      });
      expect(result).toBe(false);
    }
  });
});
