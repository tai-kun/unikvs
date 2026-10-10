import { getLogger } from "@logtape/logtape";

// 既定のロガーです。
export const logger = getLogger("unikvs");

// 書き戻しに関する警告専用のロガーです。
export const repairLogger = getLogger(["@unikvs/*", "@unikvs/allow-repair"]);
