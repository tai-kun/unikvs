import { type Logger, getLogger } from "@logtape/logtape";

// 既定のロガーです。
export const logger: Logger = getLogger("unikvs");

// 書き戻しに関する警告専用のロガーです。
export const repairLogger: Logger = getLogger(["@unikvs/*", "@unikvs/allow-repair"]);
