# unikvs モノレポの指針

unikvs は TypeScript で実装されたモジュラーでポータブルな KVS クライアントです。

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
mise run test:typecheck   # npx tsc --noEmit

# フォーマット
mise run format

# ビルド
npm run build
mise run update
```

## リンティング、型チェック、フォーマット

- 型エラーがない場合は、ランダムにキャストしないでください（たとえば、`as any`)。 型を検証するには `mise run test:typecheck` を実行します。
- 変更内容がリンティングに合格していることを確認します。検証するには `mise run lint` を実行します。

## テスト

- テストフレームワークに Vitest を使用します。
- テストファイルのパターンは、`*.test.ts` (ブラウザー/サーバー共通)、`*.client.test.ts` (ブラウザー専用)、`*.server.test.ts` (サーバー専用) のいずれか 1 つです。
- クライアントテストは、Vitest の Browser Mode を利用して実際の Playwright ブラウザー上で実行します。
- CI がデバッグモードであれば コンパイル時定数 `__DEBUG__` は true になります。手動でデバッグモードにするには環境変数 `DEBUG` を `1` に設定します。
- コンパイル時定数 `__CLIENT__` と `__SERVER__` はそれぞれ真偽値でテストのランタイムを示します。

## ビルドおよび型チェックに関する注意点

- すべての tsconfig で `erasableSyntaxOnly: true` を有効化 (`enum` や 型定義以外の宣言を含む `namespace` の使用、パラメータープロパティーなどの、実行時にコードが生成される構文は使用不可) されています。

## エラー

これらの指針は、公開パッケージによってスローされるエラーにのみ適用されます。

すべてのエラーメッセージは次のものでなければなりません:

1. **何が起こったのかを話す** - 問題を明確に説明します。
2. **なぜそれが問題なのかを述べてください** - 結果を説明してください。
3. **解決方法を示す** - 実用的なガイダンスを提供します。
