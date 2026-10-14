import { ReadonlyVariableError } from "./errors.js";

declare global {
  /**
   * `Variables` の既定の変数マップです。
   *
   * `ArrayBufferTypes` と同様に、プラグインや利用者側で宣言マージにより
   * キーと値の型を追加すると、`Variables` の型引数 `T` が自動的に決まります。
   *
   * @example
   * ```ts
   * declare global {
   *   interface UniKvsVariablesTypes {
   *     readonly "my-plugin:key": string;
   *   }
   * }
   *
   * const vars = new Variables();
   * vars.get("my-plugin:key"); // string
   * ```
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  interface UniKvsVariablesTypes {}
}

type Key<T = {}> = Extract<keyof T, string> | (string & {});

type Value<T, K extends string> = K extends keyof T ? T[K] : unknown;

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
export default class Variables<T extends object = UniKvsVariablesTypes> {
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
  public get<const TKey extends Key<T>>(key: TKey): Value<T, TKey> {
    return this.#data.get(key) as Value<T, TKey>;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public set<const TKey extends Key<T>>(key: TKey, value: Value<T, TKey>): this {
    if (this.#readonly.has(key)) {
      throw new ReadonlyVariableError({ key });
    }

    this.#data.set(key, value);

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public setReadonly<const TKey extends Key<T>>(key: TKey, value: Value<T, TKey>): this {
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
  public has(key: Key<T>): boolean {
    return this.#data.has(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public delete(key: Key<T>): boolean {
    if (this.#readonly.has(key)) {
      throw new ReadonlyVariableError({ key });
    }

    return this.#data.delete(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#variables)
   */
  public isReadonly(key: Key<T>): boolean {
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
