import { FastUtf8 } from "fast-utf8";

/**
 * エンコード用の共有 UTF-8 インスタンスです。
 *
 * 入力は ASCII のみを想定するため strict 検証は不要です。
 *
 * 注入がない場合の既定値として使います。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#default-utf8)
 */
export const defaultUtf8Encoder: FastUtf8 = /* #__PURE__ */ new FastUtf8({
  strict: false,
  allocateSize: 1024,
});

/**
 * 一括デコード用の共有 UTF-8 インスタンスです。
 *
 * 不正な入力は TextDecoder の fatal 相当として TypeError を投げます。
 *
 * 注入がない場合の既定値として使います。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#default-utf8)
 */
export const defaultUtf8Decoder: FastUtf8 = /* #__PURE__ */ new FastUtf8({ strict: true });
