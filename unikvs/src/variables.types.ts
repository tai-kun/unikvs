import type { Variables } from "@unikvs/core";

import type { ValueOf } from "./utils.types.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
 */
export type VariableEntry = readonly [key: keyof Variables, value: ValueOf<Variables>];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
 */
export type VariablesSource = Readonly<Variables> | readonly VariableEntry[];
