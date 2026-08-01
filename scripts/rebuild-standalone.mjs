#!/usr/bin/env node
// ルート直下の standalone HTML を、サイドバーライトモード＋右側コンテンツ完全実装版へ再構築する。
// 使い方: node scripts/rebuild-standalone.mjs [path-to-html]
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlPath = path.resolve(process.argv[2] ?? path.join(root, "Civil Cost Index Dashboard (standalone).html"));
const html = fs.readFileSync(htmlPath, "utf8");

function fail(msg) {
  console.error("PATCH FAILED:", msg);
  process.exit(1);
}

function patch(input, find, repl, label, count) {
  let n = 0;
  let out = input;
  if (!out.includes(find)) {
    console.warn("SKIP (pattern already applied or changed by concurrent edit):", label);
    return out;
  }
  while (out.includes(find)) {
    out = out.replace(find, repl);
    n++;
    if (count !== undefined && n >= count) break;
  }
  if (count !== undefined && n < count) {
    console.warn(`PARTIAL ${label}: expected >=${count}, got ${n}`);
  }
  return out;
}

// 1) テンプレート（アプリ本体）を取り出す
const tmplMatch = html.match(/<script type="__bundler\/template">\s*(".*?")\s*<\/script>/s);
if (!tmplMatch) fail("template script not found");
let t = JSON.parse(tmplMatch[1]);
const origLen = t.length;

// ============================================================
// A. サイドバー ライトモード化（マークアップ）
// ============================================================
const asideStart = t.indexOf("<aside");
const asideEnd = t.indexOf("</aside>", asideStart);
if (asideStart < 0 || asideEnd < 0) fail("aside not found");
const aside = t.slice(asideStart, asideEnd + 8);
let a = aside;

a = patch(a, 'background:#141C29;display:flex;flex-direction:column;color:#9AA7B8;overflow:hidden;',
  'background:#fff;display:flex;flex-direction:column;color:#5A6678;overflow:hidden;border-right:1px solid #E3E8EF;', "aside bg");
a = patch(a, 'border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;', 'border-bottom:1px solid #EEF1F5;flex-shrink:0;', "header border");
a = patch(a, 'color:#fff;font-weight:600;font-size:14px;letter-spacing:.2px;', 'color:#1A2433;font-weight:600;font-size:14px;letter-spacing:.2px;', "title color");
// サブタイトル・リセット・基準ラベル・ユーザー役割（すべて #6C7A8C → #8A97A8）
a = a.replaceAll("color:#6C7A8C;", "color:#8A97A8;");
// セクションラベル・補助テキスト（#586577 → #8A97A8）
a = a.replaceAll("color:#586577;", "color:#8A97A8;");
// リンク hover
a = patch(a, 'style-hover="background:rgba(255,255,255,.06);text-decoration:none;"', 'style-hover="background:#F2F4F8;text-decoration:none;"', "nav hover", 8);
// フィルタパネル
a = patch(a, 'border-top:1px solid rgba(255,255,255,.07);margin-top:10px;', 'border-top:1px solid #EEF1F5;margin-top:10px;', "filter top border");
a = patch(a, 'background:#1B2533;border:1px solid rgba(255,255,255,.1);color:#E4E9F0;border-radius:7px;padding:6px 8px;font-size:12px;outline:none;margin-bottom:12px;',
  'background:#fff;border:1px solid #E3E8EF;color:#1A2433;border-radius:7px;padding:6px 8px;font-size:12px;outline:none;margin-bottom:12px;', "selects light", 2);
a = patch(a, 'background:#1B2533;border:1px solid rgba(255,255,255,.1);color:#E4E9F0;border-radius:7px;padding:5px 7px;font-size:11.5px;outline:none;color-scheme:dark;',
  'background:#fff;border:1px solid #E3E8EF;color:#1A2433;border-radius:7px;padding:5px 7px;font-size:11.5px;outline:none;color-scheme:light;', "inputs light", 3);
a = patch(a, 'background:#1B2533;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:4px;', 'background:#fff;border:1px solid #E3E8EF;border-radius:7px;padding:4px;', "item list bg");
a = patch(a, 'style-hover="background:rgba(255,255,255,.05);"', 'style-hover="background:#F2F4F8;"', "item hover");
a = patch(a, 'stroke="#141C29" stroke-width="4"', 'stroke="#fff" stroke-width="4"', "checkbox tick");
a = patch(a, 'color:#C3CDD9;margin-bottom:7px;', 'color:#5A6678;margin-bottom:7px;', "norm label");
// ユーザーカード
a = patch(a, 'border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:10px;', 'border-top:1px solid #EEF1F5;display:flex;align-items:center;gap:10px;', "user card border");
a = patch(a, 'background:#2A3850;color:#fff;', 'background:#E9F0FB;color:#2E5AAC;', "avatar");
a = patch(a, 'color:#E4E9F0;font-size:12px;font-weight:500;', 'color:#1A2433;font-size:12px;font-weight:500;', "user name");
a = patch(a, 'font-size:9.5px;font-weight:600;color:#E08A2B;border:1px solid rgba(224,138,43,.4);', 'font-size:9.5px;font-weight:600;color:#B5701A;border:1px solid rgba(224,138,43,.35);', "editor badge");
t = t.slice(0, asideStart) + a + t.slice(asideEnd + 8);

// ============================================================
// B. ロジック内のダーク配色 → ライト
// ============================================================
t = patch(t, 'const nav=(r)=>({bg: st.route===r?"#1B2533":"transparent", fg: st.route===r?"#fff":"#9AA7B8"});',
  'const nav=(r)=>({bg: st.route===r?"#E9F0FB":"transparent", fg: st.route===r?"#1F4E9C":"#5A6678"});', "nav colors");
t = patch(t, 'fg:onSel?"#E4E9F0":"#8A97A8",\n        boxBd:onSel?"#E08A2B":"rgba(255,255,255,.22)",',
  'fg:onSel?"#1A2433":"#5A6678",\n        boxBd:onSel?"#E08A2B":"#C6CFDA",', "itemChoices colors");
t = patch(t, 'const pbtn=(m)=>({bd:presetOn(m)?"#E08A2B":"rgba(255,255,255,.12)",bg:presetOn(m)?"rgba(224,138,43,.16)":"#1B2533",fg:presetOn(m)?"#E08A2B":"#8A97A8"});',
  'const pbtn=(m)=>({bd:presetOn(m)?"#E08A2B":"#E3E8EF",bg:presetOn(m)?"#FDEFE0":"#fff",fg:presetOn(m)?"#B5701A":"#5A6678"});', "pbtn colors");
t = patch(t, 'normBg:st.normalize?"#E08A2B":"#2A3646",', 'normBg:st.normalize?"#E08A2B":"#D6DDE7",', "normBg");
t = patch(t, 'baseFg:st.normalize?"#E4E9F0":"#4A5566",', 'baseFg:st.normalize?"#1A2433":"#4A5566",', "baseFg");

// ============================================================
// B2. 生成コード修復（初回ビルドで引用符が壊れた場合の救済・冪等）
// ============================================================
t = patch(t, 'let sheet="<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>";',
  "let sheet='<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>';", "repair sheet", 1);
t = patch(t, 'sheet+="<row r=""+(ri+1)+"">";', "sheet+='<row r=\"'+(ri+1)+'\">';", "repair row", 1);
t = patch(t, 'if(typeof v==="number"&&isFinite(v)) sheet+="<c r=""+ref+""><v>"+v+"</v></c>";',
  "if(typeof v==='number'&&isFinite(v)) sheet+='<c r=\"'+ref+'\"><v>'+v+'</v></c>';", "repair num cell", 1);
t = patch(t, 'else sheet+="<c r=""+ref+"" t="inlineStr"><is><t xml:space="preserve">"+esc(v)+"</t></is></c>";',
  "else sheet+='<c r=\"'+ref+'\" t=\"inlineStr\"><is><t xml:space=\"preserve\">'+esc(v)+'</t></is></c>';", "repair str cell", 1);
t = patch(t, 'const bullets=rows.slice(0,18).map(r=>"<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="ja-JP" sz="1100"/><a:t>"+esc(r.slice(0,3).join("　"))+"</a:t></a:r></a:p>").join("");',
  "const bullets=rows.slice(0,18).map(r=>'<a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"ja-JP\" sz=\"1100\"/><a:t>'+esc(r.slice(0,3).join(\"　\"))+'</a:t></a:r></a:p>').join(\"\");", "repair bullets", 1);
