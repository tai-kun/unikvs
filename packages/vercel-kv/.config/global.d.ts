declare const __DEBUG__: boolean;
declare const __CLIENT__: boolean;
declare const __SERVER__: boolean;

// `Array.isArray` の型絞り込み機能を強化します。
// @ts-ignore
// oxlint-disable
declare module globalThis {
  interface ArrayConstructor {
    isArray(arg: readonly any[] | any): arg is readonly any[];
  }
}

// `@vercel/kv` は任意の依存関係です。
// 注入クライアントなしで `url`/`token` から生成する場合にのみ動的 import します。
// 型解決のため用途を限定した簡易宣言を用意します。
declare module "@vercel/kv" {
  export function createClient(config: { url: string; token: string }): unknown;
}
