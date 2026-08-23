import { exec } from "node:child_process";
import { Socket } from "node:net";
import { promisify } from "node:util";

import acquireLockedPort, { type LockedPort } from "./_acquire-locked-port.js";
import logger from "./_logger.js";

const execAsync = promisify(exec);

/**
 * 文字列をBashのシングルクォートで安全に囲みます。
 *
 * 文字列内のシングルクォート (') は '\'' に置換されます。
 *
 * @param str エスケープ対象の文字列
 * @returns シングルクォートで囲まれた文字列
 */
function quoteBash(str: string): string {
  // 文字列内の ' を '\'' に置換します。
  //    ' -> ' (閉じ) + \' (エスケープされたシングルクォート) + ' (再び開き)
  const escaped = str.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

/**
 * 指定されたホストとポートが接続可能になるまで待機します。
 *
 * @param host 接続先のホスト名または IP アドレスです。
 * @param portNumber 接続先のポート番号です。
 * @param timeoutMs タイムアウトまでのミリ秒数です。デフォルトは 30,000 ミリ秒です。
 * @param intervalMs 再試行の間隔（ミリ秒）です。デフォルトは 500 ミリ秒です。
 * @returns ポートが開放された場合に解決する Promise です。
 * @throws タイムアウト時間内に接続できなかった場合にエラーを投げます。
 */
async function waitForPort(
  host: string,
  portNumber: number,
  timeoutMs: number = 10e3,
  intervalMs: number = 250,
): Promise<void> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    /**
     * ソケットを使用して接続を試行する内部関数です。
     */
    const tryConnect = () => {
      const socket = new Socket();

      // 接続に成功した場合の処理です。
      socket.on("connect", () => {
        // リソースを解放するためにソケットを破棄します。
        socket.destroy();
        resolve();
      });

      // 接続に失敗（ポートがまだ開いていない等）した場合の処理です。
      socket.on("error", () => {
        socket.destroy();

        // 経過時間がタイムアウト設定を超えているか確認します。
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`タイムアウト: ${host}:${portNumber}`));
        } else {
          // タイムアウト前であれば、指定されたインターバル後に再試行します。
          setTimeout(tryConnect, intervalMs);
        }
      });

      // 実際に接続を試みます。
      socket.connect(portNumber, host);
    };

    tryConnect();
  });
}

/**
 * 指定された識別子を持つ Docker コンテナーを停止します。
 *
 * @param containerId 停止対象のコンテナー ID です。
 * @returns 停止処理が完了すると解決する Promise です。
 */
async function stopContainer(containerId: string): Promise<void> {
  try {
    // --time 0 を指定することで、猶予期間を設けず即座にコンテナーを停止させます。
    // これにより、テスト実行時などのクリーンアップ処理を高速化できます。
    // 起動時に --rm オプションが付与されていることを前提としており、停止と同時にコンテナーは削除されます。
    await execAsync(`docker stop --time 0 ${quoteBash(containerId)}`);
  } catch (ex) {
    // コンテナーの停止に失敗しても、後続の処理への影響を最小限にするため警告ログに留めます。
    logger.warn`コンテナー ${containerId} の停止に失敗: ${ex}`;
  }
}

/**
 * ロックしているポート番号を解放します。
 *
 * @param portMappings コンテナー内部ポートとホスト側ポートの対応関係を保持するオブジェクトです。
 */
function releaseLockedPorts(portMappings: ReadonlyMap<number, LockedPort>): void {
  for (const [containerPort, lockedHostPort] of portMappings) {
    try {
      lockedHostPort.release();
    } catch (ex) {
      //ポートのロック解放に失敗しても、後続の処理への影響を最小限にするため警告ログに留めます。
      logger.warn`ポート ${lockedHostPort.number}:${containerPort} の解放に失敗: ${ex}`;
    }
  }
}

/**
 * 起動済みの Docker コンテナーを管理するクラスです。
 */
class StartedContainer implements AsyncDisposable {
  /**
   * 実行中の Docker コンテナー ID です。
   */
  private containerId: string;

  /**
   * コンテナー内部ポートとホスト側ポートの対応関係を保持するオブジェクトです。
   */
  private portMappings: ReadonlyMap<number, LockedPort>;

  /**
   * StartedContainer の新しいインスタンスを作成します。
   *
   * @param containerId 起動されたコンテナーの ID です。
   * @param portMappings ポートのマッピング情報です。
   */
  public constructor(containerId: string, portMappings: ReadonlyMap<number, LockedPort>) {
    this.containerId = containerId;
    this.portMappings = portMappings;
  }