t = t.replace(/const dsRows=this\.DATASOURCES\.map\(d=>\(\{[\s\S]*?const dsSel=this\.DATASOURCES\.find\(d=>d\.code===st\.selDs\)\|\|this\.DATASOURCES\[0\];\n/, "// (旧dsRows/dsSelはライブデータ対応版へ置換済み)\n");
t = t.replaceAll("open:()=>this.setState({selJob:j.id})});", "open:()=>this.setState({selJob:j.id})};");

// ============================================================
// C. ボタン配線（sc-camel-on-click 付与）
// ============================================================
t = patch(t, '<button style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;" style-hover="background:#F2F4F8;">\n              <svg width="13" height="13" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"></path><path d="M21 3v6h-6"></path></svg>再取得',
  '<button sc-camel-on-click="{{ reload }}" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;" style-hover="background:#F2F4F8;">\n              <svg width="13" height="13" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"></path><path d="M21 3v6h-6"></path></svg>再取得', "dashboard reload");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">PNG出力</button>',
  '<button sc-camel-on-click="{{ dlChartPng }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">PNG出力</button>', "chart png");
t = patch(t, '<button style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">CSV出力</button>',
  '<button sc-camel-on-click="{{ dlChartCsv }}" style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">CSV出力</button>', "chart csv");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:7px 16px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">キャッシュ済みデータを表示</button>',
  '<button sc-camel-on-click="{{ showCache }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:7px 16px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">キャッシュ済みデータを表示</button>', "show cache");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">列の表示設定</button>',
  '<button sc-camel-on-click="{{ toggleCols }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">列の表示設定</button>', "cols toggle");
t = patch(t, '<button style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">CSV出力（全件）</button>',
  '<button sc-camel-on-click="{{ dlTableCsv }}" style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">CSV出力（全件）</button>', "table csv");
t = patch(t, '<button style="flex:1;border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:9px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">{{ expLabel }}を生成</button>',
  '<button sc-camel-on-click="{{ generate }}" style="flex:1;border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:9px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">{{ expLabel }}を生成</button>', "generate");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:9px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">条件を保存</button>',
  '<button sc-camel-on-click="{{ saveCond }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:9px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">条件を保存</button>', "save cond");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">CSVで一括登録</button>',
  '<button sc-camel-on-click="{{ pickCsv }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">CSVで一括登録</button>', "pick csv");
t = patch(t, '<button style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">＋ データソースを追加</button>',
  '<button sc-camel-on-click="{{ openAdd }}" style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">＋ データソースを追加</button>', "open add");
t = patch(t, '<button style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">今すぐ取込を実行</button>',
  '<button sc-camel-on-click="{{ runFetchSel }}" style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">今すぐ取込を実行</button>', "run fetch");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">編集</button>',
  '<button sc-camel-on-click="{{ openEdit }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">編集</button>', "edit ds");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#C5392F;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">停止</button>',
  '<button sc-camel-on-click="{{ toggleSel }}" style="border:1px solid #E3E8EF;background:#fff;color:#C5392F;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">停止</button>', "stop ds");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">失敗のみ表示</button>',
  '<button sc-camel-on-click="{{ toggleFail }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;">失敗のみ表示</button>', "fail only");
t = patch(t, '<button style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">再取込を実行</button>',
  '<button sc-camel-on-click="{{ rerunJob }}" style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">再取込を実行</button>', "rerun job");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">エラー明細をCSV出力</button>',
  '<button sc-camel-on-click="{{ dlJobErrCsv }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">エラー明細をCSV出力</button>', "job err csv");
t = patch(t, '<button style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 16px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">表示条件を保存</button>',
  '<button sc-camel-on-click="{{ saveSettings }}" style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 16px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">表示条件を保存</button>', "save settings");
t = patch(t, '<button style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">キーを保存</button>',
  '<button sc-camel-on-click="{{ saveKey }}" style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">キーを保存</button>', "save key");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#C5392F;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">保存済みキーを削除</button>',
  '<button sc-camel-on-click="{{ deleteKey }}" style="border:1px solid #E3E8EF;background:#fff;color:#C5392F;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">保存済みキーを削除</button>', "delete key");
t = patch(t, '<button style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">ログアウト</button>',
  '<button sc-camel-on-click="{{ logout }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">ログアウト</button>', "logout");

// ============================================================
// D. ヘッダー検索・Admin Key・新規UI
// ============================================================
t = patch(t, '<input placeholder="品目・データソースを検索" style="border:none;background:none;outline:none;font-size:12px;width:158px;color:#1A2433;">',
  '<input placeholder="品目・データソースを検索" value="{{ searchVal }}" sc-camel-on-change="{{ onSearch }}" style="border:none;background:none;outline:none;font-size:12px;width:158px;color:#1A2433;">', "search input");
t = patch(t, '<input type="password" sc-camel-default-value="................" style="border:1px solid #E3E8EF;border-radius:7px;padding:7px 9px;font-size:12px;color:#1A2433;outline:none;width:100%;font-family:\'IBM Plex Mono\',monospace;">',
  '<input type="password" value="{{ adminKeyVal }}" sc-camel-on-change="{{ onAdminKey }}" style="border:1px solid #E3E8EF;border-radius:7px;padding:7px 9px;font-size:12px;color:#1A2433;outline:none;width:100%;font-family:\'IBM Plex Mono\',monospace;">', "admin key input");

// チャート SVG に id を付与（PNG出力用）
t = patch(t, '<div style="padding:10px 12px 4px;">{{ chartDash }}</div>', '<div id="cci-chart-dash" style="padding:10px 12px 4px;">{{ chartDash }}</div>', "chart dash id", 2);
t = patch(t, '<div style="padding:10px 12px 4px;">{{ chartMain }}</div>', '<div id="cci-chart-main" style="padding:10px 12px 4px;">{{ chartMain }}</div>', "chart main id");

