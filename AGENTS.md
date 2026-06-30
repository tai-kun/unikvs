# unikvs モノレポの指針

unikvs は TypeScript で実装されたモジュラーでポータブルな KVS クライアントです。

## 使用感

```ts
import { Compression } from "@unikvs/compression";
import { FileSystem } from "@unikvs/fs.node";
import { UniKvs, type Value } from "unikvs";

const kvs = UniKvs.config<{
  // キー "foo" に対して、バイト配列を単体またはストリーム形式で保存できることを型定義します。
  foo: Value<Uint8Array<ArrayBuffer>>;
}>()
  // バイト配列を透過的に gzip 圧縮/展開するトランスフォーマープラグインを追加します。
  .appendTransformer(new Compression("gzip"))
  // バイト配列を ".tmp/" 配下に保存するストレージプラグインを追加します。
  .appendStorage(new FileSystem(".tmp"))
  // KVS クライントを作成します。
  .create();

// クライアントを開きます。
await kvs.open();

// キー "foo" に単一のバイト配列を保存します。
await kvs.set("foo", Uint8Array.from([0, 1, 2]));

// キー "foo" から単一のバイト配列を取得します。
const bytes = await kvs.get("foo");

// クライアントを閉じます。
await kvs.close();
```

## プロジェクトの構成

- メインパッケージは `unikvs/` にあります。
- プラグインを含む全パッケージで共有して使用されるコアパッケージは `packages/core` にあります。
- 一部のプラグインなどで使用される可能性のある共有ユーティリティーは `packages/utils` にあります。
- バイト配列を指定の形式で透過的に圧縮/展開するトランスフォーマープラグインは `packages/compression` にあります。
- バイト配列を指定の形式で透過的にハッシュ値を計算し、期待するハッシュ値と一致するか検証するトランスフォーマーは `packages/checksum` にあります。
- バイト配列を Node.js でローカルに保存するストレージプラグインは `packages/fs.node` にあります。
- 任意のデータをブラウザーの IndexedDB に保存するストレージプラグインは `packages/indexeddb` にあります。
- 任意のデータをメモリー上に保存するストレージプラグインは `packages/memory` にあります。
- バイト配列をブラウザーの OPFS に保存するストレージプラグインは `packages/opfs` にあります。
- バイト配列を Node.js で S3 互換のオブジェクトストレージに保存するストレージプラグインは `packages/s3.node` にあります。
- テスト用の一時コンテナーを作成する内部パッケージは `packages/testcontainer` にあります。
- モノレポルートの設定ファイル (oxfmt, mise) は `.config/` にあります。
- 各パッケージのほとんどの設定ファイル (tsconfig, vitest, oxlint, oxfmt, mise) は、パッケージディレクトリーから見て `.config/` にあります。

## コマンド

```sh
# 完全なテスト (順番: server vitest → client vitest → format → lint → typecheck)
mise run test

# 個々のステップ
mise run test:server      # npx vitest --config ./.config/vitest.server.ts
mise run test:client      # npx vitest --config ./.config/vitest.client.ts
mise run test:format      # npx oxfmt --check
mise run test:lint        # npx oxlint
mise run test:typecheck   # npx tsc --noEmit (5 つの tsconfig プロジェクト)

# フォーマット
mise run format

# ビルド
npm run build

# 依存関係の更新 (npm-check-upates → pnpm install → playwright install)
mise run update
```

## 言葉遣い

- 日本語の文章は、テストケースを除き、「です・ます調」とし、必ず句点で終えます。
- 不必要にカタカナ語を使いません。。例えば「スローする」は「投げる」とします。

## コード規約

- 高品質な TSDoc と必要最低限の実装コメントの付与を心がけます。`@param <パラメーター名>` の直後にハイフン（-）を付けません。
- 必要に応じて、読み手がコードの背景、意図、ロジックを即座に理解できる、簡潔かつ丁寧な技術解説を提供します。
- エディター上の視認性を理由に、文章の途中や句読点で改行しません。

## リンティング、型チェック、フォーマット

- 型エラーがない場合は、ランダムにキャストしないでください（たとえば、`as any`)。 型を検証するには `mise run test:typecheck` を実行します。
- 変更内容がリンティングに合格していることを確認します。検証するには `mise run lint` を実行します。

## テスト

- テストファイルのパターンは、`*.test.ts` (ブラウザー/サーバー共通)、`*.client.test.ts` (ブラウザー専用)、`*.server.test.ts` (サーバー専用) のいずれか 1 つです。
- クライアントテストは、Vitest の Browser Mode を利用して実際の Playwright ブラウザー上で実行します。
- CI がデバッグモードであれば コンパイル時定数 `__DEBUG__` は true になります。手動でデバッグモードにするには環境変数 `DEBUG` を `1` に設定します。
- コンパイル時定数 `__CLIENT__` と `__SERVER__` はそれぞれ真偽値でテストのランタイムを示します。
- テストケースは簡潔にまとめます。
- テストは実装ではなく仕様・振る舞いを表現します。。
- リファクタリング耐性を重視します。。
- 1 test = 1 振る舞いです。
- 失敗原因が分かりやすいテストを書きます。
- テストコード自体が仕様書として読めます。
- 機能のテスト以外にも、空の入力、境界値、エラー処理のテストも含めます。
- 実際の実装に対してテストし、モジュールをモックしません。
- Vitest を使用する。
- `describe` は文脈、`test` は振る舞いを表現します。`it` は使用しません。
- AAA（Arrange / Act / Assert）を基本とし、`// 準備`、`// 実行`、`// 検証`（または `// 準備と実行`、`// 実行と検証`）で区切ります。
- テストのコールバックでは、トップレベルのインポートではなく、分割代入した `{ expect }` パラメーターを使用します。

## ビルドおよび型チェックに関する注意点

- すべての tsconfig で `erasableSyntaxOnly: true` を有効化 (`enum` や 型定義以外の宣言を含む `namespace` の使用、パラメータープロパティーなどの、実行時にコードが生成される構文は使用不可) されています。

## エラー

これらの指針は、公開パッケージによってスローされるエラーにのみ適用されます。

すべてのエラーメッセージは次のものでなければなりません:

1. **何が起こったのかを話す** - 問題を明確に説明します。
2. **なぜそれが問題なのかを述べてください** - 結果を説明してください。
3. **解決方法を示す** - 実用的なガイダンスを提供します。
