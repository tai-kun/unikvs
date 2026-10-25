---
name: middleware-docs
description: UniKvs のミドルウェアプラグインのドキュメントを書くときに使用します。website/docs/packages/(middleware) 配下の .mdx における概要・使い方・データ型・エラー・注意事項の構成と定型文を定めます。
---

# Middleware Docs

UniKvs のミドルウェアプラグイン（`IMiddleware` 実装）のドキュメントを、統一された構成で書く・直すための規約です。

## 対象ファイル

- `website/docs/packages/(middleware)/**/*.mdx`（(encoding)・(serialization)・(integrity)・(dev) 配下）
- 仕様の根拠は `packages/<パッケージ名>/src/*.ts` から読み取ります。既存ドキュメントの記述を鵜呑みにしません。

## 全体構成

ページは次の見出しだけを持ちます。順序は固定です。

```md
## 概要 [#overview]

## 使い方 [#usage]

## データ型 [#data-types]

## エラー [#errors]
```

- 見出しには必ず `blume-docs` の規約どおりカスタム ID を付けます。
- 「エラー」の次に `## 注意事項 [#notes]` を置けますが、オプションです。非常にクリティカルなことがない限り付けません。
- フロントマターの `title`・`description` は維持します。
- ページ内リンクは `/packages/<name>` 形式にします（`/ja` 接頭辞は付けません）。同一ページ内は `#anchor`、同一グループ内は `./page#anchor` の相対リンクを使えます。

## 概要

- 1 文で概要を書きます（必須）。末尾に `<Badge>Middleware</Badge>` を付けます。実行環境の限定がある場合は `<Badge variant="warning">Node.js 専用</Badge>` を併記します。
- 用途を 1〜2 文で書きます（オプション）。
- 追加説明を箇条書きで書きます（オプション）。`name`・`isOpen`・対応環境などの固定振る舞いを列挙します。
- 目立つ追加説明をコールアウトで書きます（オプション）。`:::tip`・`:::note`・`:::warning` を使い分けます。
- 末尾は必ず次の定型文のあとにインストールコマンドを置きます（必須）。

````md
インストールは次のコマンドで行います。

```package-install
npm install @unikvs/<name>
```
````

- ピア依存がある場合はコマンドに含めます（例: `npm install @unikvs/checksum @noble/hashes@2.0.0`、`npm install @unikvs/debug @logtape/logtape`）。

## 使い方

- 1 文で概要を書きます（必須）。次の定型文を一字一句変えずに使います。

```md
<クラス名> は IMiddleware を実装しています。UniKvs には use() で渡します。
```

- `import` するだけのコードブロックを置きます（必須）。

```ts
import { Base64 } from "@unikvs/base64";
```

- コンストラクターに引数がある場合のみ、「コンストラクターの引数は次のとおりです。」のあとに引数を `TypeTable` コンポーネントで書きます（オプション）。引数なしのクラス（`Cbor`・`Json`・`Superjson`・`V8Serde`・`PassThrough`）ではこの一文ごと省略します。各行の `type` の先頭に `[#<id>]` を付けます（`typeTableDetailsIds` が行に ID を付けます。ID は英数字とハイフンのみで、ページ内で一意にします）。
- UniKvs を使った使用例だけを書きます。単体での `encode`・`decode` の使い方は不要です（必須）。
- 使用例のコードブロックの直前には「以下は、〜する例です。」の導入文を置きます。コードブロック直後の重複した説明文は付けません。

````md
以下は、書き込んだ値を base64 化して保存し、読み取り時に元のバイト列へ戻す例です。

```ts
import { Base64 } from "@unikvs/base64";
import { Memory } from "@unikvs/memory";
...
```
````

## データ型

- `encode`・`decode` の入出力の型と、対応していればストリームのチャンクの型を表で記載します（必須）。

```md
| メソッド       | 入力                      | 出力                      |
| -------------- | ------------------------- | ------------------------- |
| `encode`       | `Uint8Array<ArrayBuffer>` | `Uint8Array<ArrayBuffer>` |
| `decode`       | `Uint8Array<ArrayBuffer>` | `Uint8Array<ArrayBuffer>` |
| `getEncodable` | `Uint8Array<ArrayBuffer>` | `Uint8Array<ArrayBuffer>` |
| `getDecodable` | `Uint8Array<ArrayBuffer>` | `Uint8Array<ArrayBuffer>` |
```

