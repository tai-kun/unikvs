import { getLogger } from "@logtape/logtape";

/**
 * 既定のロガーです。
 *
 * `@unikvs` 配下の診断出力に使います。
 */
export const logger = getLogger(["@unikvs/*", "@unikvs/utils"]);
