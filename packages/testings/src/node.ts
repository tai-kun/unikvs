import { readdir } from "node:fs/promises";
import { createServer, Socket } from "node:net";

/**
 * OS から空きポートを 1 つ取得します。
 *
 * @returns 空きポート番号で解決する Promise です。
 */
export async function acquireFreePort(): Promise<number> {
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
 * @param timeoutMs 待機する最大時間 (ミリ秒) です。
 * @returns ポートが開放された場合に解決する Promise です。
 */
export async function waitForPort(port: number, timeoutMs = 10e3): Promise<void> {
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

        if (Date.now() - startTime > timeoutMs) {
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

/**
 * ルート直下に残っている一時ファイル (*.tmp) の名前を返します。
 * swap-on-close の後始末が正しいことを検証するために使用します。
 */
export async function listTemporaryFiles(root: string): Promise<string[]> {
  const entries = await readdir(root);

  return entries.filter((entry) => entry.endsWith(".tmp"));
}
