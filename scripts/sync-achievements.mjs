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

// 兼任者（腎臓病態内科学と検査部の両方に属する人）の業績は、そのままだと
// 腎臓内科名義のものまで検査部のページに出てしまう。業績データに名義の区別が
// 無いので、「検査部だけに属するスタッフが著者に入っているか」で判定する。
// 入っていれば検査部の仕事、いなければ腎臓内科の仕事とみなす。
const dualIds = new Set(
  members
    .filter((m) => {
      const deps = m.departments ?? m.department ?? [];
      const depArr = Array.isArray(deps) ? deps : [deps];
      return depArr.includes(DEPARTMENT) && depArr.length > 1;
    })
    .map((m) => m.member_id)
);
const soloMembers = deptMembers.filter((m) => !dualIds.has(m.member_id));
const soloNamesJa = soloMembers
  .map((m) => `${m.name_ja?.last_name ?? ''}${m.name_ja?.first_name ?? ''}`)
  .filter((x) => x.length > 1);
const soloNamePairs = soloMembers.map((m) => {
  const [surname, given] = m.member_id.toLowerCase().split('_');
  return { surname, given };
});

// 検査部専任のスタッフが著者に含まれるか
function hasSoloStaff(rec) {
  const ja = rec.authors_ja || rec.presenters_ja || '';
  if (soloNamesJa.some((n) => ja.includes(n))) return true;
  const en = (rec.authors_en || '').toLowerCase();
  return soloNamePairs.some((p) => en.includes(p.surname) && en.includes(p.given));
}

// 学会名・誌名から検査部の仕事かを見る。兼任者の業績を仕分けるために使う。
const KENSA_WORDS = [
  '臨床検査', '臨床化学', '医学検査', '病理集談会', '臨床衛生検査', '検査医学',
  '医療機器学会', '医療検査科学', '超音波検査', '超音波医学', '臨床微生物',
  '検査血液学', '輸血', '細胞治療', '臨床工学', '感染症学', '環境感染',
  '一般検査', '精度管理', 'ハイパーサーミア', 'CVT', '術中画像情報',
  '臨床神経生理', '静脈学会', 'Venous', '神経生理', '脈管',
];
const NEPHRO_WORDS = [
  '腎臓学会', '透析医学会', 'Kidney', 'Nephrol', '腎不全', '糸球体', '腎と',
  '内科学会', '高血圧学会', '糖尿病学会', '腎臓病', 'Renal', 'Dialysis',
  'CEN Case', 'Nephron', 'Apheresis', '透析', '腎移植', '血液浄化',
];
function venueWords(rec) {
  return [rec.conference_name_ja, rec.conference_name_en,
          rec.journal_name_ja, rec.journal_name_en].filter(Boolean).join(' ');
}

// この業績を検査部のページに載せるか
//
// 業績データには名義（腎臓内科なのか検査部なのか）が入っていない。兼任者
// （木村・遠山・髙橋）はそのままだと腎臓内科の仕事まで検査部のページに出るので、
// 次の順で判定する。判定できないものは載せない。誤って他部門の業績を
// 載せるより、取りこぼすほうがましという判断。
function belongsToDept(rec) {
  if (!dualIds.has(rec.member_id)) return true;   // 検査部専任の業績はそのまま
  const w = venueWords(rec);
  // 腎臓・透析系の学会や雑誌は、兼任者が腎臓内科の所属で出したもの。
  // 検査部スタッフが共著に入っていても、名義は腎臓内科なので載せない。
  if (NEPHRO_WORDS.some((k) => w.includes(k))) return false;
  if (KENSA_WORDS.some((k) => w.includes(k))) return true;
  if (hasSoloStaff(rec)) return true;             // 検査部スタッフとの共同研究
  return false;                                   // 判定できないものは載せない
}
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
let excludedOtherDept = 0;
for (const file of readdirSync(papersDir).filter((f) => f.endsWith('.json'))) {
  const recs = toArray(JSON.parse(readFileSync(join(papersDir, file), 'utf-8')), ['papers', 'published_papers']);
  for (const p of recs) {
    if (!deptIds.has(p.member_id)) continue;
    if (!belongsToDept(p)) {
      excludedOtherDept++;
      continue;
    }
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
      if (!belongsToDept(p)) {
        excludedOtherDept++;
        continue;
      }
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
        // venue_ja が正しいフィールド名。以前は p.venue を見ていて常に空だった。
        venue: p.venue_ja || p.venue || p.venue_en || '',
        date: p.presentation_date || '',
        // 開催日（YYYY-MM-DD）。presentation_date は月までしか無いことが多い。
        eventStart: p.event_start_date || '',
        eventEnd: p.event_end_date || '',
        // 発表形式。oral/poster/symposium/invited/workshop
        type: p.presentation_type || p.conference_type || '',
        // 演題番号（O68-5 など）
        number: p.presentation_number || '',
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
console.log(`  除外: 非公開 ${excluded}件 / 本学以外の業績 ${excludedNonUniv}件 / 他部門名義 ${excludedOtherDept}件`);