// データソース登録フォーム（DSビュー冒頭に挿入）
const dsForm = `
        <sc-if value="{{ dsAddOpen }}" hint-placeholder-val="{{ false }}">
        <div style="background:#fff;border:1px solid #E3E8EF;border-radius:10px;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:16px;">
          <div style="font-size:13.5px;font-weight:600;color:#1A2433;margin-bottom:12px;">{{ dsFormTitle }}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px 14px;">
            <div><span style="font-size:11px;font-weight:600;color:#5A6678;">ソースコード *</span>
              <input value="{{ dsFCode }}" sc-camel-on-change="{{ onDsFCode }}" placeholder="例: MLIT-LABOR" style="width:100%;border:1px solid #E3E8EF;border-radius:7px;padding:6px 8px;font-size:12px;color:#1A2433;outline:none;margin-top:3px;"></div>
            <div><span style="font-size:11px;font-weight:600;color:#5A6678;">名称 *</span>
              <input value="{{ dsFName }}" sc-camel-on-change="{{ onDsFName }}" placeholder="例: 公共工事設計労務単価" style="width:100%;border:1px solid #E3E8EF;border-radius:7px;padding:6px 8px;font-size:12px;color:#1A2433;outline:none;margin-top:3px;"></div>
            <div><span style="font-size:11px;font-weight:600;color:#5A6678;">分類 *</span>
              <sc-raw-select value="{{ dsFType }}" sc-camel-on-change="{{ onDsFType }}" style="width:100%;background:#fff;border:1px solid #E3E8EF;color:#1A2433;border-radius:7px;padding:6px 8px;font-size:12px;outline:none;margin-top:3px;">
                <option value="material">資材価格</option><option value="labor">労務単価</option><option value="index">物価指数</option><option value="fuel">燃料価格</option><option value="other">その他</option>
              </sc-raw-select></div>
            <div><span style="font-size:11px;font-weight:600;color:#5A6678;">提供元 *</span>
              <input value="{{ dsFProvider }}" sc-camel-on-change="{{ onDsFProvider }}" placeholder="例: 国土交通省" style="width:100%;border:1px solid #E3E8EF;border-radius:7px;padding:6px 8px;font-size:12px;color:#1A2433;outline:none;margin-top:3px;"></div>
            <div><span style="font-size:11px;font-weight:600;color:#5A6678;">取得URL（CSV）</span>
              <input value="{{ dsFUrl }}" sc-camel-on-change="{{ onDsFUrl }}" placeholder="https://…/data.csv" style="width:100%;border:1px solid #E3E8EF;border-radius:7px;padding:6px 8px;font-size:12px;color:#1A2433;outline:none;margin-top:3px;"></div>
            <div><span style="font-size:11px;font-weight:600;color:#5A6678;">形式</span>
              <sc-raw-select value="{{ dsFFmt }}" sc-camel-on-change="{{ onDsFFmt }}" style="width:100%;background:#fff;border:1px solid #E3E8EF;color:#1A2433;border-radius:7px;padding:6px 8px;font-size:12px;outline:none;margin-top:3px;">
                <option value="csv">CSV</option><option value="xlsx">Excel</option><option value="pdf">PDF</option><option value="html">HTML</option><option value="api">API</option>
              </sc-raw-select></div>
            <div><span style="font-size:11px;font-weight:600;color:#5A6678;">更新頻度</span>
              <sc-raw-select value="{{ dsFFreq }}" sc-camel-on-change="{{ onDsFFreq }}" style="width:100%;background:#fff;border:1px solid #E3E8EF;color:#1A2433;border-radius:7px;padding:6px 8px;font-size:12px;outline:none;margin-top:3px;">
                <option value="monthly">月次</option><option value="yearly">年次</option><option value="irregular">不定期</option>
              </sc-raw-select></div>
            <div style="grid-column:1 / -1;"><span style="font-size:11px;font-weight:600;color:#5A6678;">ライセンス・利用上の注意</span>
              <textarea value="{{ dsFLic }}" sc-camel-on-change="{{ onDsFLic }}" rows="2" style="width:100%;border:1px solid #E3E8EF;border-radius:7px;padding:6px 8px;font-size:12px;color:#1A2433;outline:none;margin-top:3px;resize:vertical;"></textarea></div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
            <button sc-camel-on-click="{{ closeDsForm }}" style="border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">キャンセル</button>
            <button sc-camel-on-click="{{ saveDsForm }}" style="border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">登録</button>
          </div>
        </div>
        </sc-if>
`;
const dsAllowedAnchor = '        <sc-if value="{{ dsAllowed }}" hint-placeholder-val="{{ true }}">\n        <div style="display:flex;flex-direction:column;gap:14px;">';
const dsAllowedIdx = t.indexOf(dsAllowedAnchor);
if (dsAllowedIdx < 0) fail("ds allowed anchor not found");
t = t.slice(0, dsAllowedIdx + dsAllowedAnchor.length) + "\n" + dsForm + t.slice(dsAllowedIdx + dsAllowedAnchor.length);

// CSV 一括登録用 file input
t = patch(t, '<div style="display:flex;align-items:center;gap:9px;">\n            <span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:7px;background:#FDEFE0;color:#B5701A;">',
  '<input type="file" id="cciCsvInput" accept=".csv" style="display:none;" sc-camel-on-change="{{ onCsvPick }}">\n          <div style="display:flex;align-items:center;gap:9px;">\n            <span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:7px;background:#FDEFE0;color:#B5701A;">', "csv input", 1);

// 列表示設定ポップオーバー（テーブルツールバー直後）
const colsPop = `
          <sc-if value="{{ colsOpen }}" hint-placeholder-val="{{ false }}">
          <div style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #E3E8EF;border-radius:9px;box-shadow:0 4px 14px rgba(16,24,40,.08);padding:9px 13px;flex-wrap:wrap;">
            <span style="font-size:11px;font-weight:600;color:#5A6678;">表示列</span>
            <label sc-camel-on-click="{{ togMom }}" style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#1A2433;cursor:pointer;"><input type="checkbox" checked="{{ colMom }}" style="width:13px;height:13px;accent-color:#E08A2B;">前月比</label>
            <label sc-camel-on-click="{{ togYoy }}" style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#1A2433;cursor:pointer;"><input type="checkbox" checked="{{ colYoy }}" style="width:13px;height:13px;accent-color:#E08A2B;">前年同月比</label>
            <label sc-camel-on-click="{{ togUnit }}" style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#1A2433;cursor:pointer;"><input type="checkbox" checked="{{ colUnit }}" style="width:13px;height:13px;accent-color:#E08A2B;">単位</label>
            <label sc-camel-on-click="{{ togSt }}" style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#1A2433;cursor:pointer;"><input type="checkbox" checked="{{ colSt }}" style="width:13px;height:13px;accent-color:#E08A2B;">値の状態</label>
            <label sc-camel-on-click="{{ togSrc }}" style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#1A2433;cursor:pointer;"><input type="checkbox" checked="{{ colSrc }}" style="width:13px;height:13px;accent-color:#E08A2B;">出典</label>
          </div>
          </sc-if>
`;
const tblToolbarEnd = '</button>\n        </div>\n\n        <div style="background:#fff;border:1px solid #E3E8EF;border-radius:10px;box-shadow:0 1px 2px rgba(16,24,40,.04);overflow:hidden;">\n          <sc-raw-table style="width:100%;border-collapse:collapse;font-size:12px;">';
const tblIdx = t.indexOf('CSV出力（全件）');
const tblAfter = t.indexOf(tblToolbarEnd, tblIdx);
if (tblAfter < 0) fail("table toolbar anchor not found");
t = t.slice(0, tblAfter) + colsPop + "\n" + t.slice(tblAfter);

// テーブル列の表示切替（単位・前月比・前年比・状態・出典）— <sc-if> ラッパー方式
t = t.replaceAll('<sc-raw-th sc-if="{{ colUnit }}"', '<sc-raw-th').replaceAll('<sc-raw-th sc-if="{{ colSrc }}"', '<sc-raw-th').replaceAll('<sc-raw-th sc-if="{{ colSt }}"', '<sc-raw-th').replaceAll('<sc-raw-th sc-if="{{ colYoy }}"', '<sc-raw-th').replaceAll('<sc-raw-th sc-if="{{ colMom }}"', '<sc-raw-th');
t = patch(t, '<sc-raw-th style="text-align:left;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;">出典</sc-raw-th>',
  '<sc-if value="{{ colSrc }}" hint-placeholder-val="{{ true }}"><sc-raw-th style="text-align:left;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;">出典</sc-raw-th></sc-if>', "th src", 1);
t = patch(t, '<sc-raw-th style="text-align:left;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;">値の状態</sc-raw-th>',
  '<sc-if value="{{ colSt }}" hint-placeholder-val="{{ true }}"><sc-raw-th style="text-align:left;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;">値の状態</sc-raw-th></sc-if>', "th st", 1);
t = patch(t, '<sc-raw-th sc-camel-on-click="{{ sortYoy }}" style="text-align:right;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;cursor:pointer;user-select:none;">前年同月比 {{ arrYoy }}</sc-raw-th>',
  '<sc-if value="{{ colYoy }}" hint-placeholder-val="{{ true }}"><sc-raw-th sc-camel-on-click="{{ sortYoy }}" style="text-align:right;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;cursor:pointer;user-select:none;">前年同月比 {{ arrYoy }}</sc-raw-th></sc-if>', "th yoy", 1);
t = patch(t, '<sc-raw-th sc-camel-on-click="{{ sortMom }}" style="text-align:right;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;cursor:pointer;user-select:none;">前月比 {{ arrMom }}</sc-raw-th>',
  '<sc-if value="{{ colMom }}" hint-placeholder-val="{{ true }}"><sc-raw-th sc-camel-on-click="{{ sortMom }}" style="text-align:right;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;cursor:pointer;user-select:none;">前月比 {{ arrMom }}</sc-raw-th></sc-if>', "th mom", 1);
t = patch(t, '<sc-raw-th style="text-align:left;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;">単位</sc-raw-th>',
  '<sc-if value="{{ colUnit }}" hint-placeholder-val="{{ true }}"><sc-raw-th style="text-align:left;padding:9px 14px;border-bottom:1px solid #EEF1F5;font-size:10.5px;color:#8A97A8;font-weight:600;background:#FAFBFC;">単位</sc-raw-th></sc-if>', "th unit", 1);
// セル側
t = patch(t, '<sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;font-size:11px;color:#8A97A8;">{{ r.unit }}</sc-raw-td>',
  '<sc-if value="{{ colUnit }}" hint-placeholder-val="{{ true }}"><sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;font-size:11px;color:#8A97A8;">{{ r.unit }}</sc-raw-td></sc-if>', "td unit", 1);
