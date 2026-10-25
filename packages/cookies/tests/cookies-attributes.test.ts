import type { IStorage } from "@unikvs/core";
import { createSetContext, createClearContext, createDeleteContext } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Cookies from "../src/cookies.js";
import { createFakeCookieStore } from "./_helpers.js";

const { signal } = new AbortController();
describe("属性の引き渡し", () => {
  test("write は cookieAttributes を添えて保存する", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const storage = new Cookies({
      store,
      cookieAttributes: {
        path: "/",
        maxAge: 3600,
        secure: true,
        sameSite: "Lax",
      },
    });

    // 実行：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 検証：
    expect(store.setCalls).toHaveLength(1);
    expect(store.setCalls[0]?.attributes).toEqual({
      path: "/",
      maxAge: 3600,
      secure: true,
      sameSite: "Lax",
    });
  });

  test("属性を指定しない write は空の属性で保存する", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const storage = new Cookies({ store });

    // 実行：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 検証：
    expect(store.setCalls[0]?.attributes).toEqual({});
  });

  test("delete は同じ属性を添えて失効させる", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const attributes = {
      path: "/",
      domain: "example.com",
      secure: true,
      sameSite: "Strict" as const,
    };
    const storage = new Cookies({
      store,
      cookieAttributes: attributes,
    });
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 検証：
    expect(store.deleteCalls).toHaveLength(1);
    expect(store.deleteCalls[0]?.attributes).toEqual(attributes);
  });

  test("clear はすべてのキーを同じ属性で失効させる", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const attributes = {
      path: "/",
      maxAge: 3600,
      sameSite: "Lax" as const,
    };
    const storage = new Cookies({
      store,
      cookieAttributes: attributes,
    });
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行：
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(store.deleteCalls.map((call) => call.name).sort()).toEqual(["k1", "k2"]);

    for (const call of store.deleteCalls) {
      expect(call.attributes).toEqual(attributes);
    }
  });
});
