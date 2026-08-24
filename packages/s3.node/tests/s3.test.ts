import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { S3Client, CreateBucketCommand, type S3ClientConfig } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, test as vitest } from "vitest";

import S3 from "../src/s3.js";

let bucketId = 0;
let server: ChildProcess;
let volumeDir: string;
let portNumber: number;

/**
 * OS から空きポートを 1 つ取得します。
 *
 * @returns 空きポート番号で解決する Promise です。
 */
async function acquireFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        const port = address.port;
        server.close(() => {
          resolve(port);
        });
      } else {
        server.close(() => {
          reject(new Error("空きポートの取得に失敗しました"));
        });
      }
    });
  });
}

/**
 * 指定されたポートが接続可能になるまで待機します。
 *
 * @param port 接続先のポート番号です。
 * @returns ポートが開放された場合に解決する Promise です。
 * @throws タイムアウト時間内に接続できなかった場合にエラーを投げます。
 */
async function waitForPort(port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();

    const tryConnect = (): void => {
      const socket: Socket = new Socket();
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startTime > 10e3) {
          reject(new Error(`タイムアウト: 127.0.0.1:${port}`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
      socket.connect(port, "127.0.0.1");
    };

    tryConnect();
  });
}

beforeAll(async () => {
  portNumber = await acquireFreePort();
  volumeDir = mkdtempSync(join(tmpdir(), "unikvs-s3-node-"));

  server = spawn("rustfs", ["server", "--address", `127.0.0.1:${portNumber}`, volumeDir], {
    stdio: "ignore",
  });

  await waitForPort(portNumber);
});

afterAll(async () => {
  if (!server.killed) {
    server.kill();
  }
  rmSync(volumeDir, { recursive: true, force: true });
});

// oxlint-disable-next-line jest/expect-expect jest/no-disabled-tests
const test = vitest.extend<{
  storage: S3;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const bucket = `test-bucket-${bucketId++}`;
    const endpoint = `http://127.0.0.1:${portNumber}`;

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
  },
});

describe("ライフサイクル管理", () => {
  test("インスタンス化した直後は、isOpen が false である", ({ expect, storage }) => {
    // 準備と実行は constructor で完了している。

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  test("open を呼び出すと、isOpen が true になる", ({ expect, storage }) => {
    // 実行
    storage.open();

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("close を呼び出すと、isOpen が false に戻る", ({ expect, storage }) => {
    // 準備
    storage.open();

    // 実行
    storage.close();

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  test("close 後に再び open すると、データの書き込みと読み取りができる", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "reopen.txt";
    const data = new TextEncoder().encode("Reopen");
    storage.open();
    storage.close();
    storage.open();

    // 実行
    await storage.write({ key, data, signal });

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });
});

describe("基本データ操作 (CRUD)", () => {
  test("データを書き込んだとき、キーの存在確認が true になる", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "test.txt";
    const data = new TextEncoder().encode("Hello S3");
    storage.open();

    // 実行
    await storage.write({ key, data, signal });

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(true);
  });

  test("書き込んだデータを読み戻したとき、元のデータと一致する Uint8Array が返る", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "read-test.txt";
    const expectedData = new TextEncoder().encode("Read Content");
    storage.open();
    await storage.write({ key, data: expectedData, signal });

    // 実行
    const result = await storage.read({ key, signal });

    // 検証
    expect(result).toStrictEqual(expectedData);
  });

  test("同じキーに上書きしたとき、読み戻すと最後に書き込んだデータになる", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "overwrite.txt";
    const firstData = new TextEncoder().encode("first version");
    const secondData = new TextEncoder().encode("second version");
    storage.open();
    await storage.write({ key, data: firstData, signal });

    // 実行
    await storage.write({ key, data: secondData, signal });

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(secondData);
  });

  test("存在しないキーを確認したとき、false が返る", async ({ expect, storage, signal }) => {
    // 準備
    const key = "non-existent.txt";
    storage.open();

    // 実行
    const result = await storage.exists({ key, signal });

    // 検証
    expect(result).toBe(false);
  });

  test("存在しないキーを読み取ろうとしたとき、エラーが投げられる", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "missing-read-target.txt";
    storage.open();

    // 実行と検証
    await expect(storage.read({ key, signal })).rejects.toThrow(/NoSuchKey|does not exist/);
  });

  test("オブジェクトを削除したとき、以降は存在確認が false になる", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "delete-test.txt";
    storage.open();
    await storage.write({ key, data: new Uint8Array([1, 2, 3]), signal });

    // 実行
    await storage.delete({ key, signal });

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
  });

  test("存在しないキーを削除しても、エラーにならず完了する", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "non-existent-delete-target.txt";
    storage.open();

    // 実行と検証
    await expect(storage.delete({ key, signal })).resolves.toBeUndefined();
  });
});