t = patch(t, '<sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:{{ r.momColor }};">{{ r.mom }}</sc-raw-td>',
  '<sc-if value="{{ colMom }}" hint-placeholder-val="{{ true }}"><sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:{{ r.momColor }};">{{ r.mom }}</sc-raw-td></sc-if>', "td mom", 1);
t = patch(t, '<sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:{{ r.yoyColor }};">{{ r.yoy }}</sc-raw-td>',
  '<sc-if value="{{ colYoy }}" hint-placeholder-val="{{ true }}"><sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:{{ r.yoyColor }};">{{ r.yoy }}</sc-raw-td></sc-if>', "td yoy", 1);
t = patch(t, '<sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;"><span style="font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:5px;background:{{ r.stBg }};color:{{ r.stFg }};">{{ r.stLabel }}</span></sc-raw-td>',
  '<sc-if value="{{ colSt }}" hint-placeholder-val="{{ true }}"><sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;"><span style="font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:5px;background:{{ r.stBg }};color:{{ r.stFg }};">{{ r.stLabel }}</span></sc-raw-td></sc-if>', "td st", 1);
t = patch(t, '<sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;font-size:11px;color:#8A97A8;">{{ r.src }}</sc-raw-td>',
  '<sc-if value="{{ colSrc }}" hint-placeholder-val="{{ true }}"><sc-raw-td style="padding:7px 14px;border-bottom:1px solid #EEF1F5;font-size:11px;color:#8A97A8;">{{ r.src }}</sc-raw-td></sc-if>', "td src", 1);

// トースト（body 末尾）
t = t.replace("</body>", `
  <sc-if value="{{ toastShow }}" hint-placeholder-val="{{ false }}">
  <div style="position:fixed;bottom:18px;right:18px;z-index:99999;max-width:420px;background:#fff;border:1px solid #E3E8EF;border-left:3px solid #2E9E6B;border-radius:9px;box-shadow:0 10px 28px rgba(16,24,40,.18);padding:11px 15px;font-size:12px;color:#1A2433;line-height:1.55;">{{ toast }}</div>
  </sc-if>
</body>`);

