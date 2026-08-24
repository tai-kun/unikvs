import { exec } from "node:child_process";
import { promisify } from "node:util";

import { describe, test } from "vitest";

import TestContainer from "../src/test-container.js";

const execAsync = promisify(exec);

async function runningBusyboxIds(): Promise<string[]> {
  const { stdout } = await execAsync("docker ps -q --filter ancestor=busybox:latest");
  return stdout.trim().split("\n").filter(Boolean);
}

describe("TestContainer の設定", () => {
  test("イメージ名を指定してインスタンスを作成できる", ({ expect }) => {
    // 実行
    const container = new TestContainer("busybox:latest");

    // 検証
    expect(container).toBeInstanceOf(TestContainer);
  });

  test("withExposedPorts はメソッドチェーンできるように自分自身を返す", ({ expect }) => {
    // 準備
    const container = new TestContainer("nginx:alpine");

    // 実行
    const result = container.withExposedPorts(80);

    // 検証
    expect(result).toBe(container);
  });
});

describe("コンテナーの起動と停止", () => {
  test("起動したコンテナーのホストアドレスは 127.0.0.1", async ({ expect }) => {
    // 実行
    await using container = await new TestContainer("busybox:latest").start();

    // 検証
    expect(container.getHost()).toBe("127.0.0.1");
  });

  test("公開したポートに対応するホスト側のポート番号を取得できる", async ({ expect }) => {
    // 準備
    const container = new TestContainer("nginx:alpine").withExposedPorts(80);

    // 実行
    await using started = await container.start();
    const mappedPort = started.getMappedPort(80);

    // 検証: ホスト側ポートはエフェメラルポートの範囲内に確保される
    expect(mappedPort).toBeTypeOf("number");
    expect(mappedPort).toBeGreaterThanOrEqual(1024);
    expect(mappedPort).toBeLessThanOrEqual(65535);
  });

  test("公開していないポートを指定して getMappedPort を呼び出すとエラーになる", async ({
    expect,
  }) => {
    // 準備
    await using container = await new TestContainer("busybox:latest").start();

    // 実行と検証
    expect(() => container.getMappedPort(9999)).toThrow("ポート 9999 は公開されていません");
  });

  test("dispose を呼び出すと起動したコンテナーが停止する", async ({ expect }) => {
    // 準備: 他の busybox コンテナーと区別できるように、起動前の状態を記録する
    const before = new Set(await runningBusyboxIds());
    const started = await new TestContainer("busybox:latest").start();
    const currentIds = await runningBusyboxIds();
    const ours = currentIds.filter((id) => !before.has(id));

    // 検証: 今回起動したコンテナーを一意に特定できる
    expect(ours).toHaveLength(1);
    const containerId = ours[0]!;

    // 実行
    await started.dispose();

    // 検証: 起動したコンテナーが停止・削除されている
    const after = await runningBusyboxIds();
    expect(after).not.toContain(containerId);
  });

  test("複数回 dispose を呼び出してもエラーにならない", async ({ expect }) => {
    // 準備
    const started = await new TestContainer("busybox:latest").start();
    await started.dispose();

    // 実行と検証: 停止済みコンテナーへの再停止や、解放済みポートの再解放でも失敗しない
    await expect(started.dispose()).resolves.toBeUndefined();
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