describe("ストリーム操作", () => {
  test("複数のチャンクを書き込みストリームに流し込んだとき、連結された内容が保存される", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "stream-write.dat";
    const chunks = [
      new Uint8Array([10, 20, 30]),
      new TextEncoder().encode("middle chunk"),
      new Uint8Array([200, 201]),
    ];
    const expected = new Uint8Array(chunks.flatMap((chunk) => Array.from(chunk)));
    storage.open();
    const writable = storage.getWritable({ key, context: {} });
    const writer = writable.getWriter();

    // 実行
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(expected);
  });

  test("パートサイズより大きいデータを書き込みストリームで保存したとき、全データが正しく保存される", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    // デフォルトのパートサイズ (5 MiB) をまたいで複数パートになるサイズを使用する。
    const chunkSize = 1024 * 1024;
    const data = new Uint8Array(chunkSize * 11 + 123456);
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 251;
    }
    const key = "multipart-write.dat";
    storage.open();
    const writable = storage.getWritable({ key, context: {} });
    const writer = writable.getWriter();

    // 実行
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      await writer.write(data.subarray(offset, offset + chunkSize));
    }
    await writer.close();

    // 検証
    const result = await storage.read({ key, signal });
    // toStrictEqual は大きな配列の比較に極端に時間がかかるため、Buffer.equals を使用する。
    expect(Buffer.from(result).equals(Buffer.from(data))).toBe(true);
  });

  test("最小値未満の partSize をコンテキストに指定したとき、書き込みストリームの取得時にエラーが投げられる", ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "too-small-part-size.dat";
    storage.open();

    // 実行と検証
    expect(() =>
      storage.getWritable({
        key,
        context: { "@unikvs/s3.node:partSize": 1024 },
      }),
    ).toThrow(/EntityTooSmall/);
  });

  test("読み込みストリームを使用したとき、複数チャンクに分かれた全データを正しく読み取れる", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    // ストリームが複数チャンクに分割されるよう、十分な大きさのデータを使用する。
    const expectedData = new Uint8Array(1536 * 1024);
    for (let i = 0; i < expectedData.length; i++) {
      expectedData[i] = (i * 31) % 256;
    }
    const key = "stream-read.dat";
    storage.open();
    await storage.write({ key, data: expectedData, signal });

    // 実行
    const readable = await storage.getReadable({ key, signal });
    const reader = readable.getReader();
    const buffers: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffers.push(value);
    }

    // 検証
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }
    expect(buffers.length).toBeGreaterThan(1);
    expect(result).toStrictEqual(expectedData);
  });
});

describe("バケット一括削除 (clear)", () => {
  test("複数のオブジェクトが存在するとき、clear を実行すると全てのオブジェクトが削除される", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    storage.open();
    await storage.write({ key: "file1.txt", data: new Uint8Array([1]), signal });
    await storage.write({ key: "file2.txt", data: new Uint8Array([2]), signal });

    // 実行
    await storage.clear({ signal });

    // 検証
    await expect(storage.exists({ key: "file1.txt", signal })).resolves.toBe(false);
    await expect(storage.exists({ key: "file2.txt", signal })).resolves.toBe(false);
  });

  test("オブジェクトが一つも存在しない状態でも clear を実行できる", async ({ storage, signal }) => {
    // 準備
    storage.open();

    // 実行と検証
    await storage.clear({ signal });
  });
});

describe("境界値・異常系テスト", () => {
  test("空データを書き込んだとき、サイズ 0 のオブジェクトとして保存される", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "empty.bin";
    const emptyData = new Uint8Array(0);
    storage.open();

    // 実行
    await storage.write({ key, data: emptyData, signal });

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(emptyData);
  });

  test("特殊文字を含むキー名を使用した場合でも、正しく保存および取得ができる", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    const key = "folder/テスト #123.dat";
    const data = new TextEncoder().encode("Special Key Content");
    storage.open();

    // 実行
    await storage.write({ key, data, signal });
    const result = await storage.read({ key, signal });

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("AbortSignal が中断された状態で操作をすると、リクエストが中断される", async ({
    expect,
    storage,
  }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();
    const key = "abort.txt";
    storage.open();

    // 実行と検証
    await expect(async () => {
      await storage.write({
        key,
        data: new Uint8Array([1]),
        signal: controller.signal,
      });
    }).rejects.toThrow();
  });
});
