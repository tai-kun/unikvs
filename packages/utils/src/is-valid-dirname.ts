import isValidFilename from "./is-valid-filename.js";

/**
 * 与えられた文字列が、主要なオペレーティングシステム（Windows, macOS, Linux）において正当なディレクトリー名として使用可能かどうかを判定します。
 *
 * @param filename 検証対象となるディレクトリー名の文字列です。
 * @returns ディレクトリー名として妥当な場合は true、そうでない場合は false を返します。
 * @see {@link isValidFilename}
 */
export default function isValidDirname(dirname: string): boolean {
  return isValidFilename(dirname);
}
