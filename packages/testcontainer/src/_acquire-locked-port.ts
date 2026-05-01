import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MIN_PORT_NUMBER = 1024;
const MAX_PORT_NUMBER = 65_535;

/**
 * ロックされたポート情報を表すインターフェースです。
 */
export interface LockedPort extends Disposable {
  /**
   * 確保されたポート番号です。
   */
  number: number;

  /**
   * ポートロックを手動で解放します。
   */
  release(): void;

  /**
   * オブジェクトの数値表現（ポート番号）を返します。
   */
  valueOf(): number;

  /**
   * オブジェクトの文字列表現（ポート番号の文字列）を返します。
   */
  toString(): string;

  /**
   * プリミティブ型への変換を制御します。
   *
   * @param hint 変換のヒント（"number", "string", "default"）です。
   */
  [Symbol.toPrimitive](hint: string): string | number;
}

/**
 * 指定されたポートが OS レベルで TIME_WAIT 状態にあるかどうかを判定します。
 *
 * @param portNumber チェック対象のポート番号です。
 * @returns TIME_WAIT 状態であれば true、そうでなければ false を返します。
 */
function isPortInWaitState(portNumber: number): boolean {
  try {
    // OS ごとにネットワーク状態を確認するコマンドが異なるため、プラットフォームを判定します。
    // Windows では findstr、Unix 系では grep を使用して特定のポートと TIME_WAIT 状態を抽出します。
    const command =
      process.platform === "win32"
        ? `netstat -ano | findstr TIME_WAIT | findstr :${portNumber}`
        : `ss -tan | grep TIME-WAIT | grep ':${portNumber}'`;

    // コマンドを実行し、標準出力を取得します。
    const output = execSync(command, { encoding: "utf-8" });

    // 出力が存在する場合は、そのポートが TIME_WAIT 状態であるとみなします。
    return output.length > 0;
  } catch {
    // execSync は終了コードが 0 以外（マッチなしなど）の場合にエラーを投げるため、その場合は TIME_WAIT ではないと判断して安全に false を返します。
    return false;
  }
}

/**
 * 使用可能な空きポートを探索し、排他的なロックを確保した状態で返します。
 *
 * @returns 確保されたポート情報（LockedPort）を持つ Promise です。
 */
export default async function acquireLockedPort(): Promise<LockedPort> {
  // 一時ディレクトリー内にロックファイル用の専用ディレクトリーを定義します。
  const lockDir = join(tmpdir(), "locked-ports");

  // ロック用ディレクトリーが存在しない場合は、再帰的に作成します。
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  // 利用可能なポートが見つかるまで無限ループで試行します。
  while (true) {
    // OS に空きポートを問い合わせます。net モジュールの server.listen(0) を利用して、一時的にポートをバインドさせます。
    const portNumber = await new Promise<number | null>((resolve, reject) => {
      const server = createServer();

      // プロセスが終了するのを妨げないように参照を外します。
      server.unref();

      // ポート 0 で listen すると、OS が空いているエフェメラルポートを自動的に割り当てます。
      server.listen(0, () => {
        const address = server.address();
        // 戻り値が文字列の場合は無しとして、オブジェクトの場合は port プロパティーを取得します。
        const portNumber = typeof address === "object" ? address?.port : undefined;

        if (!portNumber || portNumber < MIN_PORT_NUMBER || portNumber > MAX_PORT_NUMBER) {
          server.close(() => {
            // ポート番号が取得できなかった場合はエラーを投げます。
            reject(new Error("ポートの取得に失敗しました"));
          });
        } else {
          // ファイルシステムベースのロックを確認します。複数のプロセスが同時に同じポートを狙う競合を防ぐための二重チェックです。
          const lockFilePath = join(lockDir, portNumber.toString(10));

          // 他のプロセスによって既にこのポートのロックファイルが作成されているか確認します。
          if (existsSync(lockFilePath)) {
            // 既にロックされていれば、このポートを諦めて再試行します。
            server.close(() => {
              resolve(null);
            });
          }
          // OS のソケット状態を確認します。直前に使われていたポートが TIME_WAIT 状態だと、再利用時にタイムアウトエラーが発生する可能性があるためです。
          else if (isPortInWaitState(portNumber)) {
            // TIME_WAIT 状態ならクリーンな状態ではないため、破棄して再試行します。
            server.close(() => {
              resolve(null);
            });
          } else {
            let ok = false;
            // ロックファイルを作成して権限を確定させます。
            try {
              // 空のファイルを書き込みます。existsSync と writeFileSync の間にわずかなタイムラグがあるため、競合が発生した場合は catch ブロックへ遷移します。
              writeFileSync(lockFilePath, "");
              ok = true;
            } catch {
              // 書き込み失敗（権限エラーや他プロセスによる先行作成など）時は再試行します。
              server.close(() => {
                resolve(null);
              });
            }
            if (ok) {
              // ポート番号のロックを確定できたら、サーバーを閉じて、そのポート番号で解決します。
              server.close(() => {
                resolve(portNumber);
              });
            }
          }
        }
      });
    });

    if (portNumber === null) {
      // 再試行します。
      continue;
    }

    function release() {
      // 不要になったポート番号をロックから解放します。
      const lockFilePath = join(lockDir, portNumber!.toString(10));
      if (existsSync(lockFilePath)) {
        unlinkSync(lockFilePath);
      }
    }

    // ロック済みポートオブジェクトを構築して返します。
    return {
      number: portNumber,
      release,
      valueOf() {
        return portNumber;
      },
      toString() {
        return portNumber.toString(10);
      },
      [Symbol.dispose]: release,
      [Symbol.toPrimitive](hint) {
        switch (hint) {
          case "number":
            return portNumber;
          default:
            return portNumber.toString(10);
        }
      },
    };
  }
}
