import { FastUtf8 } from "fast-utf8";
import filenameReservedRegex, { windowsReservedNameRegex } from "filename-reserved-regex";

const FILENAME_RESERVED_REGEX = /*#__PURE__*/ filenameReservedRegex();

const WINDOWS_RESERVED_NAME_REGEX = /*#__PURE__*/ windowsReservedNameRegex();

const MAX_BYTES = 255;

const utf8 = /*#__PURE__*/ new FastUtf8({
  strict: true,
  ignoreBOM: true,
  allocateSize: MAX_BYTES,
});

/**
 * 与えられた文字列が、主要なオペレーティングシステム（Windows, macOS, Linux）において正当なファイル名として使用可能かどうかを判定します。
 *
 * @param filename 検証対象となるファイル名の文字列です。
 * @returns ファイル名として妥当な場合は true、そうでない場合は false を返します。
 * @see https://github.com/sindresorhus/valid-filename/blob/main/index.js
 */
export default function isValidFilename(filename: string): boolean {
  // 文字列そのものがファイル名として成立しない特定のパターン（空文字、カレントディレクトリー、親ディレクトリー）を拒否します。
  if (filename === "" || filename === "." || filename === "..") {
    return false;
  }

  // バイト数が MAX_BYTES を超えている場合は不当と判断します。
  const encoded = utf8.encode(filename);
  if (encoded.length > MAX_BYTES) {
    return false;
  }

  // エンコードしたデータを再デコードし、元の文字列と一致するか確認することで、BOM が含まれていないかを検証します。
  if (utf8.decode(encoded) !== filename) {
    return false;
  }

  // macOS のファイルシステム（HFS+ / APF）との互換性を保つため、NFD 形式（正準分解）での正規化状態を確認します。
  if (filename.normalize("NFD") !== filename) {
    return false;
  }

  // Windows や Linux で一般的に利用される NFC 形式（正準結合）での正規化状態を確認します。
  if (filename.normalize("NFC") !== filename) {
    return false;
  }

  // Unix 系や Windows で使用が禁止されている制御文字や特殊記号を確認します。
  if (FILENAME_RESERVED_REGEX.test(filename)) {
    return false;
  }

  // Windows においてシステム予約されている名称（LPT1 や COM1 など）に合致しないか確認します。
  if (WINDOWS_RESERVED_NAME_REGEX.test(filename)) {
    return false;
  }

  // macOS の Finder 等の UI 上では、ファイル名に含まれる「:」が「/」として扱われる、あるいはその逆の変換が発生し、予期せぬ動作を招く恐れがあるため「:」を明示的に拒否します。
  if (filename.indexOf(":") >= 0) {
    return false;
  }

  return true;
}
