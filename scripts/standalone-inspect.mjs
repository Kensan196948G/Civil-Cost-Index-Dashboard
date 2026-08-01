import fs from "node:fs";

const file = process.argv[2] ?? "Civil Cost Index Dashboard (standalone).html";
const lines = fs.readFileSync(file, "utf8").split("\n");
const l = lines[390];
// 行391は JSON 文字列リテラル（外側引用符込み）なので行全体をパースする
const html = JSON.parse(l);
console.log("PARSED LENGTH:", html.length);

const aside = html.indexOf("<aside");
console.log("ASIDE AT:", aside);
console.log(html.slice(aside - 100, aside + 2600));
