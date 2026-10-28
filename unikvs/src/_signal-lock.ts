import { type AsyncmuxLock, asyncmux } from "asyncmux";

/**
 * 共有プラグインの開閉ロックを取得します。
 *
 * 競合がないときは従来どおり即座に取得します。中断済みのシグナルでは待機キューに追加せず、待機中に中断されたときはキューから要求を取り除いて中断理由で拒否します。
 *
 * @param target ロック対象のオブジェクトです。
 * @param signal 待機を中断するシグナルです。
 *
 * @returns 取得したロックを返します。
 */
export default async function acquireSignalLock(
  target: object,
  signal: AbortSignal,
): Promise<AsyncmuxLock> {
  // asyncmux は中断済みの要求をキューに追加せず、待機中の中断ではキューから取り除きます。
  // そのため、中断で敗退した要求が後からロックを取得して保持することはありません。
  if (signal.aborted) {
    throw signal.reason;
  }

  return asyncmux(target, signal);
}
