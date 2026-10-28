import { type Logger, getLogger } from "@logtape/logtape";

// 既定のロガーです。
export const logger: Logger = getLogger("unikvs");

// 書き戻しに関する警告専用のロガーです。
export const repairLogger: Logger = getLogger(["@unikvs/*", "@unikvs/allow-repair"]);

/**
 * ストレージの修復失敗を警告として記録します。
 *
 * @param error 失敗の理由です。
 */
export function logRepairFailure(error: unknown): void {
  repairLogger.warn`Failed to repair a storage: ${error}`;
}

/**
 * ストレージの修復失敗をエラーとして記録します。
 *
 * @param error 失敗の理由です。
 */
export function logRepairError(error: unknown): void {
  logger.error`Failed to repair a storage: ${error}`;
}

/**
 * AllowRepair のないストレージの修復をスキップしたことを警告として記録します。
 *
 * @param name スキップしたストレージの名前です。
 */
export function logSkippedRepair(name: string): void {
  repairLogger.warn`Skipped repair for a storage without AllowRepair: ${name}`;
}
