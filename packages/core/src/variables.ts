import { ReadonlyVariableError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
 */
export type VariablesEntry = readonly [key: string, value: unknown];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
 */
export type VariablesInit =
  | Readonly<Record<string, unknown>>
  | ReadonlyMap<string, unknown>
  | readonly VariablesEntry[];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
 */
export default class Variables {
  #data: Map<string, unknown>;

  #readonlyKeys: Set<string>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public constructor(init?: VariablesInit) {
    // 一括複写コンストラクターで初期化します。要素ごとの `set` 反復より高速です。
    if (init instanceof Map) {
      this.#data = new Map(init);
    } else if (Array.isArray(init)) {
      this.#data = new Map(init);
    } else if (init !== undefined) {
      this.#data = new Map(Object.entries(init));
    } else {
      this.#data = new Map();
    }

    this.#readonlyKeys = new Set();
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
    if (this.#readonlyKeys.has(key)) {
      throw new ReadonlyVariableError({ key });
    }

    this.#data.set(key, value);

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public setReadonly(key: string, value: unknown): this {
    if (this.#readonlyKeys.has(key)) {
      throw new ReadonlyVariableError({ key });
    }

    this.#data.set(key, value);
    this.#readonlyKeys.add(key);

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
    if (this.#readonlyKeys.has(key)) {
      throw new ReadonlyVariableError({ key });
    }

    return this.#data.delete(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public isReadonly(key: string): boolean {
    return this.#readonlyKeys.has(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public clone(overrides?: VariablesInit): Variables {
    const cloned = new Variables();
    // 一括複写コンストラクターで複写します。要素ごとの反復より高速です。
    cloned.#data = new Map(this.#data);
    cloned.#readonlyKeys = new Set(this.#readonlyKeys);

    if (overrides !== undefined) {
      if (overrides instanceof Map) {
        for (const [key, value] of overrides) {
          cloned.#data.set(key, value);
        }
      } else if (Array.isArray(overrides)) {
        for (const [key, value] of overrides) {
          cloned.#data.set(key, value);
        }
      } else {
        for (const [key, value] of Object.entries(overrides)) {
          cloned.#data.set(key, value);
        }
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
