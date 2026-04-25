/**
 * 同期的な値、または PromiseLike な非同期の値を許容するラップ型です。
 *
 * 非同期処理を伴う可能性がある関数の戻り値や引数の定義に利用します。
 *
 * @template T 解決される値の型です。
 */
export type MaybePromise<T> = T | PromiseLike<T>;
