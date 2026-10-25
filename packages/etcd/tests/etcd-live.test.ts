import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createSetContext,
  createOpenContext,
  createCloseContext,
} from "@unikvs/testing";
import { test, expect, describe } from "vite-plus/test";

import Etcd from "../src/etcd.js";

const endpoints = process.env["ETCD_ENDPOINTS"];
const live = endpoints === undefined || endpoints === "" ? describe.skip : describe;
live("etcd 実サーバー", () => {
  test("書き込みと読み取りが往復する", async () => {
    const keyPrefix = `unikvs-live-${crypto.randomUUID()}:`;
    const storage = new Etcd({
      endpoints,
      keyPrefix,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const signal = new AbortController().signal;
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.write(createSetContext("live.bin", { signal }) as IStorage.WriteContext, data);
      await expect(
        storage.read(createGetContext("live.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);
    } finally {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (storage.isOpen) {
        await storage.close(createCloseContext() as IStorage.CloseContext);
      }
    }
  }, 30e3);
});
