// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// DEPLOY_TARGET=production で本番サーバ向けにビルドする（本番サーバは未契約、URL 決定後に差し替える）。
// 既定は base '/'（Mac mini 仮運用・ローカル確認用）。
const isProd = process.env.DEPLOY_TARGET === 'production';

// https://astro.build/config
export default defineConfig({
  site: isProd ? 'https://kensa.med.u-fukui.ac.jp' : undefined,
  base: '/',
  vite: {
    plugins: [tailwindcss()]
  }
});
