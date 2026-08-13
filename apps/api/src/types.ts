/** Cloudflare Workers AI バインディング（wrangler.jsonc の "ai" で有効化） */
export type WorkersAiBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

export type Env = {
  DATABASE_URL: string;
  ADMIN_API_KEY: string;
  CORS_ORIGINS: string;
  APP_VERSION: string;
  BASIC_AUTH_USERNAME?: string;
  BASIC_AUTH_PASSWORD?: string;
  /** 任意: URL取込で許可するホスト（カンマ区切り）。未設定なら全パブリックホスト許可。 */
  FETCH_ALLOWED_HOSTS?: string;
  /** 任意: Anthropic APIキー。設定時はAnthropicを優先使用。 */
  ANTHROPIC_API_KEY?: string;
  /** 任意: DeepSeek APIキー（OpenAI互換API）。コスト重視タスクの既定推奨。 */
  DEEPSEEK_API_KEY?: string;
  /** 任意: DeepSeekモデル（既定: deepseek-chat） */
  DEEPSEEK_MODEL?: string;
  /** 任意: Perplexity APIキー（OpenAI互換API）。最新情報調査向け。 */
  PERPLEXITY_API_KEY?: string;
  /** 任意: Perplexityモデル（既定: sonar） */
  PERPLEXITY_MODEL?: string;
  /** 任意: 使用モデルの上書き（例: claude-opus-5 / @cf/meta/llama-3.3-70b-instruct-fp8-fast） */
  AI_MODEL?: string;
  /** 任意: AIプロバイダーの強制指定 anthropic / deepseek / perplexity / workers-ai / none */
  AI_PROVIDER?: string;
  /** 任意: タスク種別ごとのルーティングJSON（例: {"summary":"deepseek","report":"anthropic"}） */
  AI_ROUTING?: string;
  /** Workers AI バインディング（Workersデプロイ時のみ） */
  AI?: WorkersAiBinding;
  /** 任意: Cloudflare Access のチームドメイン（例: example.cloudflareaccess.com） */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** 任意: Cloudflare Access アプリケーションの Audience（aud） */
  CF_ACCESS_AUD?: string;
  /** 任意: リバースプロキシ/テスト用に X-User-Email / X-User-Roles を信頼する（true時のみ） */
  AUTH_TRUST_PROXY?: string;
  /** 任意: 未認証アクセスを閲覧者(viewer)として許可する（デモ環境のみ。既定は false = 未認証は401） */
  ALLOW_ANONYMOUS_VIEWER?: string;
  /** 任意: 1分あたりのIP別リクエスト上限。0以下で無効。 */
  RATE_LIMIT_PER_MINUTE?: string;
  /** 任意: Teams 受信Webhook URL */
  NOTIFY_TEAMS_URL?: string;
  /** 任意: Slack 受信Webhook URL */
  NOTIFY_SLACK_URL?: string;
  /** 任意: PDF日本語フォント（TTF/OTF）の取得URL。未設定時はデフォルトCDNを使用 */
  PDF_CJK_FONT_URL?: string;
};

export type Region = {
  id: string;
  region_code: string;
  region_name: string;
  region_type: string;
  parent_region_id: string | null;
  display_order: number | null;
  is_active: boolean;
};

export type Item = {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  sub_category: string | null;
  standard_name: string | null;
  default_unit: string | null;
  data_kind: string;
  estimate_usable: boolean;
  display_order: number | null;
  is_active: boolean;
};

export type DataSource = {
  id: string;
  source_code: string;
  source_name: string;
  source_type: string;
  provider_name: string;
  source_url: string | null;
  file_format: string | null;
  update_frequency: string | null;
  license_note: string | null;
  data_kind: string;
  estimate_usable: boolean;
  redistribution_note: string | null;
  is_active: boolean;
  last_fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeSeriesPoint = {
  period: string;
  value: number | null;
  raw_value: number;
  mom_rate: number | null;
  yoy_rate: number | null;
  status: string;
};

export type Series = {
  series_id: string;
  label: string;
  unit: string;
  source_name: string;
  source_url: string | null;
  data_kind: string;
  estimate_usable: boolean;
  points: TimeSeriesPoint[];
};

export type TimeseriesConditions = {
  data_type: string;
  start_period: string | null;
  end_period: string | null;
  normalize: boolean;
  base_period: string | null;
};

export type RatePoint = {
  period: string;
  value: number;
};

export type RawRow = {
  id: string;
  data_source_id: string;
  data_type: string;
  item_id: string;
  item_name: string;
  item_code: string;
  data_kind: string;
  estimate_usable: boolean;
  region_id: string;
  region_name: string;
  region_code: string;
  period_date: string;
  value: string;
  unit: string | null;
  value_status: string;
  note: string | null;
  source_name: string;
  source_url: string | null;
  license_note: string | null;
  redistribution_note: string | null;
  source_file_id: string | null;
  updated_at: string;
};
