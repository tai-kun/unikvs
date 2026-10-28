import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest } from "vite-plus/test";

import { type ErrorOptions, ErrorBase } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 *
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
export const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

export type KeyNotFoundErrorArgs = {
  readonly key: string;
};

/**
 * 言語ごとのメッセージ登録と解決を検証するためのサンプルエラーです。
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorArgs> {
  static {
    this.prototype.name = "KeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `Key not found: ${key}`, options);
  }
}
