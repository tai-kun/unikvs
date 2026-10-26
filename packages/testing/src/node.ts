import { readdir } from "node:fs/promises";
import { Socket, createServer } from "node:net";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#acquire-free-port)
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#wait-for-port)
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#list-temporary-files)
 */
export async function listTemporaryFiles(root: string): Promise<string[]> {
  const entries = await readdir(root);

  return entries.filter((entry) => entry.endsWith(".tmp"));
}
