# 古墳めぐり — Kofun Atlas of Japan

全国の古墳を、地図・写真・歴史の入口・クイズで探せる静的サイトです。Haskellでサイトを生成し、GitHub Pagesへ公開します。

- サイト: <https://hjosugi.github.io/kofun-photo/>
- 開発者向けページ: <https://hjosugi.github.io/kofun-photo/developers.html>
- 詳細な技術資料: [DEVELOPERS.md](DEVELOPERS.md)

## できること

- 古墳名・都道府県・古墳群・説明文の横断検索
- OpenStreetMap上での位置確認と、地図／一覧表示の切り替え
- 画像・360度パノラマ・出典別の絞り込み
- 日替わりの「今日の古墳」
- 掲載データから毎回つくられる全5問の KOFUN QUIZ
- 画像ごとの作者・ライセンス・元ページ表示

## データの範囲

同じ「古墳データ」でも再利用条件は同じではありません。本リポジトリへ収録するのは、再利用条件が明確なデータだけです。

| 取得元 | 収録内容 | 条件 |
| --- | --- | --- |
| [Wikidata](https://www.wikidata.org/) | 名称、座標、短い説明、関連リンク | CC0 |
| [Wikimedia Commons](https://commons.wikimedia.org/) | 画像、作者、個別ライセンス | 画像ごとに CC0 / CC BY / CC BY-SA 等 |
| [TeamTest57/Kofun360](https://github.com/TeamTest57/Kofun360) | 座標、360度写真 | CC0 |
| [OpenStreetMap](https://www.openstreetmap.org/) | 背景地図 | © OpenStreetMap contributors / ODbL |

次の大規模データベースは、非常に有用ですが再配布許諾が確認できないため複製していません。サイトから公式検索へ直接移動できます。

- [奈良女子大学 全国古墳データベース](https://zenkoku-kofun.nara-hgis.jp/) — 6,799件、All Rights Reserved
- [古墳マップ](https://kofun.info/spots/search) — 7,104件・写真39,128枚（2026-07-26確認）、無断転載禁止
- [文化財総覧WebGIS](https://heritagemap.nabunken.go.jp/) — 全国の文化財関連情報約61万件

大学・運営者から再配布許諾を得たデータは、`data/kofun.json` と同じスキーマへ変換することで追加できます。

## ローカルで動かす

Nix Flakesを使用すると、GHC、Cabal、Node.js、ImageMagick、Python、Nix formatterをまとめて再現できます。

```sh
nix develop
nix run .#build-site
python3 -m http.server 8000 --directory docs
```

`http://localhost:8000/` を開いて確認します。`nix run`はHaskell生成器を実行します。direnvを使う場合は、初回に`direnv allow`を実行してください。

静的サイトをNix storeへ再現可能な成果物として作る場合は、次を実行します。

```sh
nix build .#site
```

Nixを使わない場合は、GHC 9.8以降とcabal-installを用意して`cabal run kofun-build`を実行できます。

## アーキテクチャ

更新時と閲覧時を分離した、バックエンド不要の静的構成です。

```text
Wikidata / Commons / Kofun360
              │
              ▼
 scripts/sync-data.mjs ── 取得・正規化・権利情報の保存
              │
              ▼
      data/kofun.json ─── 版管理する正規スナップショット
              │
              ▼
 Nix + Haskell build ─── 型付き検証・件数集計・HTML生成
              │
              ▼
          docs/ ───────── GitHub Pages静的成果物
              │
              ├── Leaflet地図・全文検索
              ├── 今日の古墳・詳細表示
              └── Pannellum・KOFUN QUIZ
```

`flake.lock`がGHCを含むツールチェーンを固定し、Haskell生成器がJSONの必須フィールド、重複ID、WGS84座標範囲、画像と360°フラグの整合性を検証します。外部APIは明示的なデータ更新時だけ使用し、通常ビルドと閲覧時には呼びません。

実装理由、データスキーマ、同期規則、ブラウザ内の状態管理、CI権限、拡張方針は[開発者ガイド](DEVELOPERS.md)にまとめています。

## データを更新する

Nix開発シェルとネットワーク接続が必要です。

```sh
nix develop -c node scripts/sync-data.mjs
nix run .#build-site
```

同期処理はWikimediaのアクセス方針に従い、識別可能なUser-Agent、50画像ごとのメタデータ取得、固定スナップショットを採用しています。ビルドのたびに外部APIへ大量アクセスはしません。

## GitHub Pages

リポジトリ設定でPagesのSourceを「GitHub Actions」にすると、`main` ブランチへのpushで `.github/workflows/pages.yml` が`nix flake check`とHaskell生成器を実行し、`docs/`をGitHub Pagesへデプロイします。

## 正確性と訪問時の注意

位置や説明は共同編集データを含み、最新の調査成果・現況と異なる場合があります。現地を訪れる前に自治体や文化財所管機関の情報を確認し、私有地・立入禁止区域へ入らず、墳丘や遺物を傷つけないでください。
