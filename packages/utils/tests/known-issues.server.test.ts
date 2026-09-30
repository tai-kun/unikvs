import { describe, test } from "vitest";

import chunks from "../src/chunks.js";
import isValidFilename from "../src/is-valid-filename.js";

/**
 * 実装と仕様の乖離を test.fails で記録します。
 * 実装が修正されると「予期せぬ成功」として失敗するため、修正時にテストを更新できます。
 */
describe("既知の不具合 (server)", () => {
  test.fails("NaN のチャンクサイズでも最低 1 バイトずつ返す", ({ expect }) => {
    // 準備
    const data = new Uint8Array([1, 2, 3]);

    // 実行: 現在は Math.max(1, Math.floor(NaN)) が NaN になり、空チャンク 1 つで全データが失われる
    const result = [...chunks(data, Number.NaN)];

    // 検証
    expect(result).toStrictEqual([new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
  });

  test.fails("BOM を含むファイル名を拒否する", ({ expect }) => {
    // 実行と検証: fast-utf8 を ignoreBOM: true で使うため、現在はエンコード→デコードで一致してしまう
    expect(isValidFilename("\uFEFFfoo.txt")).toBe(false);
    expect(isValidFilename("a\uFEFFb")).toBe(false);
  });
});