- どのような変換が行われるのかを箇条書きで説明します（必須）。段落で書かないでください。
- チャンクは変換後、どのようなタイミングで、どのような区切りで接続されるのか（もしくは単純に結合か）を箇条書きで説明します（オプション）。段落で書かないでください。

## エラー

- 先頭に次の定型文を置きます（必須。パッケージ固有のエラーがある場合のみ。ない場合は定型文も置きません）。

```md
このパッケージが投げるエラーは次のとおりです。
```

- エラーごとに `### <エラークラス>` 見出しを置き、`#### 意味`（必須）・`#### 対処方法`（必須）・`#### 例`（オプション）の小見出しで分けます。

````md
### Base64DecodeError

#### 意味

入力を base64 として解釈できません。...

#### 対処方法

入力が base64 の連続か確認してください。...

#### 例

以下は、`Base64DecodeError` を捕捉する例です。

```ts
...
```
````

- `#### 例` はどのようなコードでエラーが出るかを示す場合のみ付けます。形式は「以下は、`<エラー>` を捕捉する例です。」＋コードブロックです。
- パッケージ固有のエラーがない場合（`compression`・`debug`・`passthrough`）は定型文も `###` 見出しも作らず、「このパッケージ固有のエラーはありません。」と書き、該当すればネイティブエラーの伝播を一文で補足します。
- ネイティブエラー（`TypeError`・`SyntaxError` など）が伝わる場合は、対応する `###` の末尾に一文で補足します。見出しは作りません。

## JSDoc

- 公開シンボル（クラス・型・メンバー）ごとに、API Reference へのリンクだけを書いた JSDoc を `packages/<パッケージ名>/src` に付けます（必須）。
- リンク形式は `[API Reference](https://tai-kun.github.io/unikvs/packages/<slug>#<anchor>)` です。
- 粒度はシンボルごとに1アンカー、メンバーごとに1アンカーです。既存の見出し・TypeTable 行で網羅できる箇所は再利用し、不足分はドキュメント側に `###` 見出しや TypeTable の行 ID を追加して合わせます。現在のドキュメントにリンクがあるかどうかで粒度を妥協しません。
- 名前空間の型エイリアスなど実体がある別名は、別名先ではなく実体のシンボルのアンカーを指します（別ページへのリンク可）。
- `oxlint-disable-next-line` と宣言の間に JSDoc を挟みません。JSDoc は disable コメントより前に置きます。
- JSDoc 追加後は `git diff` で URL 行以外の差分がないことを確認します。

## 仕様の調べ方

型・振る舞い・エラーは `packages/<name>/src` から読み取ります。

| 確認対象                                  | 読み取り箇所                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| クラス名・コンストラクター引数            | クラス定義と `*Options` 型                                                           |
| `encode`・`decode` の入出力・同期／非同期 | メソッドシグネチャー                                                                 |
| ストリームのチャンク型・結合方式          | `getEncodable`・`getDecodable` の `TransformStream` 型と `transform`・`flush` の実装 |
| エラークラス・送出条件                    | `errors.ts` と `throw` 箇所                                                          |
| `name`・`isOpen` の値、ピア依存           | クラス定義と `package.json`                                                          |

## 検証

- `website` ディレクトリーで `npx blume validate` を実行し、リンク切れがないことを確認します。
- `website` ディレクトリーで `npx blume build --isolated` を実行し、ビルドが成功することを確認します（dev サーバー起動中は `--isolated` が必須です）。
- JSDoc の URL に対応する `id` が生成 HTML にあることを確認します。
- 対象パッケージのテスト（`vp test run packages/<name>`）と `vp check --fix` を実行します。

## ガイドライン

### 推奨

- 定型文は一字一句変えずに使います。
- 使用例・エラーの例の前には必ず「以下は、〜する例です。」／「以下は、`<エラー>` を捕捉する例です。」を置きます。
- データ型の説明文は箇条書きにし、段落で書かないでください。
- 文章は `japanese` スキルに従い、ですます調で書きます（体言止め不可）。推敲には `yomiyasu` スキルを使います。
- 図（`mermaid`）のラベルに `/` や `@` などの特殊文字が入るときは、`A["label"]` のようにクォートします。

### 非推奨

- 全体構成以外の見出し（ストリーム・使用例・注意点など）を追加しないでください。
- 単体での `encode`・`decode` 使用例を「使い方」に書かないでください（エラーの「例」を除く）。
- データ型を `TypeTable` で書かないでください。表を使います。
