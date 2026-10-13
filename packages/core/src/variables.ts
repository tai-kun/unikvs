import { ReadonlyVariableError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
 */
export type VariablesEntry = readonly [key: string, value: unknown];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
 */
export type VariablesInit =
  | { readonly [key: string]: unknown }
  | { [Symbol.iterator](): Iterator<VariablesEntry> };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
 */
export default class Variables {
  #data: Map<string, unknown>;

  #readonly: Set<string>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public constructor(init: VariablesInit = []) {
    const data = Symbol.iterator in init ? init : Object.entries(init);
    this.#data = new Map(data);

    const readonly = init instanceof Variables ? init.#readonly : [];
    this.#readonly = new Set(readonly);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public get size(): number {
    return this.#data.size;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public get<T = unknown>(key: string): T | undefined {
    return this.#data.get(key) as T | undefined;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public set(key: string, value: unknown): this {
    if (this.#readonly.has(key)) {
      throw new ReadonlyVariableError({ key });
    }

    this.#data.set(key, value);

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public setReadonly(key: string, value: unknown): this {
    if (this.#readonly.has(key)) {
      throw new ReadonlyVariableError({ key });
    }

    this.#data.set(key, value);
    this.#readonly.add(key);

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public has(key: string): boolean {
    return this.#data.has(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public delete(key: string): boolean {
    if (this.#readonly.has(key)) {
      throw new ReadonlyVariableError({ key });
    }

    return this.#data.delete(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public isReadonly(key: string): boolean {
    return this.#readonly.has(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public clone(overrides?: VariablesInit): Variables {
    const cloned = new Variables();
    // 一括複写コンストラクターで複写します。要素ごとの反復より高速です。
    cloned.#data = new Map(this.#data);
    cloned.#readonly = new Set(this.#readonly);

    if (overrides) {
      const data = Symbol.iterator in overrides ? overrides : Object.entries(overrides);
      for (const [key, value] of data) {
        cloned.#data.set(key, value);
      }

      const readonly = overrides instanceof Variables ? overrides.#readonly : [];
      for (const key of readonly) {
        cloned.#readonly.add(key);
      }
    }

    return cloned;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public entries(): IterableIterator<[string, unknown]> {
    return this.#data.entries();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public [Symbol.iterator](): IterableIterator<[string, unknown]> {
    return this.#data[Symbol.iterator]();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public toJSON(): Record<string, unknown> {
    return Object.fromEntries(this.#data);
  }

  public get [Symbol.toStringTag](): "Variables" {
    return "Variables";
  }
}
