// fukui-jin-gyouseki の業績データから検査部の論文を抽出し、
// 年度別にまとめて src/data/achievements.json を生成する。
//
// 使い方: node scripts/sync-achievements.mjs
// 前提: ../fukui-jin-gyouseki が同じ親ディレクトリに存在すること。

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const gyousekiData = join(root, '../fukui-jin-gyouseki/data');

const DEPARTMENT = '検査部';

// 編集用データ（DOI をキー）。論文データとは分けて管理する。
//   notes    … 1行解説
//   titlesJa … 日本語タイトル（英語論文で title_ja が未翻訳のもの用）
const notesPath = join(root, 'src/data/achievement-notes.json');
const notesFile = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf-8')) : {};
const notes = notesFile.notes ?? {};
const titlesJa = notesFile.titlesJa ?? {};

// 配列でも { papers: [...] } でも受け取れるようにする
function toArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  const vals = Object.values(raw ?? {});
  return Array.isArray(vals[0]) ? vals[0] : [];
}

// 1. 検査部メンバーの member_id を集める
const membersRaw = JSON.parse(readFileSync(join(gyousekiData, 'members.json'), 'utf-8'));
const members = toArray(membersRaw, ['members']);
const deptMembers = members.filter((m) => {
  const deps = m.departments ?? m.department ?? [];
  const depArr = Array.isArray(deps) ? deps : [deps];
  return depArr.includes(DEPARTMENT);
});
const deptIds = new Set(deptMembers.map((m) => m.member_id));
// member_id（例: toyama_tadashi）を [姓, 名] のローマ字ペアにする。
// 同姓の別人を誤って拾わないよう、姓名の両方一致で判定する。
const deptNamePairs = deptMembers.map((m) => {
  const [surname, given] = m.member_id.toLowerCase().split('_');
  return { surname, given };
});

// 著者名トークン（例: "Tadashi Toyama"）が検査部メンバー本人かどうかを
// 姓・名の両方一致で判定する。略記（"Toyama T" 等）は一致しないため太字にならない。
function isDeptAuthor(authorToken) {
  if (!authorToken) return false;
  const words = new Set(authorToken.toLowerCase().split(/[\s.,]+/).filter(Boolean));
  return deptNamePairs.some((p) => words.has(p.surname) && words.has(p.given));
}

// 著者名から末尾の所属番号（"Yusuke Nakade 1 2" 等）を除き、空白を整える
function cleanAuthorName(s) {
  return s
    .replace(/[\s ]*\d[\d\s ]*$/, '')
    .replace(/[\s ]+/g, ' ')
    .trim();
}

// 日本語（ひらがな・カタカナ・漢字）を含むか
function hasJapanese(s) {
  return /[ぁ-んァ-ヶ一-龯]/.test(s || '');
}

// authors_en（"Firstname Lastname, ..."）を著者ごとに分け、
// 検査部メンバーかどうかのフラグを付ける（表示時に太字にする用）
function splitAuthors(authorsEn) {
  return (authorsEn || '')
    .split(',')
    .map((s) => cleanAuthorName(s))
    .filter(Boolean)
    .map((name) => ({ name, dept: isDeptAuthor(name) }));
}

// 学会発表の著者は日本語名。検査部メンバーの日本語フルネーム（姓＋名、空白除去）で照合する。
const deptJaNames = new Set(
  deptMembers
    .map((m) => `${m.name_ja?.last_name ?? ''}${m.name_ja?.first_name ?? ''}`)
    .filter(Boolean),
);
function normalizeJa(s) {
  return (s || '').replace(/[\s　]+/g, '');
}
// authors_ja（"姓 名，姓 名，..."）を著者ごとに分け、検査部メンバーを判定する
function splitAuthorsJa(authorsJa) {
  return (authorsJa || '')
    .split(/[，,、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, dept: deptJaNames.has(normalizeJa(name)) }));
}

