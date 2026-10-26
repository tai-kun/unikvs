import { FastUtf8 } from "fast-utf8";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#default-utf8)
 */
export const defaultUtf8Encoder: FastUtf8 = /*#__PURE__*/ new FastUtf8({
  strict: false,
  allocateSize: 1024,
});

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#default-utf8)
 */
export const defaultUtf8Decoder: FastUtf8 = /*#__PURE__*/ new FastUtf8({ strict: true });
