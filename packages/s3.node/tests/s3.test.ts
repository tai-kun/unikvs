import { S3Client, CreateBucketCommand, type S3ClientConfig } from "@aws-sdk/client-s3";
import { GenericContainer } from "testcontainers";
import { describe, test as vitest } from "vitest";

import S3 from "../src/s3.js";

// oxlint-disable-next-line jest/expect-expect jest/no-disabled-tests
const test = vitest.extend<{
  storage: S3;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const rustfsVersion = process.env["_RUSTFS_VERSION"] ?? "1.0.0-alpha.98";
    const container = await new GenericContainer("rustfs/rustfs:" + rustfsVersion)
      .withExposedPorts(9000)
      .start();
    const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
    const config: S3ClientConfig = {
      endpoint,
      region: "ap-northeast-1",
      credentials: {
        accessKeyId: "rustfsadmin",
        secretAccessKey: "rustfsadmin",
      },
      forcePathStyle: true,
    };
    const client = new S3Client(config);
    const bucket = "test-bucket";
    await client.send(
      new CreateBucketCommand({
        Bucket: bucket,
        CreateBucketConfiguration: {
          LocationConstraint: "ap-northeast-1",
        },
      }),
    );
    client.destroy();

    const storage = new S3(bucket, config);

    await use(storage);

    if (storage.isOpen) {
      storage.close();
    }

    await container.stop();
  },
});

describe("ライフサイクル管理", () => {
  test("インスタンス化した直後は、isOpen が false である", ({ expect, storage }) => {
    // Arrange & Act は constructor で完了している。

    // Assert
    expect(storage.isOpen).toBe(false);
  });

  test("open を呼び出すと、isOpen が true になる", ({ expect, storage }) => {
    // Act
    storage.open();

    // Assert
    expect(storage.isOpen).toBe(true);
  });

  test("close を呼び出すと、isOpen が false に戻る", ({ expect, storage }) => {
    // Arrange
    storage.open();

    // Act
    storage.close();

    // Assert
    expect(storage.isOpen).toBe(false);
  });
});

describe("基本データ操作 (CRUD)", () => {
  test("データを書き込んだとき、正常に保存される", async ({ expect, storage, signal }) => {
    // Arrange
    const key = "test.txt";
    const data = new TextEncoder().encode("Hello S3");
    storage.open();

    // Act
    await storage.write({ key, data, signal });

    // Assert
    const exists = await storage.exists({ key, signal });
    expect(exists).toBe(true);
  });

  test("データを読み込んだとき、保存したデータと一致する Uint8Array が返る", async ({
    expect,
    storage,
    signal,
  }) => {
    // Arrange
    const key = "read-test.txt";
    const expectedData = new TextEncoder().encode("Read Content");
    storage.open();
    await storage.write({ key, data: expectedData, signal });

    // Act
    const result = await storage.read({ key, signal });

    // Assert
    expect(result).toStrictEqual(expectedData);
  });

  test("存在しないキーを確認したとき、false が返る", async ({ expect, storage, signal }) => {
    // Arrange
    const key = "non-existent.txt";
    storage.open();

    // Act
    const result = await storage.exists({ key, signal });

    // Assert
    expect(result).toBe(false);
  });

  test("オブジェクトを削除したとき、以降は存在確認が false になる", async ({
    expect,
    storage,
    signal,
  }) => {
    // Arrange
    const key = "delete-test.txt";
    storage.open();
    await storage.write({ key, data: new Uint8Array([1, 2, 3]), signal });

    // Act
    await storage.delete({ key, signal });

    // Assert
    const exists = await storage.exists({ key, signal });
    expect(exists).toBe(false);
  });
});

describe("ストリーム操作", () => {
  test("書き込みストリームを使用してデータを保存したとき、その内容を読み取ることができる", async ({
    expect,
    storage,
    signal,
  }) => {
    // Arrange
    const key = "stream-write.dat";
    const data = new Uint8Array([10, 20, 30]);
    storage.open();
    const writable = storage.getWritable({ key, context: {} });

    // Act
    const writer = writable.getWriter();
    await writer.write(data);
    await writer.close();

    // Assert
    const result = await storage.read({ key, signal });
    expect(result).toStrictEqual(data);
  });

  test("読み込みストリームを使用してデータを取得したとき、全データを正常に読み取れる", async ({
    expect,
    storage,
    signal,
  }) => {
    // Arrange
    const key = "stream-read.dat";
    const expectedData = new Uint8Array([100, 200]);
    storage.open();
    await storage.write({ key, data: expectedData, signal });

    // Act
    const readable = await storage.getReadable({ key, signal });
    const reader = readable.getReader();
    const chunks: number[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(...value);
    }

    // Assert
    expect(new Uint8Array(chunks)).toStrictEqual(expectedData);
  });
});

describe("バケット一括削除 (clear)", () => {
  test("複数のオブジェクトが存在するとき、clear を実行すると全てのオブジェクトが削除される", async ({
    expect,
    storage,
    signal,
  }) => {
    // Arrange
    storage.open();
    await storage.write({ key: "file1.txt", data: new Uint8Array([1]), signal });
    await storage.write({ key: "file2.txt", data: new Uint8Array([2]), signal });

    // Act
    await storage.clear({ signal });

    // Assert
    const exists1 = await storage.exists({ key: "file1.txt", signal });
    const exists2 = await storage.exists({ key: "file2.txt", signal });
    expect(exists1).toBe(false);
    expect(exists2).toBe(false);
  });

  test("オブジェクトが一つも存在しない状態で clear を実行しても、エラーが発生せず終了する", async ({
    expect,
    storage,
    signal,
  }) => {
    // Arrange
    storage.open();
    await storage.clear({ signal }); // 一旦空にする

    // Act & Assert
    await expect(storage.clear({ signal })).resolves.not.toThrow();
  });
});

describe("境界値・異常系テスト", () => {
  test("空データを書き込んだとき、サイズ 0 のオブジェクトとして保存される", async ({
    expect,
    storage,
    signal,
  }) => {
    // Arrange
    const key = "empty.bin";
    const emptyData = new Uint8Array(0);
    storage.open();

    // Act
    await storage.write({ key, data: emptyData, signal });

    // Assert
    const result = await storage.read({ key, signal });
    expect(result.length).toBe(0);
    expect(result).toStrictEqual(emptyData);
  });

  test("特殊文字を含むキー名を使用した場合でも、正しく保存および取得ができる", async ({
    expect,
    storage,
    signal,
  }) => {
    // Arrange
    const key = "folder/テスト #123.dat";
    const data = new TextEncoder().encode("Special Key Content");
    storage.open();

    // Act
    await storage.write({ key, data, signal });
    const result = await storage.read({ key, signal });

    // Assert
    expect(result).toStrictEqual(data);
  });

  test("AbortSignal が中断された状態で操作をすると、リクエストが中断される", async ({
    expect,
    storage,
  }) => {
    // Arrange
    const controller = new AbortController();
    controller.abort();
    const key = "abort.txt";
    storage.open();

    // Act & Assert
    // SDK v3 は AbortSignal に対応しており、通常は AbortError (名前は実装に依存) を投げる。
    await expect(
      storage.write({ key, data: new Uint8Array([1]), signal: controller.signal }),
    ).rejects.toThrow();
  });
});
