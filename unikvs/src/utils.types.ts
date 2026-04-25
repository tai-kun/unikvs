/**
 * オブジェクトのプロパティー値の型のユニオン型を抽出するユーティリティー型です。
 *
 * @template T 対象となるオブジェクトの型です。
 */
export type ValueOf<T> = T[keyof T];
