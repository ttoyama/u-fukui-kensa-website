# 福井大学医学部附属病院 検査部 ホームページ

Astro + Tailwind CSS v4 の静的サイト。姉妹サイト [u-fukui-kidney-website](https://github.com/ttoyama/u-fukui-kidney-website) を雛形にしている。

現在は本番サーバ未契約のため、Mac mini で学内LANに仮公開して意見を集めている。

## 開発

```bash
npm install        # 初回のみ
npm run dev        # 開発サーバ（http://localhost:4321）
npm run build      # dist/ に静的ビルド
```

## コンテンツの更新

| 内容 | ファイル |
|---|---|
| お知らせ | `src/data/news.json` |
| スタッフ | `src/data/staff.json` |
| 部門紹介 | `src/data/divisions.json` |
| 研究テーマ | `src/data/research.json` |
| ナビゲーション | `src/data/navigation.ts` |
| 研究業績 | `npm run sync-achievements` で自動生成（下記） |

### 研究業績の同期

`../fukui-jin-gyouseki/data` から、`members.json` の `departments` に「検査部」を含むメンバーの業績を抽出して `src/data/achievements.json` を生成する。

```bash
npm run sync-achievements
npm run build
```

除外条件: 非公開（`is_public: false`）、本学以外の業績（`non_university_achievement: 20`）。

## Mac mini 仮運用

```bash
npm run build
bash scripts/serve.sh 8080   # 手動起動（Ctrl+Cで停止）
```

学内から `http://<Mac miniのIP>:8080` で閲覧できる。

常駐させる場合は launchd を使う（`scripts/jp.ac.u-fukui.kensa-website.plist` のコメント参照）。

更新の反映は「データ編集 → `npm run build`」のみ。配信は dist/ を直接読むため再起動不要。

## 本番デプロイ

本番サーバ契約後に `astro.config.mjs` の `site` を確定し、kidney サイトの `scripts/deploy.sh` 方式を移植する予定。
