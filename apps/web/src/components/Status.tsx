export function LoadingState({ label = "読み込み中…" }: { label?: string }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{label}</div>;
}

export function EmptyState({ label = "データがありません" }: { label?: string }) {
  return <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">{label}</div>;
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      <div className="font-semibold">エラーが発生しました</div>
      <div className="mt-1 break-all">{message}</div>
      {onRetry && (
        <button className="mt-2 rounded border border-red-300 bg-white px-3 py-1 text-xs" onClick={onRetry}>
          再試行
        </button>
      )}
    </div>
  );
}
