// standalone HTML（バンドラ形式）を対象としたパッチユーティリティ
// 行391の JSON 文字列リテラルをパース → 文字列置換 → 再シリアライズして書き戻す
import fs from "node:fs";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "Civil Cost Index Dashboard (standalone).html");
const publicTarget = join(root, "apps", "web", "public", "standalone.html");

const lines = fs.readFileSync(source, "utf8").split("\n");
if (lines[390].trimStart().startsWith("\"")) {
  // 行391（index 390）が JSON 文字列リテラル
} else {
  throw new Error("行391の形式が想定と異なります: " + lines[390].slice(0, 60));
}

const html = JSON.parse(lines[390]);

const asideStart = html.indexOf("<aside");
const asideEnd = html.indexOf("</aside>", asideStart);
if (asideStart < 0 || asideEnd < 0) throw new Error("aside が見つかりません");

let aside = html.slice(asideStart, asideEnd);

// ---- 1) aside の基本カラー：ダーク → ライト ----
aside = aside.replace(
  'background:#141C29;display:flex;flex-direction:column;color:#9AA7B8;overflow:hidden',
  'background:#FFFFFF;display:flex;flex-direction:column;color:#5A6678;overflow:hidden;border-right:1px solid #E3E8EF'
);
// ヘッダー/セクション区切り線
aside = aside.replaceAll("rgba(255,255,255,.07)", "#E3E8EF");
// タイトル
aside = aside.replace('color:#fff;font-weight:600;font-size:14px', 'color:#1A2433;font-weight:600;font-size:14px');
// セクションラベル／ヒント等の文字色
aside = aside.replaceAll("#586577", "#5A6678");
aside = aside.replaceAll("rgba(255,255,255,.05)", "rgba(17,24,39,.05)");
aside = aside.replaceAll("rgba(255,255,255,.06)", "rgba(17,24,39,.05)");
// 入力系（select / input）ライト化
aside = aside.replaceAll(
  "background:#1B2533;border:1px solid rgba(255,255,255,.1);color:#E4E9F0",
  "background:#FFFFFF;border:1px solid #D8DEE7;color:#1A2433"
);
aside = aside.replaceAll(
  "background:#1B2533;border:1px solid rgba(255,255,255,.1);color:{{ baseFg }}",
  "background:#FFFFFF;border:1px solid #D8DEE7;color:{{ baseFg }}"
);
aside = aside.replaceAll(
  "background:#1B2533;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:4px",
  "background:#FFFFFF;border:1px solid #D8DEE7;border-radius:7px;padding:4px"
);
aside = aside.replaceAll("color-scheme:dark", "color-scheme:light");
// 指数化トグルのラベル
aside = aside.replaceAll("#C3CDD9", "#5A6678");
// フッター（ユーザー情報）
aside = aside.replaceAll("background:#2A3850;color:#fff", "background:#EEF1F5;color:#5A6678");
aside = aside.replaceAll("color:#E4E9F0;font-size:12px", "color:#1A2433;font-size:12px");

// ---- 2) JS 内の配色（ナビ・フィルタUI）をライトモードへ ----
let js = html;
const navOld = 'const nav=(r)=>({bg: st.route===r?"#1B2533":"transparent", fg: st.route===r?"#fff":"#9AA7B8"});';
const navNew = 'const nav=(r)=>({bg: st.route===r?"#E08A2B":"transparent", fg: st.route===r?"#fff":"#5A6678"});';
if (!js.includes(navOld)) throw new Error("nav() 定義が見つかりません");
js = js.replace(navOld, navNew);

const itemOld = 'fg:onSel?"#E4E9F0":"#8A97A8",\n        boxBd:onSel?"#E08A2B":"rgba(255,255,255,.22)", boxBg:onSel?"#E08A2B":"transparent"';
const itemNew = 'fg:onSel?"#1A2433":"#5A6678",\n        boxBd:onSel?"#E08A2B":"#C6CFDA", boxBg:onSel?"#E08A2B":"#FFFFFF"';
if (!js.includes(itemOld)) throw new Error("itemChoices 配色が見つかりません");
js = js.replace(itemOld, itemNew);

const pbtnOld = '{bd:presetOn(m)?"#E08A2B":"rgba(255,255,255,.12)",bg:presetOn(m)?"rgba(224,138,43,.16)":"#1B2533",fg:presetOn(m)?"#E08A2B":"#8A97A8"}';
const pbtnNew = '{bd:presetOn(m)?"#E08A2B":"#E3E8EF",bg:presetOn(m)?"#FDEFE0":"#FFFFFF",fg:presetOn(m)?"#B5701A":"#5A6678"}';
if (!js.includes(pbtnOld)) throw new Error("pbtn 配色が見つかりません");
js = js.replace(pbtnOld, pbtnNew);

const baseOld = 'baseFg:st.normalize?"#E4E9F0":"#4A5566"';
const baseNew = 'baseFg:st.normalize?"#1A2433":"#A2AEBC"';
if (!js.includes(baseOld)) throw new Error("baseFg 定義が見つかりません");
js = js.replace(baseOld, baseNew);

const normOld = 'normBg:st.normalize?"#E08A2B":"#2A3646"';
const normNew = 'normBg:st.normalize?"#E08A2B":"#D8DEE7"';
if (!js.includes(normOld)) throw new Error("normBg 定義が見つかりません");
js = js.replace(normOld, normNew);

const patched = js.slice(0, asideStart) + aside + js.slice(asideEnd);

// ---- 3) 再シリアライズ（</ を <\/ にエスケープして script 内埋め込みを維持） ----
const serialized = JSON.stringify(patched).replace(/<\//g, "<\\/");
lines[390] = serialized;
fs.writeFileSync(source, lines.join("\n"), "utf8");
console.log("[standalone-patch] パッチ適用完了:", source);

if (existsSync(publicTarget)) {
  copyFileSync(source, publicTarget);
  console.log("[standalone-patch] copied ->", publicTarget);
}
