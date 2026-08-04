/**
 * AI分析テンプレート。自由入力チャットの代わりに、ボタン1つで定型分析を実行する。
 * 各テンプレートは既存の安全なAPI呼び出しにマッピングされる（AIによるSQL生成は行わない）。
 */

export type AiTemplate = {
  id: string;
  label: string;
  description: string;
  action:
    | { type: "summary"; audience?: string }
    | { type: "alerts" }
    | { type: "report"; report_type: string }
    | { type: "quality" };
};

export const AI_TEMPLATES: AiTemplate[] = [
  {
    id: "monthly-highlights",
    label: "今月の主要変動",
    description: "最新月の主要な価格変動をAIが要約します。",
    action: { type: "summary", audience: "default" },
  },
  {
    id: "executive-brief",
    label: "経営会議用要約",
    description: "経営層向けの簡潔な市況要約を生成します。",
    action: { type: "summary", audience: "executive" },
  },
  {
    id: "estimator-brief",
    label: "積算担当者向け説明",
    description: "概算原価への影響確認が必要な資材を中心に説明します。",
    action: { type: "summary", audience: "estimator" },
  },
  {
    id: "client-brief",
    label: "発注者説明文作成",
    description: "発注者向けに慎重な表現で市況を説明します。",
    action: { type: "summary", audience: "client" },
  },
  {
    id: "alert-explain",
    label: "アラート説明",
    description: "現在のアラートに、連続上昇などの文脈を添えた説明を付けます。",
    action: { type: "alerts" },
  },
  {
    id: "monthly-report",
    label: "月次市況レポート",
    description: "データ表・出典付きのMarkdownレポートを生成します。",
    action: { type: "report", report_type: "monthly" },
  },
  {
    id: "quality-check",
    label: "データ品質チェック",
    description: "更新遅延・欠損・外れ値・表記揺れの確認候補を一覧します。",
    action: { type: "quality" },
  },
];
