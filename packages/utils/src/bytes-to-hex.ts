// 高速化のために、0 から 255 までの数値をあらかじめ 2 桁の 16 進数文字列に変換したマップを作成します。
let byte2hex: string[];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#bytes-to-hex)
 */
export default function bytesToHex(bytes: Uint8Array): string {
  if (typeof bytes.toHex === "function") {
    return bytes.toHex();
  }

  byte2hex ||= Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

  let i = 0,
    hex = "";
  for (; i < bytes.length; i++) {
    hex += byte2hex[bytes[i]!];
  }

  return hex;
}