// ============================================================
// E. ロジック拡張（状態・メソッド・renderVals 配線）
// ============================================================
if (!t.includes("const liveSrc=st.liveDs")) {
// E1. state 追加
t = patch(t, 'expFmt: "pdf"\n  };',
  `expFmt: "pdf",
    adminKey: (typeof localStorage!=="undefined" && localStorage.getItem("cci_admin_key"))||"",
    adminKeyVal: (typeof localStorage!=="undefined" && localStorage.getItem("cci_admin_key"))||"",
    toast: "", toastShow: false,
    dsAddOpen: false, dsEditId: null,
    dsFCode:"", dsFName:"", dsFType:"material", dsFProvider:"", dsFUrl:"", dsFFmt:"csv", dsFFreq:"monthly", dsFLic:"",
    colsOpen: false, colUnit: true, colMom: true, colYoy: true, colSt: true, colSrc: true,
    failOnly: false, tblQ: "", searchVal: "",
    liveDs: null, liveJobs: null, liveLoaded: false
  };`, "state additions");

// E2. メソッド追加（componentDidMount の後）
t = patch(t, 'componentDidMount(){ if(this.props.defaultRoute) this.setState({route:this.props.defaultRoute}); }',
  `componentDidMount(){
    if(this.props.defaultRoute) this.setState({route:this.props.defaultRoute});
    if(typeof localStorage!=="undefined" && localStorage.getItem("cci_admin_key")){
      this.setState({adminKey:localStorage.getItem("cci_admin_key"), adminKeyVal:localStorage.getItem("cci_admin_key")});
      this.loadLive();
    }
  }

  // ---------- 通知 ----------
  toast(msg){
    this.setState({toast:String(msg), toastShow:true});
    clearTimeout(this._tt);
    this._tt=setTimeout(()=>this.setState({toastShow:false}),4000);
  }

  // ---------- API ----------
  adminH(){ const k=this.state.adminKey; return k?{"X-Admin-Key":k}:{}; }
  async apiJson(path, init){
    const r=await fetch(path, Object.assign({headers:Object.assign({"Content-Type":"application/json"},this.adminH())},init));
    let body=null; try{ body=await r.json(); }catch(e){}
    if(!r.ok){ const msg=(body&&body.error&&body.error.message)||("HTTP "+r.status); const err=new Error(msg); err.status=r.status; throw err; }
    return body;
  }
  async loadLive(){
    try{
      const [ds,jobs]=await Promise.all([
        this.apiJson("/api/data-sources"),
        this.apiJson("/api/fetch-jobs?limit=50")
      ]);
      this.setState({liveDs:ds, liveJobs:jobs, liveLoaded:true});
    }catch(e){ this.setState({liveLoaded:true}); }
  }
  async refreshLive(){ await this.loadLive(); }

  // ---------- ダウンロード ----------
  quoteCsv(v){ const s=v==null?"":String(v); return /[",\\n]/.test(s)?"\\""+s.replace(/"/g,'""')+"\\"":s; }
  dlCsv(name, rows){
    const csv="\\uFEFF"+rows.map(r=>r.map(v=>this.quoteCsv(v)).join(",")).join("\\n");
    this.download(name, new Blob([csv],{type:"text/csv;charset=utf-8"}));
  }
  download(name, blob){
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},5000);
  }
  seriesRows(){
    const st=this.state, S=this.buildSeries(), rows=[["年月","品目","地域","値","前月比(%)","前年同月比(%)","単位","出典"]];
    S.forEach(s=>{ s.pts.forEach(p=>{ rows.push([p.period, s.name, this.regName(st.region), p.value, p.mom==null?"":p.mom, p.yoy==null?"":p.yoy, s.unit, this.SRC[s.src].s]); }); });
    return rows;
  }
  chartSvg(id){
    const el=document.getElementById(id);
    if(!el) return null;
    const svg=el.querySelector("svg");
    return svg?svg.outerHTML:null;
  }
  dlChartPng(){
    const svg=this.chartSvg("cci-chart-dash")||this.chartSvg("cci-chart-main");
    if(!svg){ this.toast("グラフが見つかりません"); return; }
    try{
      const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
      const url=URL.createObjectURL(blob); const img=new Image();
      img.onload=()=>{ const cv=document.createElement("canvas"); cv.width=img.width*2; cv.height=img.height*2;
        cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
        cv.toBlob(b=>{ this.download("cci-chart-"+new Date().toISOString().slice(0,10)+".png", b); URL.revokeObjectURL(url); },"image/png"); };
      img.onerror=()=>{ this.toast("PNG生成に失敗しました"); URL.revokeObjectURL(url); };
      img.src=url;
    }catch(e){ this.toast("PNG生成に失敗しました: "+e.message); }
  }
  dlChartCsv(){ this.dlCsv("cci-chart-"+new Date().toISOString().slice(0,10)+".csv", this.seriesRows()); }
  dlTableCsv(){
    const rows=[["年月","品目","分類","地域","値","単位","前月比(%)","前年同月比(%)","状態","出典"]];
    this.ITEMS.forEach(it=>{ this.raw(it.id,this.state.region).slice(-12).forEach(p=>{
      rows.push([p.period,it.name,it.cat,this.regName(this.state.region),p.value,p.unit==null?it.unit:p.unit,p.mom==null?"":p.mom,p.yoy==null?"":p.yoy,p.status||"confirmed",this.SRC[it.src].s]);
    });});
    this.dlCsv("cci-timeseries-"+new Date().toISOString().slice(0,10)+".csv", rows);
  }
  crc32(buf){
    let c, table=this._crcTable;
    if(!table){ table=this._crcTable=[]; for(let n=0;n<256;n++){ c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; table[n]=c>>>0; } }
    let crc=0xFFFFFFFF;
    for(let i=0;i<buf.length;i++) crc=table[(crc^buf[i])&0xFF]^(crc>>>8);
    return (crc^0xFFFFFFFF)>>>0;
  }
  zipBytes(entries){
    const enc=new TextEncoder();
    const compress=async(bytes)=>{
      if(typeof CompressionStream==="undefined") return bytes;
      const ds=new CompressionStream("deflate-raw");
      const writer=ds.writable.getWriter(); writer.write(bytes); writer.close();
      const reader=ds.readable.getReader(); const out=[];
      while(true){ const {done,value}=await reader.read(); if(done) break; out.push(value); }
      const len=out.reduce((a,b)=>a+b.length,0); const all=new Uint8Array(len); let o=0;
      for(const c of out){ all.set(c,o); o+=c.length; }
      return all.length<bytes.length?all:bytes;
    };
    return (async()=>{
      const localParts=[], centralParts=[]; let offset=0;
      for(const e of entries){
        const data=e.data instanceof Uint8Array?e.data:new TextEncoder().encode(e.data);
        const comp=await compress(data);
        const crc=this.crc32(data);
        const name=new TextEncoder().encode(e.name);
        const lh=new Uint8Array(30+name.length);
        const dv=new DataView(lh.buffer);
        dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true); dv.setUint16(6,0x0800,true);
        dv.setUint16(8,comp.length===data.length?0:8,true); dv.setUint16(10,0,true);
        dv.setUint16(12,0,true); dv.setUint16(14,0,true);
        dv.setUint32(16,crc,true); dv.setUint32(20,comp.length,true); dv.setUint32(24,data.length,true);
        dv.setUint16(28,name.length,true); lh.set(name,30);
        localParts.push({lh,comp});
        const ch=new Uint8Array(46+name.length);
        const dv2=new DataView(ch.buffer);
        dv2.setUint32(0,0x02014b50,true); dv2.setUint16(4,20,true); dv2.setUint16(6,20,true);
        dv2.setUint16(8,0x0800,true); dv2.setUint16(10,comp.length===data.length?0:8,true);
        dv2.setUint16(12,0,true); dv2.setUint16(14,0,true); dv2.setUint16(16,0,true);
        dv2.setUint32(18,crc,true); dv2.setUint32(22,comp.length,true); dv2.setUint32(26,data.length,true);
        dv2.setUint16(30,name.length,true); dv2.setUint16(42,0,true);
        dv2.setUint32(44,offset,true); ch.set(name,46);
        centralParts.push(ch);
        offset+=lh.length+comp.length;
      }
      let total=0; for(const p of localParts) total+=p.lh.length+p.comp.length;
      const cdLen=centralParts.reduce((a,b)=>a+b.length,0);
      const eocd=new Uint8Array(22);
      const dv3=new DataView(eocd.buffer);
      dv3.setUint32(0,0x06054b50,true); dv3.setUint16(8,entries.length,true); dv3.setUint16(10,entries.length,true);
      dv3.setUint32(12,cdLen,true); dv3.setUint32(16,total,true); dv3.setUint16(20,0,true);
      const all=new Uint8Array(total+cdLen+22); let o=0;
      for(const p of localParts){ all.set(p.lh,o); o+=p.lh.length; all.set(p.comp,o); o+=p.comp.length; }
      for(const c of centralParts){ all.set(c,o); o+=c.length; }
      all.set(eocd,o);
      return all;
    })();
  }
  async dlXlsx(){
    try{
      const rows=this.seriesRows();
      const esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      let sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
      rows.forEach((r,ri)=>{
        sheet+='<row r="'+(ri+1)+'">';
        r.forEach((v,ci)=>{
          const ref=String.fromCharCode(65+ci)+(ri+1);
          if(typeof v==="number"&&isFinite(v)) sheet+='<c r="'+ref+'"><v>'+v+'</v></c>';
          else sheet+='<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';
        });
        sheet+="</row>";
      });
      sheet+='</sheetData></worksheet>';
      const files={
        "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
        "_rels/.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
        "docProps/core.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Civil Cost Index Report</dc:title><dc:creator>CCI Dashboard</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+new Date().toISOString()+'</dcterms:created></cp:coreProperties>',
        "xl/workbook.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="明細" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        "xl/styles.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>',
        "xl/worksheets/sheet1.xml":sheet
      };
      const zip=await this.zipBytes(Object.entries(files).map(([name,data])=>({name,data})));
      this.download("cci-report-"+new Date().toISOString().slice(0,10)+".xlsx",new Blob([zip],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      this.toast("Excelブックを生成しました");
    }catch(e){ this.toast("Excel生成に失敗しました: "+e.message); }
  }
  async dlPptx(){
    try{
      const rows=this.seriesRows().slice(1,41);
      const esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const bullets=rows.slice(0,18).map(r=>'<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="ja-JP" sz="1100"/><a:t>'+esc(r.slice(0,3).join("　"))+'</a:t></a:r></a:p>').join("");
      const slide='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="365760"/><a:ext cx="8382000" cy="731520"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP" sz="2800" b="1"/><a:t>Civil Cost Index レポート</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Subtitle"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1135380"/><a:ext cx="8382000" cy="426720"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP" sz="1400"/><a:t>'+esc(new Date().toLocaleDateString("ja-JP")+"／"+this.regName(this.state.region))+'</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1615440"/><a:ext cx="8382000" cy="5486400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>'+bullets+'</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
      const files={
        "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
        "_rels/.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
        "docProps/core.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Civil Cost Index Report</dc:title><dc:creator>CCI Dashboard</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+new Date().toISOString()+'</dcterms:created></cp:coreProperties>',
        "docProps/app.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CCI Dashboard</Application><Slides>1</Slides></Properties>',
        "ppt/presentation.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
        "ppt/_rels/presentation.xml.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
        "ppt/slideMasters/slideMaster1.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>',
        "ppt/slideMasters/_rels/slideMaster1.xml.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>',
        "ppt/slideLayouts/slideLayout1.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>',
        "ppt/slides/_rels/slide1.xml.rels":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>',
        "ppt/theme/theme1.xml":'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CCI"><a:themeElements><a:clrScheme name="CCI"><a:dk1><a:sysClr val="windowText" lastClr="1A2433"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="2E5AAC"/></a:dk2><a:lt2><a:srgbClr val="EEF1F5"/></a:lt2><a:accent1><a:srgbClr val="2E5AAC"/></a:accent1><a:accent2><a:srgbClr val="E08A2B"/></a:accent2><a:accent3><a:srgbClr val="1F8255"/></a:accent3><a:accent4><a:srgbClr val="6B45B0"/></a:accent4><a:accent5><a:srgbClr val="C5392F"/></a:accent5><a:accent6><a:srgbClr val="0F7C8A"/></a:accent6><a:hlink><a:srgbClr val="2E5AAC"/></a:hlink><a:folHlink><a:srgbClr val="6B45B0"/></a:folHlink></a:clrScheme><a:fontScheme name="CCI"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="CCI"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>',
        "ppt/slides/slide1.xml":slide
      };
      const zip=await this.zipBytes(Object.entries(files).map(([name,data])=>({name,data})));
      this.download("cci-report-"+new Date().toISOString().slice(0,10)+".pptx",new Blob([zip],{type:"application/vnd.openxmlformats-officedocument.presentationml.presentation"}));
      this.toast("PowerPoint資料を生成しました");
    }catch(e){ this.toast("PowerPoint生成に失敗しました: "+e.message); }
  }
  async dlPdf(){
    try{
      const st=this.state;
      const r=await fetch("/api/export/report",{method:"POST",headers:Object.assign({"Content-Type":"application/json"},this.adminH()),
        body:JSON.stringify({format:"pdf",data_type:st.cat,item_ids:this.activeIds().join(","),region_ids:st.region,start_period:st.start,end_period:st.end,normalize:st.normalize,base_period:st.normalize?st.base:null})});
      if(!r.ok){ let m="HTTP "+r.status; try{ m=(await r.json()).error.message||m; }catch(e){} this.toast("PDF生成に失敗しました: "+m); return; }
      const blob=await r.blob();
      this.download("cci-report-"+new Date().toISOString().slice(0,10)+".pdf", blob);
    }catch(e){ this.toast("PDF生成に失敗しました: "+e.message); }
  }
  generate(){
    const f=this.state.expFmt||"csv";
    if(f==="csv") this.dlChartCsv();
    else if(f==="xlsx") this.dlXlsx();
    else if(f==="pptx") this.dlPptx();
    else this.dlPdf();
  }

  // ---------- データソース管理 ----------
  openAdd(){ this.setState({dsAddOpen:true,dsEditId:null,dsFCode:"",dsFName:"",dsFType:"material",dsFProvider:"",dsFUrl:"",dsFFmt:"csv",dsFFreq:"monthly",dsFLic:""}); }
  openEdit(){
    const d=this.state.liveDs?this.state.liveDs.data_sources.find(x=>x.source_code===this.state.selDs):null;
    if(!d){ this.toast("対象データソースが見つかりません"); return; }
    this.setState({dsAddOpen:true,dsEditId:d.id,dsFCode:d.source_code,dsFName:d.source_name,dsFType:d.source_type,dsFProvider:d.provider_name,dsFUrl:d.source_url||"",dsFFmt:d.file_format||"csv",dsFFreq:d.update_frequency||"monthly",dsFLic:d.license_note||""});
  }
  closeDsForm(){ this.setState({dsAddOpen:false,dsEditId:null}); }
  async saveDsForm(){
    const f=this.state;
    if(!f.dsFCode.trim()||!f.dsFName.trim()||!f.dsFProvider.trim()){ this.toast("コード・名称・提供元は必須です"); return; }
    const body={source_code:f.dsFCode.trim(),source_name:f.dsFName.trim(),source_type:f.dsFType,provider_name:f.dsFProvider.trim(),source_url:f.dsFUrl.trim()||null,file_format:f.dsFFmt,update_frequency:f.dsFFreq,license_note:f.dsFLic.trim()||null};
    try{
      if(f.dsEditId) await this.apiJson("/api/data-sources/"+f.dsEditId,{method:"PATCH",body:JSON.stringify(body)});
      else await this.apiJson("/api/data-sources",{method:"POST",body:JSON.stringify(body)});
      this.toast(f.dsEditId?"データソースを更新しました":"データソースを登録しました");
      this.setState({dsAddOpen:false,dsEditId:null});
      await this.refreshLive();
    }catch(e){ this.toast(e.message); }
  }
  pickCsv(){ const el=document.getElementById("cciCsvInput"); if(el) el.click(); }
  async onCsvPick(e){
    const file=e.target.files&&e.target.files[0]; e.target.value="";
    if(!file){ return; }
    const ds=this.state.liveDs?this.state.liveDs.data_sources.find(x=>x.source_code===this.state.selDs):null;
    if(!ds){ this.toast("先にデータソースを選択してください"); return; }
    if(!this.state.adminKey){ this.toast("Admin Key が必要です（ユーザー設定）"); return; }
    const fd=new FormData(); fd.append("file",file); fd.append("data_source_id",ds.id);
    try{
      const r=await fetch("/api/uploads",{method:"POST",headers:this.adminH(),body:fd});
      let body=null; try{ body=await r.json(); }catch(err){}
      if(!r.ok){ this.toast((body&&body.error&&body.error.message)||("HTTP "+r.status)); return; }
      this.toast("取込完了: 成功 "+body.data.success_rows+" / エラー "+body.data.error_rows);
      await this.refreshLive();
    }catch(err){ this.toast("取込に失敗しました: "+err.message); }
  }
  async runFetchSel(){
    const ds=this.state.liveDs?this.state.liveDs.data_sources.find(x=>x.source_code===this.state.selDs):null;
    if(!ds){ this.toast("データソースが未選択です"); return; }
    if(!ds.source_url){ this.toast("このデータソースに取得URLがありません。URL登録後に実行してください"); return; }
    if(!this.state.adminKey){ this.toast("Admin Key が必要です（ユーザー設定）"); return; }
    this.toast("取込を開始しました（URL: "+ds.source_url.slice(0,60)+"…）");
    try{
      const r=await fetch("/api/data-sources/"+ds.id+"/fetch",{method:"POST",headers:this.adminH()});
      let body=null; try{ body=await r.json(); }catch(err){}
      if(!r.ok){ this.toast((body&&body.error&&body.error.message)||("HTTP "+r.status)); return; }
      this.toast("取込完了: 成功 "+body.data.success_rows+" / エラー "+body.data.error_rows);
      await this.refreshLive();
    }catch(err){ this.toast("取込に失敗しました: "+err.message); }
  }
  async toggleSel(){
    const ds=this.state.liveDs?this.state.liveDs.data_sources.find(x=>x.source_code===this.state.selDs):null;
    if(!ds){ this.toast("データソースが未選択です"); return; }
    if(!this.state.adminKey){ this.toast("Admin Key が必要です（ユーザー設定）"); return; }
    try{
      await this.apiJson("/api/data-sources/"+ds.id,{method:"PATCH",body:JSON.stringify({is_active:!ds.is_active})});
      this.toast(ds.is_active?"データソースを停止しました":"データソースを有効化しました");
      await this.refreshLive();
    }catch(e){ this.toast(e.message); }
  }
  async rerunJob(){
    const j=this.state.liveJobs?this.state.liveJobs.fetch_jobs.find(x=>x.id===this.state.selJob):null;
    if(!j){ this.toast("ジョブが未選択です"); return; }
    const ds=this.state.liveDs?this.state.liveDs.data_sources.find(x=>x.id===j.data_source_id):null;
    if(!ds||!ds.source_url){ this.toast("再取込にはデータソースのURL登録が必要です"); return; }
    this.setState({selDs:ds.source_code});
    this.toast("再取込を開始します…");
    try{
      const r=await fetch("/api/data-sources/"+ds.id+"/fetch",{method:"POST",headers:this.adminH()});
      let body=null; try{ body=await r.json(); }catch(err){}
      if(!r.ok){ this.toast((body&&body.error&&body.error.message)||("HTTP "+r.status)); return; }
      this.toast("再取込完了: 成功 "+body.data.success_rows+" / エラー "+body.data.error_rows);
      await this.refreshLive();
    }catch(err){ this.toast("再取込に失敗しました: "+err.message); }
  }
  dlJobErrCsv(){
    const j=this.state.liveJobs?this.state.liveJobs.fetch_jobs.find(x=>x.id===this.state.selJob):null;
    const errs=j&&j.error_detail?j.error_detail:this.JOBS.find(x=>x.id===this.state.selJob)?.errs||[];
    this.dlCsv("cci-job-errors-"+this.state.selJob+".csv",[["行","列","内容"],...errs.map(e=>[e.row==null?"":e.row,e.col||"—",e.reason||e.message||""])]);
  }

  // ---------- 設定 ----------
  saveSettings(){ try{ localStorage.setItem("cci_prefs",JSON.stringify({region:this.state.region,cat:this.state.cat,start:this.state.start,end:this.state.end,normalize:this.state.normalize,base:this.state.base})); this.toast("表示条件を保存しました"); }catch(e){ this.toast("保存に失敗しました"); } }
  saveCond(){ try{ localStorage.setItem("cci_cond",JSON.stringify({cat:this.state.cat,sel:this.state.sel,region:this.state.region,start:this.state.start,end:this.state.end,normalize:this.state.normalize,base:this.state.base})); this.toast("出力条件を保存しました"); }catch(e){ this.toast("保存に失敗しました"); } }
  onAdminKey(e){ this.setState({adminKeyVal:e.target.value}); }
  saveKey(){
    const k=this.state.adminKeyVal.trim();
    if(!k){ this.toast("Admin Key を入力してください"); return; }
    try{ localStorage.setItem("cci_admin_key",k); this.setState({adminKey:k}); this.loadLive(); this.toast("Admin Key を保存しました"); }catch(e){ this.toast("保存に失敗しました"); }
  }
  deleteKey(){
    try{ localStorage.removeItem("cci_admin_key"); }catch(e){}
    this.setState({adminKey:"",adminKeyVal:"",liveDs:null,liveJobs:null});
    this.toast("保存済みキーを削除しました");
  }
  logout(){ this.deleteKey(); this.setState({route:"/"}); }
  onSearch(e){ this.setState({searchVal:e.target.value,tblQ:e.target.value}); }
  toggleCols(){ this.setState({colsOpen:!this.state.colsOpen}); }
  showCache(){ this.toast("キャッシュ済みデータを表示します（最終取込時点の値）"); this.setState({demoOverride:"通常",loading:false}); }`, "methods block");

// E3. renderVals: データソース／ジョブをライブデータへ切替 + 新ハンドラ
const dsBlockStart = t.indexOf('const jstat={success:["#E4F3EC","#1F8255","成功"],partial:["#FDEFE0","#B5701A","一部失敗"],failed:["#FCE9E7","#C5392F","失敗"],running:["#E9F0FB","#2E5AAC","実行中"]};');
const dsBlockEnd = t.indexOf('const jobErrs=jobSel.errs.map(e=>({row:e.row?String(e.row):"—",col:e.col,reason:e.reason}));');
if (dsBlockStart < 0 || dsBlockEnd < 0) fail("ds/jobs block anchors not found");
const dsBlockReplacement = `const FREQ_LABEL={monthly:"月次",yearly:"年次",irregular:"不定期"};
    const liveSrc=st.liveDs?st.liveDs.data_sources:null;
    const liveJob=st.liveJobs?st.liveJobs.fetch_jobs:null;
    const dsRows=(liveSrc?liveSrc:this.DATASOURCES).map(d=>({
      code:d.source_code||d.code,name:d.source_name||d.name,provider:d.provider_name||d.provider,
      freq:(d.update_frequency?FREQ_LABEL[d.update_frequency]||d.update_frequency:d.freq)||"—",
      items:d.items!=null?d.items.toLocaleString("ja-JP"):"—",
      last:d.last_fetched_at?String(d.last_fetched_at).slice(0,16).replace("T"," "):(d.last||"—"),
      stLabel:!d.is_active&&d.is_active!=null?"停止中":(d.ok==null? "稼働中":(d.ok?"稼働中":"エラー")),
      stBg:!d.is_active&&d.is_active!=null?"#F2F4F8":(d.ok==null?"#E4F3EC":(d.ok?"#E4F3EC":"#FCE9E7")),
      stFg:!d.is_active&&d.is_active!=null?"#8A97A8":(d.ok==null?"#1F8255":(d.ok?"#1F8255":"#C5392F")),
      rowBg:st.selDs===(d.source_code||d.code)?"#FDF7EF":"transparent",
      bar:st.selDs===(d.source_code||d.code)?"#E08A2B":"transparent",
      lic:d.license_note||d.lic||"利用条件は提供元の規約に従います。",
      open:()=>this.setState({selDs:d.source_code||d.code})}));
    const dsSel=(liveSrc?liveSrc:this.DATASOURCES).find(d=>(d.source_code||d.code)===st.selDs)||(liveSrc?liveSrc:this.DATASOURCES)[0];

    const jstat={success:["#E4F3EC","#1F8255","成功"],partial:["#FDEFE0","#B5701A","一部失敗"],failed:["#FCE9E7","#C5392F","失敗"],running:["#E9F0FB","#2E5AAC","実行中"]};
    const rawJobs=liveJob?liveJob:this.JOBS;
    const jobFiltered=st.failOnly?rawJobs.filter(j=>{ const s=(j.status||"").toLowerCase(); return s.indexOf("fail")>=0||s.indexOf("error")>=0||s.indexOf("partial")>=0; }):rawJobs;
    const jobRows=jobFiltered.map(j=>{
      const stKey=(j.status||"").toLowerCase().indexOf("partial")>=0?"partial":(j.status||"").toLowerCase();
      const stl=jstat[stKey]||jstat.running;
      return {id:j.id,src:j.data_source_name||j.src,type:j.job_type||j.type,start:(j.started_at||j.start||"—").slice(0,19).replace("T"," "),
        rows:j.total_rows==null?(j.total==null?"—":(j.ok.toLocaleString("ja-JP")+" / "+j.total.toLocaleString("ja-JP"))):(j.success_rows.toLocaleString("ja-JP")+" / "+j.total_rows.toLocaleString("ja-JP")),
        ng:j.error_rows==null?(j.ng==null?"—":String(j.ng)):String(j.error_rows), ngColor:(j.error_rows||j.ng)?"#C5392F":"#8A97A8",
        stBg:stl[0],stFg:stl[1],stLabel:stl[2],
        rowBg:st.selJob===j.id?"#FDF7EF":"transparent",
        bar:st.selJob===j.id?"#E08A2B":"transparent",
        open:()=>this.setState({selJob:j.id})});
    });
    const jobSel=(liveJob?liveJob:this.JOBS).find(j=>j.id===st.selJob)||(liveJob?liveJob:this.JOBS)[0];
    const jobErrs=(jobSel.error_detail||jobSel.errs||[]).map(e=>({row:e.row!=null?String(e.row):"—",col:e.col||"—",reason:e.reason||e.message||""}));
    const jobTotal=jobSel.total_rows!=null?jobSel.total_rows:(jobSel.total==null?"—":jobSel.total);
    const jobOk=jobSel.success_rows!=null?jobSel.success_rows:(jobSel.ok==null?"—":jobSel.ok);
    const jobNg=jobSel.error_rows!=null?jobSel.error_rows:(jobSel.ng==null?"—":jobSel.ng);
    const jobFile=jobSel.file_name||jobSel.file||"—";
    const jobHash=jobSel.file_hash?String(jobSel.file_hash).slice(0,9)+"…":(jobSel.hash||"—");
    const jobStart=(jobSel.started_at||jobSel.start||"—").slice(0,19).replace("T"," ");
    const jobEnd=jobSel.finished_at?String(jobSel.finished_at).slice(0,19).replace("T"," "):(jobSel.end||"—");
    const dsSelInfo=liveSrc?{
      code:dsSel.source_code,name:dsSel.source_name,provider:dsSel.provider_name,type:(dsSel.file_format||"—").toUpperCase()+" 取得",fmt:(dsSel.file_format||"—").toUpperCase(),
      freq:FREQ_LABEL[dsSel.update_frequency]||dsSel.update_frequency||"—",items:"—",last:dsSel.last_fetched_at?String(dsSel.last_fetched_at).slice(0,16).replace("T"," "):"—",
      url:dsSel.source_url||"—",lic:dsSel.license_note||"利用条件は提供元の規約に従います。",
      active:dsSel.is_active
    }:{
      code:dsSel.code,name:dsSel.name,provider:dsSel.provider,type:dsSel.type,fmt:dsSel.fmt,
      freq:dsSel.freq,items:dsSel.items.toLocaleString("ja-JP"),last:dsSel.last,
      url:dsSel.url,lic:dsSel.lic,active:dsSel.active
    };`;
t = t.slice(0, dsBlockStart) + dsBlockReplacement + t.slice(dsBlockEnd + 'const jobErrs=jobSel.errs.map(e=>({row:e.row?String(e.row):"—",col:e.col,reason:e.reason}));'.length);

// E4. 既存の dsSel/jobSel/jobErrs 参照を新しい変数へ置換
t = t.replaceAll("jobStBg:jstat[jobSel.status][0], jobStFg:jstat[jobSel.status][1], jobStLabel:jstat[jobSel.status][2],",
  "jobStBg:jstat[(String(jobSel.status||\"success\").toLowerCase().indexOf(\"partial\")>=0?\"partial\":(jobSel.status||\"success\").toLowerCase())]?.[0]||\"#E4F3EC\", jobStFg:jstat[(String(jobSel.status||\"success\").toLowerCase().indexOf(\"partial\")>=0?\"partial\":(jobSel.status||\"success\").toLowerCase())]?.[1]||\"#1F8255\", jobStLabel:jstat[(String(jobSel.status||\"success\").toLowerCase().indexOf(\"partial\")>=0?\"partial\":(jobSel.status||\"success\").toLowerCase())]?.[2]||\"成功\",");
t = t.replaceAll("jobId:jobSel.id, jobSrc:jobSel.src, jobType:jobSel.type, jobStart:jobSel.start, jobEnd:jobSel.end||\"—\",",
  "jobId:jobSel.id, jobSrc:jobSel.data_source_name||jobSel.src, jobType:jobSel.job_type||jobSel.type, jobStart:jobStart, jobEnd:jobEnd,");
t = t.replaceAll("dsName:dsSel.name, dsCode:dsSel.code, dsProvider:dsSel.provider, dsType:dsSel.type, dsFmt:dsSel.fmt,",
  "dsName:dsSelInfo.name, dsCode:dsSelInfo.code, dsProvider:dsSelInfo.provider, dsType:dsSelInfo.type, dsFmt:dsSelInfo.fmt,");
t = t.replaceAll("dsFreq:dsSel.freq, dsUrl:dsSel.url, dsItems:dsSel.items.toLocaleString(\"ja-JP\"), dsLast:dsSel.last,",
  "dsFreq:dsSelInfo.freq, dsUrl:dsSelInfo.url, dsItems:dsSelInfo.items, dsLast:dsSelInfo.last,");
t = t.replaceAll("dsActiveLabel:dsSel.active?\"有効\":\"停止中\", dsActiveBg:dsSel.active?\"#E4F3EC\":\"#F2F4F8\", dsActiveFg:dsSel.active?\"#1F8255\":\"#8A97A8\",",
  "dsActiveLabel:dsSelInfo.active?\"有効\":\"停止中\", dsActiveBg:dsSelInfo.active?\"#E4F3EC\":\"#F2F4F8\", dsActiveFg:dsSelInfo.active?\"#1F8255\":\"#8A97A8\",");
t = t.replaceAll("jobTotal:jobSel.total==null?\"—\":jobSel.total.toLocaleString(\"ja-JP\"),", "jobTotal:(jobTotal==null||jobTotal===\"—\")?\"—\":String(jobTotal).toLocaleString?String(jobTotal).toLocaleString(\"ja-JP\"):String(jobTotal),");
t = t.replaceAll("jobOk:jobSel.ok==null?\"—\":jobSel.ok.toLocaleString(\"ja-JP\"),", "jobOk:(jobOk==null||jobOk===\"—\")?\"—\":String(jobOk).toLocaleString?String(jobOk).toLocaleString(\"ja-JP\"):String(jobOk),");
t = t.replaceAll("jobNg:jobSel.ng==null?\"—\":String(jobSel.ng),", "jobNg:(jobNg==null||jobNg===\"—\")?\"—\":String(jobNg),");
t = t.replaceAll("jobFile:jobSel.file||\"—\", jobHash:jobSel.hash||\"—\"", "jobFile:jobFile, jobHash:jobHash");
t = t.replaceAll("jobDur:jobSel.end?(this.jobDur(jobSel)):\"実行中\",", "jobDur:jobSel.finished_at?(this.jobDur({start:jobStart,end:jobEnd})):\"実行中\",");
t = t.replaceAll("jobHasErr:jobSel.errs.length>0,", "jobHasErr:(jobSel.error_detail||jobSel.errs||[]).length>0,");
t = t.replaceAll("jobNoErr:jobSel.errs.length===0,", "jobNoErr:(jobSel.error_detail||jobSel.errs||[]).length===0,");
t = t.replaceAll('jobRate:jobSel.total?((jobSel.ok/jobSel.total)*100).toFixed(1)+"%":"—",', 'jobRate:(jobTotal!=null&&jobTotal!=="—"&&Number(jobTotal)>0)?((Number(jobOk||0)/Number(jobTotal))*100).toFixed(1)+"%":"—",');
t = t.replaceAll('jobBarOk:jobSel.total?((jobSel.ok/jobSel.total)*100).toFixed(1)+"%":"0%",', 'jobBarOk:(jobTotal!=null&&jobTotal!=="—"&&Number(jobTotal)>0)?((Number(jobOk||0)/Number(jobTotal))*100).toFixed(1)+"%":"0%",');
t = t.replaceAll('jobBarNg:jobSel.total?((jobSel.ng/jobSel.total)*100).toFixed(1)+"%":"0%",', 'jobBarNg:(jobTotal!=null&&jobTotal!=="—"&&Number(jobTotal)>0)?((Number(jobNg||0)/Number(jobTotal))*100).toFixed(1)+"%":"0%",');
t = t.replaceAll("dsLicense:dsSel.lic,", "dsLicense:dsSelInfo.lic,");

// E5. renderVals 末尾に新ハンドラ追加
const tailAnchor = '      jobFile:jobFile, jobHash:jobHash\n    };';
if (!t.includes(tailAnchor)) fail("renderVals tail anchor not found");
t = t.replace(tailAnchor, `      jobFile:jobFile, jobHash:jobHash,

      // ---- 完全実装ハンドラ ----
      dsAllowed: demo!=="権限なし" && !!st.adminKey,
      dsForbidden: demo==="権限なし" || !st.adminKey,
      dsAddOpen:st.dsAddOpen, dsFormTitle:st.dsEditId?"データソースを編集":"データソースを追加",
      dsFCode:st.dsFCode, onDsFCode:(e)=>this.setState({dsFCode:e.target.value}),
      dsFName:st.dsFName, onDsFName:(e)=>this.setState({dsFName:e.target.value}),
      dsFType:st.dsFType, onDsFType:(e)=>this.setState({dsFType:e.target.value}),
      dsFProvider:st.dsFProvider, onDsFProvider:(e)=>this.setState({dsFProvider:e.target.value}),
      dsFUrl:st.dsFUrl, onDsFUrl:(e)=>this.setState({dsFUrl:e.target.value}),
      dsFFmt:st.dsFFmt, onDsFFmt:(e)=>this.setState({dsFFmt:e.target.value}),
      dsFFreq:st.dsFFreq, onDsFFreq:(e)=>this.setState({dsFFreq:e.target.value}),
      dsFLic:st.dsFLic, onDsFLic:(e)=>this.setState({dsFLic:e.target.value}),
      openAdd:()=>this.openAdd(), closeDsForm:()=>this.closeDsForm(), saveDsForm:()=>this.saveDsForm(),
      openEdit:()=>this.openEdit(), toggleSel:()=>this.toggleSel(), runFetchSel:()=>this.runFetchSel(),
      pickCsv:()=>this.pickCsv(), onCsvPick:(e)=>this.onCsvPick(e),
      toggleFail:()=>this.setState({failOnly:!st.failOnly}), failLabel:st.failOnly?"全件表示":"失敗のみ表示",
      rerunJob:()=>this.rerunJob(), dlJobErrCsv:()=>this.dlJobErrCsv(),
      toggleCols:()=>this.toggleCols(), colsOpen:st.colsOpen,
      colUnit:st.colUnit, colMom:st.colMom, colYoy:st.colYoy, colSt:st.colSt, colSrc:st.colSrc,
      togUnit:()=>this.setState({colUnit:!st.colUnit}), togMom:()=>this.setState({colMom:!st.colMom}),
      togYoy:()=>this.setState({colYoy:!st.colYoy}), togSt:()=>this.setState({colSt:!st.colSt}), togSrc:()=>this.setState({colSrc:!st.colSrc}),
      searchVal:st.searchVal, onSearch:(e)=>this.onSearch(e),
      dlChartPng:()=>this.dlChartPng(), dlChartCsv:()=>this.dlChartCsv(), dlTableCsv:()=>this.dlTableCsv(),
      generate:()=>this.generate(), saveCond:()=>this.saveCond(),
      saveSettings:()=>this.saveSettings(), adminKeyVal:st.adminKeyVal, onAdminKey:(e)=>this.onAdminKey(e),
      saveKey:()=>this.saveKey(), deleteKey:()=>this.deleteKey(), logout:()=>this.logout(),
      showCache:()=>this.showCache(), toast:st.toast, toastShow:st.toastShow
    };`);

// E6. テーブル検索フィルタ（tblAll 構築後に適用）
t = t.replaceAll("const tblAll=[];", "const tblAll=[];\n    const _q=st.tblQ.trim().toLowerCase();");
t = t.replaceAll("tblAll.sort((a,b)=>{", "if(_q){ const filtered=tblAll.filter(r=>r.item.toLowerCase().includes(_q)||r.src.toLowerCase().includes(_q)||r.region.toLowerCase().includes(_q)||r.cat.toLowerCase().includes(_q)); tblAll.length=0; tblAll.push(...filtered); }\n    tblAll.sort((a,b)=>{");
} else {
  console.warn("SKIP E-block (already applied): renderVals live data wiring");
}

fs.writeFileSync(path.join(root, ".standalone-template.patched.html"), t);
console.log("Template patched:", origLen, "->", t.length);

// ============================================================
// F. 再埋め込み（テンプレートJSONを外側HTMLへ反映）
// ============================================================
const newTmpl = JSON.stringify(t).replace(/<\//g, "<\\/");
const outHtml = html.slice(0, tmplMatch.index) + '<script type="__bundler/template">' + newTmpl + "</script>" + html.slice(tmplMatch.index + tmplMatch[0].length);
fs.writeFileSync(htmlPath, outHtml);
console.log("Standalone HTML rebuilt:", htmlPath, "(", outHtml.length, "bytes )");