  /**
   * コンテナーが動作しているホストのアドレスを取得します。
   *
   * @returns ホストの IP アドレス（現在はローカル環境固定）です。
   */
  public getHost(): string {
    // ローカル環境での実行を前提としているため、ループバックアドレスを返却します。
    return "127.0.0.1";
  }

  /**
   * コンテナー内部のポートに対応する、ホスト側の公開ポートを取得します。
   *
   * @param port コンテナー内部で公開されているポート番号です。
   * @returns ホスト側に割り当てられたポート番号です。
   * @throws 指定されたポートがマッピングされていない場合にエラーを投げます。
   */
  public getMappedPort(port: number): number {
    const mappedPortNumber = this.portMappings.get(port)?.number;
    if (!mappedPortNumber) {
      // 予期しないポート番号が指定された場合、設定ミスである可能性があるためエラーを投げます。
      throw new Error(`ポート ${port} は公開されていません`);
    }

    return mappedPortNumber;
  }

  /**
   * リソースを解放します。
   *
   * @returns クリーンアップが完了すると解決する Promise です。
   */
  public async dispose(): Promise<void> {
    await stopContainer(this.containerId);
    releaseLockedPorts(this.portMappings);
  }

  /**
   * 非同期リソース解放のための特別なメソッドです。
   *
   * インスタンスのスコープが終了した際に、自動的にコンテナーを停止します。
   *
   * @returns クリーンアップが完了すると解決する Promise です。
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}

export type { StartedContainer };

/**
 * 汎用的な Docker コンテナーを定義し、起動するためのビルダークラスです。
 */
export default class TestContainer {
  /**
   * 使用する Docker イメージ名です。
   */
  private readonly image: string;

  /**
   * コンテナー外部に公開する内部ポートのリストです。
   */
  private containerPorts: Set<number>;

  /**
   * TestContainer の新しいインスタンスを作成します。
   *
   * @param image 使用する Docker イメージの名前（例: 'redis:latest'）です。
   */
  public constructor(image: string) {
    this.image = image;
    this.containerPorts = new Set();
  }

  /**
   * コンテナーで公開したいポートを設定します。
   *
   * @param ports 公開するポート番号の可変長引数です。
   * @returns メソッドチェーンのためのインスタンス自身です。
   */
  public withExposedPorts(...ports: number[]): this {
    for (const containerPort of ports) {
      this.containerPorts.add(containerPort);
    }

    return this;
  }

  /**
   * 設定に基づいて Docker コンテナーを非同期で起動します。
   *
   * @returns 起動したコンテナーを操作するための StartedContainer インスタンスです。
   * @throws コンテナーの起動またはポート情報の解析に失敗した場合にエラーを投げます。
   */
  public async start(): Promise<StartedContainer> {
    let portArgs = "";
    // 動的に割り当てられたホスト側のポート番号を取得・格納するためのマップです。
    const portMappings = new Map<number, LockedPort>();
    try {
      for (const exposedPortNumber of this.containerPorts) {
        const lockedHostPort = await acquireLockedPort();
        portMappings.set(exposedPortNumber, lockedHostPort);
        portArgs && (portArgs += " ");
        portArgs += "-p " + quoteBash(lockedHostPort.number + ":" + exposedPortNumber);
      }
    } catch (ex) {
      releaseLockedPorts(portMappings);

      throw ex;
    }

    // docker run コマンドを構築します。
    // -d: デタッチモード（バックグラウンド実行）
    // --rm: 停止時にコンテナーを自動削除
    const { stdout: runStdout } = await execAsync(
      `docker run -d --rm ${portArgs} ${quoteBash(this.image)}`,
    );

    // 標準出力から取得したコンテナー ID をトリミングして保持します。
    const containerId = runStdout.trim();

    // すべての準備が整った状態で、コンテナー操作用インスタンスを返却します。
    const container = new StartedContainer(containerId, portMappings);

    try {
      // 起動直後のコンテナー内部プロセスが準備完了するまで待機します。
      for (const port of this.containerPorts) {
        await waitForPort(container.getHost(), container.getMappedPort(port));
      }
    } catch (ex) {
      await stopContainer(containerId);
      releaseLockedPorts(portMappings);

      throw ex;
    }

    return container;
  }
}
