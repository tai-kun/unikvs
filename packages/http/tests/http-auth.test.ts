import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { InvalidTokenError, InvalidHeadersError } from "../src/errors.js";
import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";
describe("トークンとヘッダーの解決", () => {
  test("token を渡したとき、Bearer ヘッダーが自動付与される", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, {
      fetch,
      token: "secret",
    });

    // 実行：
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(calls[0]?.headers["authorization"]).toBe("Bearer secret");
  });

  test("token がないとき、Authorization は付与されない", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    await storage
      .read(createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext)
      .catch(() => {});

    // 検証：
    expect(calls[0]?.headers["authorization"]).toBe(undefined);
  });

  test("token と独自ヘッダーが共存したとき、両方が送信される", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, {
      fetch,
      token: "secret",
      headers: { "X-App": "mine" },
    });

    // 実行：
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(calls[0]?.headers["x-app"]).toBe("mine");
    expect(calls[0]?.headers["authorization"]).toBe("Bearer secret");
  });

  test("明示 Authorization があるとき、token は沈黙無視される", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, {
      fetch,
      token: "secret",
      headers: { Authorization: "Custom xyz" },
    });

    // 実行：
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(calls[0]?.headers["authorization"]).toBe("Custom xyz");
  });

  test("小文字 authorization でも明示扱いになる", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, {
      fetch,
      token: "secret",
      headers: { authorization: "Custom xyz" },
    });

    // 実行：
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(calls[0]?.headers["authorization"]).toBe("Custom xyz");
    expect(calls[0]?.headers["Authorization"]).toBe(undefined);
  });

  test("固有 vars が共通 vars より優先される", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, {
      fetch,
      headers: { "X-Base": "base" },
    });

    // 実行：
    await storage
      .read(
        createGetContext("k", {
          signal: AbortSignal.timeout(5000),
          values: {
            "@unikvs/http:headers": { "X-Both": "specific" },
            "@unikvs/fetch:headers": {
              "X-Both": "common",
              "X-Common": "common",
            },
          },
        }) as IStorage.ReadContext,
      )
      .catch(() => {});

    // 検証：
    expect(calls[0]?.headers["x-base"]).toBe("base");
    expect(calls[0]?.headers["x-common"]).toBe("common");
    expect(calls[0]?.headers["x-both"]).toBe("specific");
  });

  test("トークンは固有・共通・既定の順で解決される", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, {
      fetch,
      token: "base",
    });

    // 実行：
    await storage
      .read(
        createGetContext("a", {
          signal: AbortSignal.timeout(5000),
          values: { "@unikvs/fetch:token": "common" },
        }) as IStorage.ReadContext,
      )
      .catch(() => {});
    await storage
      .read(
        createGetContext("b", {
          signal: AbortSignal.timeout(5000),
          values: {
            "@unikvs/http:token": "specific",
            "@unikvs/fetch:token": "common",
          },
        }) as IStorage.ReadContext,
      )
      .catch(() => {});
    await storage
      .read(createGetContext("c", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext)
      .catch(() => {});

    // 検証：
    expect(calls[0]?.headers["authorization"]).toBe("Bearer common");
    expect(calls[1]?.headers["authorization"]).toBe("Bearer specific");
    expect(calls[2]?.headers["authorization"]).toBe("Bearer base");
  });

  test("共通 vars のみで cross-talk なく認証できる", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    await storage
      .read(
        createGetContext("k", {
          signal: AbortSignal.timeout(5000),
          values: { "@unikvs/fetch:token": "shared" },
        }) as IStorage.ReadContext,
      )
      .catch(() => {});

    // 検証：
    expect(calls[0]?.headers["authorization"]).toBe("Bearer shared");
  });

  test("固有 vars で共通値を上書き隔離できる", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    await storage
      .read(
        createGetContext("k", {
          signal: AbortSignal.timeout(5000),
          values: {
            "@unikvs/http:headers": { "X-App": "isolated" },
            "@unikvs/fetch:headers": { "X-App": "shared" },
          },
        }) as IStorage.ReadContext,
      )
      .catch(() => {});

    // 検証：
    expect(calls[0]?.headers["x-app"]).toBe("isolated");
  });

  test("baseUrl と keyPrefix と fetch の vars 上書きは読み取らない", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    await storage.write(
      createSetContext("k", {
        signal: AbortSignal.timeout(5000),
        values: {
          "@unikvs/http:fetch": "not-a-fetch",
          "@unikvs/http:baseUrl": "https://evil.example.com",
          "@unikvs/http:keyPrefix": "evil:",
        },
      }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(calls[0]?.url).toBe(`${baseUrl}/${encodeURIComponent("unikvs:k")}`);
  });

  test("PUT では利用者指定の Content-Type より octet-stream が優先される", async ({ expect }) => {
    // 準備：
    const { calls, fetch } = createMockServer();
    const storage = new Http(baseUrl, {
      fetch,
      headers: { "Content-Type": "text/plain" },
    });

    // 実行：
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(calls[0]?.headers["content-type"]).toBe("application/octet-stream");
  });

  test("exists フォールバックでは利用者指定の Range より bytes=0-0 が優先される", async ({
    expect,
  }) => {
    // 準備：
    const { calls, fetch } = createMockServer({ headNotSupported: true });
    const storage = new Http(baseUrl, {
      fetch,
      headers: { Range: "bytes=5-10" },
    });

    // 実行：
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    const result = await storage.exists(
      createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(result).toBe(true);

    expect(calls.at(-1)?.headers["range"]).toBe("bytes=0-0");
  });
});
describe("認証値の検証", () => {
  test("空文字トークンは InvalidTokenError を投げる", ({ expect }) => {
    // 実行と検証：
    expect(() => new Http(baseUrl, { token: "" })).toThrow(InvalidTokenError);
  });

  test("非文字列トークンは InvalidTokenError を投げる", ({ expect }) => {
    // 実行と検証：
    expect(() => new Http(baseUrl, { token: 42 as unknown as string })).toThrow(InvalidTokenError);
  });

  test("非文字列値を含む headers は InvalidHeadersError を投げる", ({ expect }) => {
    // 実行と検証：
    expect(
      () => new Http(baseUrl, { headers: { "X-A": 42 } as unknown as Record<string, string> }),
    ).toThrow(InvalidHeadersError);
    expect(() => new Http(baseUrl, { headers: "x" as unknown as Record<string, string> })).toThrow(
      InvalidHeadersError,
    );
    expect(() => new Http(baseUrl, { headers: null as unknown as Record<string, string> })).toThrow(
      InvalidHeadersError,
    );
    expect(
      () => new Http(baseUrl, { headers: [["X-A", "b"]] as unknown as Record<string, string> }),
    ).toThrow(InvalidHeadersError);
  });

  test("vars の不正 headers は InvalidHeadersError を投げる", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", {
          signal: AbortSignal.timeout(5000),
          values: { "@unikvs/http:headers": { "X-A": 42 } },
        }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(InvalidHeadersError);
  });

  test("vars の空文字トークンは InvalidTokenError を投げる", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", {
          signal: AbortSignal.timeout(5000),
          values: { "@unikvs/http:token": "" },
        }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(InvalidTokenError);
  });

  test("vars の非文字列トークンは InvalidTokenError を投げる", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("k", {
          signal: AbortSignal.timeout(5000),
          values: { "@unikvs/fetch:token": 42 },
        }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(InvalidTokenError);
  });
});