// 2. 論文を読み、検査部メンバー かつ 公開可 のものを年度別に集める
const papersDir = join(gyousekiData, 'published_papers');
const byYear = new Map();
let excluded = 0;
let excludedNonUniv = 0;
for (const file of readdirSync(papersDir).filter((f) => f.endsWith('.json'))) {
  const recs = toArray(JSON.parse(readFileSync(join(papersDir, file), 'utf-8')), ['papers', 'published_papers']);
  for (const p of recs) {
    if (!deptIds.has(p.member_id)) continue;
    if (p.is_public === false || p.hp_publish_code === 0) {
      excluded++;
      continue;
    }
    // 本学以外の業績（前任地の業績など）は載せない（20=本学以外）
    if (p.non_university_achievement === 20) {
      excludedNonUniv++;
      continue;
    }
    const fy = String(p.fiscal_year ?? (p.publication_date ?? '').slice(0, 4));
    if (!fy || fy === 'undefined') continue;
    if (!byYear.has(fy)) byYear.set(fy, []);
    byYear.get(fy).push({
      titleEn: p.title_en || '',
      // 日本語タイトル: achievement-notes.json の titlesJa（編集済み・である調）を
      // 最優先で使い、無ければ元データの title_ja（日本語を含む場合のみ）を使う。
      titleJa: titlesJa[p.doi] || titlesJa[p.id] || (hasJapanese(p.title_ja) ? p.title_ja : ''),
      // 日本語論文か（language='ja' または language_code=2）
      isJapanese: p.language === 'ja' || p.language_code === 2,
      // 1行解説。achievement-notes.json に DOI で登録があれば反映する
      summary: notes[p.doi] || '',
      authors: splitAuthors(p.authors_en),
      journal: p.journal_name_en || p.journal_name_ja || '',
      volume: p.volume || '',
      issue: p.issue || '',
      page: p.start_page || '',
      date: p.publication_date || '',
      doi: p.doi || '',
    });
  }
}

// 3. 学会発表を読み、検査部メンバー かつ 公開可 のものを年度別に集める
const presDir = join(gyousekiData, 'presentations');
const presByYear = new Map();
if (existsSync(presDir)) {
  for (const file of readdirSync(presDir).filter((f) => f.endsWith('.json'))) {
    const recs = toArray(JSON.parse(readFileSync(join(presDir, file), 'utf-8')), ['presentations']);
    for (const p of recs) {
      if (!deptIds.has(p.member_id)) continue;
      if (p.is_public === false) continue;
      // 本学以外の業績は載せない
      if (p.non_university_achievement === 20) continue;
      const fy = String(p.fiscal_year ?? (p.presentation_date ?? '').slice(0, 4));
      if (!fy || fy === 'undefined') continue;
      if (!presByYear.has(fy)) presByYear.set(fy, []);
      presByYear.get(fy).push({
        title: p.title_ja || p.title_en || '(タイトル未登録)',
        // authors_ja があれば優先、なければ authors_en にフォールバック（国際学会で日本語著者欄が無い場合に対応）
        authors: p.authors_ja ? splitAuthorsJa(p.authors_ja) : splitAuthors(p.authors_en),
        conference: p.conference_name_ja || p.conference_name_en || '',
        venue: p.venue || '',
        date: p.presentation_date || '',
        isInternational: !!p.is_international,
      });
    }
  }
}

// 4. 年度降順・年度内は日付降順に並べる
function byYearDesc(map) {
  return [...map.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([fiscalYear, items]) => ({
      fiscalYear,
      items: items.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    }));
}
const papers = byYearDesc(byYear);
const presentations = byYearDesc(presByYear);

const total = papers.reduce((n, y) => n + y.items.length, 0);
const presTotal = presentations.reduce((n, y) => n + y.items.length, 0);
const out = { generatedAt: new Date().toISOString().slice(0, 10), papers, presentations };
writeFileSync(join(root, 'src/data/achievements.json'), JSON.stringify(out, null, 2) + '\n', 'utf-8');
console.log(`検査部メンバー: ${deptIds.size}名`);
console.log(`achievements.json 生成: 論文 ${total}件 / 学会発表 ${presTotal}件`);
console.log(`  除外: 非公開 ${excluded}件 / 本学以外の業績 ${excludedNonUniv}件`);
