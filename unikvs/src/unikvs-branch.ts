import type { IMiddleware, IStorage } from "@unikvs/core";

import UniKvsMiddleware from "./_middleware.js";
import UniKvsStorage from "./_storage.js";
import type {
  $IsUnknown,
  $CheckForkDecodeData,
  $CheckForkEncodeData,
  $InferReadDataOutput,
  $InferWriteDataInput,
  $CheckForkDecodeChunk,
  $CheckForkEncodeChunk,
  $InferDecodeDataInput,
  $InferEncodeDataInput,
  $InferReadChunkOutput,
  $InferWriteChunkInput,
  $InferDecodeChunkInput,
  $InferDecodeDataOutput,
  $InferEncodeChunkInput,
  $InferEncodeDataOutput,
  $InferDecodeChunkOutput,
  $InferEncodeChunkOutput,
} from "./_types.js";
import { branchStates, getBranchDestinationsForFork } from "./_unikvs-branch.js";
import type { Value } from "./value-schemas.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type KeyValueMapping<T = any> = {
  readonly [key: string]: Value<T>;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export interface IUniKvsBranch<
  TKeyValueMapping extends KeyValueMapping = KeyValueMapping,
  TBranchChunkInput = any,
  TBranchChunkOutput = any,
  THeadEncodeDataInput = unknown,
  THeadDecodeDataOutput = unknown,
  THeadEncodeChunkInput = unknown,
  THeadDecodeChunkOutput = unknown,
  TLastDecodeDataInput = any,
  TLastEncodeDataOutput = any,
  TLastDecodeChunkInput = any,
  TLastEncodeChunkOutput = any,
  TBranchHasPersist extends boolean = false,
