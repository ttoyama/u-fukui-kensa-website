// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// ビルド先の切替:
//   DEPLOY_TARGET=production … 本番サーバ（未契約、URL 決定後に差し替える）
//   GITHUB_PAGES=true        … GitHub Pages（暫定公開・検索除外）
//   既定                      … base '/'（Mac mini 仮運用・ローカル確認用）
const isProd = process.env.DEPLOY_TARGET === 'production';
const isPages = process.env.GITHUB_PAGES === 'true';

// https://astro.build/config
export default defineConfig({
  site: isProd
    ? 'https://kensa.med.u-fukui.ac.jp'
    : isPages
      ? 'https://ttoyama.github.io'
      : undefined,
  base: isPages ? '/u-fukui-kensa-website/' : '/',
  vite: {
    plugins: [tailwindcss()]
  }
});
