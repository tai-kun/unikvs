import { describe, test } from "vitest";

import TestContainer from "../src/test-container.js";

describe("TestContainer の設定", () => {
  test("イメージ名を指定してインスタンスを作成できる", ({ expect }) => {
    // 実行
    const container = new TestContainer("busybox:latest");

    // 検証
    expect(container).toBeInstanceOf(TestContainer);
  });

  test("withExposedPorts はインスタンス自身を返す", ({ expect }) => {
    // 準備
    const container = new TestContainer("nginx:alpine");

    // 実行
    const result = container.withExposedPorts(80);

    // 検証
    expect(result).toBe(container);
  });
});

describe("コンテナの起動と終了", () => {
  test("コンテナを起動したとき、StartedContainer インスタンスが返る", async ({ expect }) => {
    // 実行
    await using container = await new TestContainer("busybox:latest").start();

    // 検証
    expect(container).toBeDefined();
  });

  test("ポートを公開してコンテナを起動したとき、正しいマッピングを取得できる", async ({
    expect,
  }) => {
    // 準備
    const container = new TestContainer("nginx:alpine").withExposedPorts(80);

    // 実行
    await using started = await container.start();
    const host = started.getHost();
    const mappedPort = started.getMappedPort(80);

    // 検証
    expect(host).toBe("127.0.0.1");
    expect(mappedPort).toBeTypeOf("number");
    expect(mappedPort).toBeGreaterThan(0);
  });

  test("dispose を呼び出すとコンテナが停止する", async ({ expect }) => {
    // 準備
    const started = await new TestContainer("busybox:latest").start();

    // 実行
    await started.dispose();

    // 検証
    // dispose がエラーなく完了すれば成功
    expect(true).toBe(true);
  });
});

describe("StartedContainer の操作", () => {
  test("getHost は 127.0.0.1 を返す", async ({ expect }) => {
    // 実行
    await using container = await new TestContainer("busybox:latest").start();

    // 検証
    expect(container.getHost()).toBe("127.0.0.1");
  });

  test("公開していないポートを指定して getMappedPort を呼び出すとエラーになる", async ({
    expect,
  }) => {
    // 準備
    await using container = await new TestContainer("busybox:latest").start();

    // 実行と検証
    expect(() => container.getMappedPort(9999)).toThrow("ポート 9999 は公開されていません");
  });
});

describe("異常系", () => {
  test("存在しないイメージを指定して start を呼び出すとエラーになる", async ({ expect }) => {
    // 準備
    const container = new TestContainer("unknown-image-for-testing:latest");

    // 実行と検証
    await expect(container.start()).rejects.toThrow();
  });
});
