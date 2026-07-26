# 古墳めぐり — Kofun Atlas of Japan

全国の古墳を、地図・写真・歴史の入口・クイズで探せる静的サイトです。Haskellでサイトを生成し、GitHub Pagesへ公開します。

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

GHC 9.8以降と cabal-install を使用します。

```sh
cabal update
cabal run kofun-build
python3 -m http.server 8000 --directory docs
```

`http://localhost:8000/` を開いて確認します。Pythonはプレビュー用HTTPサーバーだけに使い、サイト生成はHaskellが行います。

## データを更新する

Node.js 20以降、ImageMagick、ネットワーク接続が必要です。

```sh
node scripts/sync-data.mjs
cabal run kofun-build
```

同期処理はWikimediaのアクセス方針に従い、識別可能なUser-Agent、50画像ごとのメタデータ取得、固定スナップショットを採用しています。ビルドのたびに外部APIへ大量アクセスはしません。

## GitHub Pages

`main` ブランチへのpushで `.github/workflows/pages.yml` がHaskell生成器を実行し、`docs/` をGitHub Pagesへデプロイします。

## 正確性と訪問時の注意

位置や説明は共同編集データを含み、最新の調査成果・現況と異なる場合があります。現地を訪れる前に自治体や文化財所管機関の情報を確認し、私有地・立入禁止区域へ入らず、墳丘や遺物を傷つけないでください。

