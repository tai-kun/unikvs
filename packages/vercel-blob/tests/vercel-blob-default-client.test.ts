import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { beforeEach, describe, test, vi } from "vitest";

const { mockPut, mockHead, mockDel, mockList } = vi.hoisted(() => ({
  mockPut: vi.fn<(pathname: string, body: unknown, options: unknown) => Promise<unknown>>(),
  mockHead: vi.fn<(pathname: string, options: unknown) => Promise<unknown>>(),
  mockDel: vi.fn<(pathname: string | readonly string[], options: unknown) => Promise<unknown>>(),
  mockList: vi.fn<(options: unknown) => Promise<unknown>>(),
}));

vi.mock("@vercel/blob", () => ({
  put: mockPut,
  head: mockHead,
  del: mockDel,
  list: mockList,
}));

import VercelBlob from "../src/vercel-blob.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("既定クライアントの委譲", () => {
  test("client 未指定のとき、put に委譲する", async ({ expect }) => {
    // 準備
    mockPut.mockResolvedValue({ url: "https://fake.blob/k", pathname: "k" });
    const storage = new VercelBlob({ token: "secret" });

    // 実行
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 検証
    expect(mockPut).toHaveBeenCalledOnce();
    const [pathname, body, options] = mockPut.mock.calls[0] as unknown as [
      string,
      ArrayBuffer,
      Record<string, unknown>,
    ];
    expect(pathname).toBe("k");
    expect(new Uint8Array(body)).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(options).toMatchObject({
      access: "private",
      allowOverwrite: true,
      token: "secret",
    });
  });

  test("keyPrefix と access が put に反映される", async ({ expect }) => {
    // 準備
    mockPut.mockResolvedValue({ url: "https://fake.blob/app/k", pathname: "app/k" });
    const storage = new VercelBlob({ keyPrefix: "app/", access: "public" });

    // 実行
    await storage.write(
      createSetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    const [pathname, , options] = mockPut.mock.calls[0] as unknown as [
      string,
      ArrayBuffer,
      Record<string, unknown>,
    ];
    expect(pathname).toBe("app/k");
    expect(options).toMatchObject({ access: "public", contentType: "application/octet-stream" });
    expect("token" in options).toBe(false);
  });

  test("client 未指定のとき、exists が head に委譲する", async ({ expect }) => {
    // 準備
    mockHead.mockResolvedValue({ url: "https://fake.blob/k", pathname: "k" });
    const storage = new VercelBlob({ token: "secret" });

    // 実行
    const result = await storage.exists(
      createHasContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(true);
    expect(mockHead).toHaveBeenCalledWith("k", {
      token: "secret",
      abortSignal: expect.any(AbortSignal),
    });
  });

  test("client 未指定のとき、delete が del に委譲する", async ({ expect }) => {
    // 準備
    mockDel.mockResolvedValue(undefined);
    const storage = new VercelBlob();

    // 実行
    await storage.delete(
      createDeleteContext("k", {
        signal: AbortSignal.timeout(5_000),
      }) as IStorage.DeleteContext,
    );

    // 検証
    expect(mockDel).toHaveBeenCalledWith("k", {
      token: undefined,
      abortSignal: expect.any(AbortSignal),
    });
  });

  test("client 未指定のとき、clear が list と del に委譲する", async ({ expect }) => {
    // 準備
    mockList.mockResolvedValue({
      blobs: [
        { url: "https://fake.blob/a", pathname: "a" },
        { url: "https://fake.blob/b", pathname: "b" },
      ],
      cursor: undefined,
      hasMore: false,
    });
    mockDel.mockResolvedValue(undefined);
    const storage = new VercelBlob({ keyPrefix: "pre:" });

    // 実行
    await storage.clear(
      createClearContext("", {
        signal: AbortSignal.timeout(5_000),
      }) as IStorage.ClearContext,
    );

    // 検証
    expect(mockList).toHaveBeenCalledWith({
      prefix: "pre:",
      cursor: undefined,
      token: undefined,
      abortSignal: expect.any(AbortSignal),
    });
    expect(mockDel).toHaveBeenCalledWith(["a", "b"], {
      token: undefined,
      abortSignal: expect.any(AbortSignal),
    });
  });

  test("client 未指定のとき、clear が頁をたどって del に委譲する", async ({ expect }) => {
    // 準備
    mockList
      .mockResolvedValueOnce({
        blobs: [{ url: "https://fake.blob/a", pathname: "a" }],
        cursor: "next",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        blobs: [{ url: "https://fake.blob/b", pathname: "b" }],
        cursor: undefined,
        hasMore: false,
      });
    mockDel.mockResolvedValue(undefined);
    const storage = new VercelBlob();

    // 実行
    await storage.clear(
      createClearContext("", {
        signal: AbortSignal.timeout(5_000),
      }) as IStorage.ClearContext,
    );

    // 検証
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList).toHaveBeenNthCalledWith(2, {
      prefix: "",
      cursor: "next",
      token: undefined,
      abortSignal: expect.any(AbortSignal),
    });
    expect(mockDel).toHaveBeenCalledWith(["a", "b"], {
      token: undefined,
      abortSignal: expect.any(AbortSignal),
    });
  });

  test("fetch 未指定のとき、globalThis.fetch でダウンロードする", async ({ expect }) => {
    // 準備
    mockHead.mockResolvedValue({ url: "https://fake.blob/k", pathname: "k" });
    let gotRequest: Request | undefined;
    const stubFetch = vi.fn<(request: Request) => Promise<Response>>(async (request) => {
      gotRequest = request;

      return new Response(new Uint8Array([9]), { status: 200 });
    });
    vi.stubGlobal("fetch", stubFetch);
    const storage = new VercelBlob({ token: "secret" });

    // 実行
    const result = await storage.read(
      createGetContext("k", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
    );

    // 検証
    expect(result).toStrictEqual(new Uint8Array([9]));
    expect(gotRequest?.url).toBe("https://fake.blob/k");
    expect(gotRequest?.headers.get("authorization")).toBe("Bearer secret");
  });
});