> {
  fork<
    TSubChunkInput,
    TSubChunkOutput,
    TSubHeadEncodeDataInput,
    TSubHeadDecodeDataOutput,
    TSubHeadEncodeChunkInput,
    TSubHeadDecodeChunkOutput,
    TSubLastDecodeDataInput,
    TSubLastEncodeDataOutput,
    TSubLastDecodeChunkInput,
    TSubLastEncodeChunkOutput,
    TSubHasPersist extends boolean,
  >(
    branch: IUniKvsBranch<
      any,
      TSubChunkInput,
      TSubChunkOutput,
      TSubHeadEncodeDataInput,
      TSubHeadDecodeDataOutput,
      TSubHeadEncodeChunkInput,
      TSubHeadDecodeChunkOutput,
      TSubLastDecodeDataInput,
      TSubLastEncodeDataOutput,
      TSubLastDecodeChunkInput,
      TSubLastEncodeChunkOutput,
      TSubHasPersist
    > &
      (TSubHasPersist extends true
        ? $CheckForkEncodeData<TLastEncodeDataOutput, TSubHeadEncodeDataInput>
        : unknown) &
      (TSubHasPersist extends true
        ? $CheckForkDecodeData<TLastDecodeDataInput, TSubHeadDecodeDataOutput>
        : unknown) &
      (TSubHasPersist extends true
        ? $CheckForkEncodeChunk<TLastEncodeChunkOutput, TSubHeadEncodeChunkInput>
        : unknown) &
      (TSubHasPersist extends true
        ? $CheckForkDecodeChunk<TLastDecodeChunkInput, TSubHeadDecodeChunkOutput>
        : unknown),
  ): IUniKvsBranch<
    TKeyValueMapping,
    TSubHasPersist extends true
      ? [TBranchChunkInput] extends [never]
        ? never
        : [TSubChunkInput] extends [never]
          ? never
          : TBranchChunkInput
      : TBranchChunkInput,
    TSubHasPersist extends true
      ? [TBranchChunkOutput] extends [never]
        ? never
        : [TSubChunkOutput] extends [never]
          ? never
          : TBranchChunkOutput
      : TBranchChunkOutput,
    TSubHasPersist extends true
      ? $IsUnknown<THeadEncodeDataInput> extends true
        ? TSubHeadEncodeDataInput
        : THeadEncodeDataInput
      : THeadEncodeDataInput,
    TSubHasPersist extends true
      ? $IsUnknown<THeadDecodeDataOutput> extends true
        ? TSubHeadDecodeDataOutput
        : THeadDecodeDataOutput
      : THeadDecodeDataOutput,
    TSubHasPersist extends true
      ? $IsUnknown<THeadEncodeChunkInput> extends true
        ? TSubHeadEncodeChunkInput
        : THeadEncodeChunkInput
      : THeadEncodeChunkInput,
    TSubHasPersist extends true
      ? $IsUnknown<THeadDecodeChunkOutput> extends true
        ? TSubHeadDecodeChunkOutput
        : THeadDecodeChunkOutput
      : THeadDecodeChunkOutput,
    TLastDecodeDataInput,
    TLastEncodeDataOutput,
    TLastDecodeChunkInput,
    TLastEncodeChunkOutput,
    TBranchHasPersist extends true ? true : TSubHasPersist
  >;

  use<
    TMiddleware extends IMiddleware<
      [TLastEncodeDataOutput] extends [never] ? any : TLastEncodeDataOutput,
      any,
      [TLastEncodeChunkOutput] extends [never] ? any : TLastEncodeChunkOutput,
      any
    >,
  >(
    middleware: TMiddleware,
  ): IUniKvsBranch<
    TKeyValueMapping,
    [TBranchChunkInput] extends [never]
      ? never
      : [$InferDecodeChunkInput<TMiddleware>] extends [never]
        ? never
        : TBranchChunkInput,
    [TBranchChunkOutput] extends [never]
      ? never
      : [$InferEncodeChunkOutput<TMiddleware>] extends [never]
        ? never
        : TBranchChunkOutput,
    $IsUnknown<THeadEncodeDataInput> extends true
      ? $InferEncodeDataInput<TMiddleware>
      : THeadEncodeDataInput,
    $IsUnknown<THeadDecodeDataOutput> extends true
      ? $InferDecodeDataOutput<TMiddleware>
      : THeadDecodeDataOutput,
    $IsUnknown<THeadEncodeChunkInput> extends true
      ? $InferEncodeChunkInput<TMiddleware>
      : THeadEncodeChunkInput,
    $IsUnknown<THeadDecodeChunkOutput> extends true
      ? $InferDecodeChunkOutput<TMiddleware>
      : THeadDecodeChunkOutput,
    $InferDecodeDataInput<TMiddleware>,
    $InferEncodeDataOutput<TMiddleware>,
    $InferDecodeChunkInput<TMiddleware>,
    $InferEncodeChunkOutput<TMiddleware>,
    TBranchHasPersist
  >;

  persist<
    TStorage extends IStorage<
      [TLastEncodeDataOutput] extends [never] ? any : TLastEncodeDataOutput,
      [TLastDecodeDataInput] extends [never] ? any : TLastDecodeDataInput,
      [TLastEncodeChunkOutput] extends [never] ? any : TLastEncodeChunkOutput,
      [TLastDecodeChunkInput] extends [never] ? any : TLastDecodeChunkInput
    >,
  >(
    storage: TStorage,
  ): IUniKvsBranch<
    TKeyValueMapping,
    [TBranchChunkInput] extends [never]
      ? never
      : [$InferWriteChunkInput<TStorage>] extends [never]
        ? never
        : TBranchChunkInput,
    [TBranchChunkOutput] extends [never]
      ? never
      : [$InferReadChunkOutput<TStorage>] extends [never]
        ? never
        : TBranchChunkOutput,
    $IsUnknown<THeadEncodeDataInput> extends true
      ? $InferWriteDataInput<TStorage>
      : THeadEncodeDataInput,
    $IsUnknown<THeadDecodeDataOutput> extends true
      ? $InferReadDataOutput<TStorage>
      : THeadDecodeDataOutput,
    $IsUnknown<THeadEncodeChunkInput> extends true
      ? $InferWriteChunkInput<TStorage>
      : THeadEncodeChunkInput,
    $IsUnknown<THeadDecodeChunkOutput> extends true
      ? $InferReadChunkOutput<TStorage>
      : THeadDecodeChunkOutput,
    TLastDecodeDataInput,
    TLastEncodeDataOutput,
    TLastDecodeChunkInput,
    TLastEncodeChunkOutput,
    true
  >;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export default class UniKvsBranch {
  public constructor() {
    branchStates.set(this, {
      middlewares: [],
      destinations: [],
    });
  }

  public fork(branch: IUniKvsBranch): this {
    const state = branchStates.get(this)!;
    const prefix = [...state.middlewares];
    const destinations = getBranchDestinationsForFork(branch);
    for (const dest of destinations) {
      state.destinations.push({
        storage: dest.storage,
        // fork 時点の親チェーンを接頭辞として各分岐先の先頭に付け、ブランチのミドルウェアを結合します。
        middlewares: [...prefix, ...dest.middlewares],
      });
    }

    return this;
  }

  public use(middleware: IMiddleware): this {
    const state = branchStates.get(this)!;
    state.middlewares.push(UniKvsMiddleware.from(middleware));

    return this;
  }

  public persist(storage: IStorage): this {
    const state = branchStates.get(this)!;
    state.destinations.push({
      storage: UniKvsStorage.from(storage),
      // 登録時点のチェーンをスナップショットして保持するため、以降の use はこの登録に影響しません。
      middlewares: [...state.middlewares],
    });

    return this;
  }
}
