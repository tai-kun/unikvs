# UniKVS

[Document](https://tai-kun.github.io/unikvs/)

## 使い始め

[mise](https://mise.jdx.dev/) をインストールし、リポジトリーのルートで次を実行します。

```sh
mise init
```

プロジェクト名や GitHub リポジトリー名、使用するパッケージなどを対話形式で設定します。引数については `mise init --help` を確認してください。

初期化すると、テンプレートのパッケージは `scripts/templates/` に保持され、選択したパッケージだけが `packages/` に複製されます。`scripts/init/`・`scripts/create/`・`scripts/lib/`・`scripts/templates/` には `.gitignore` が作成され、Git の管理対象外になります（ファイルは残ります）。

## パッケージの追加

初期化後に `mise create` を実行すると、`scripts/templates/` に保持したテンプレートからパッケージを追加できます。

```sh
mise create
```

引数については `mise create --help` を確認してください。
