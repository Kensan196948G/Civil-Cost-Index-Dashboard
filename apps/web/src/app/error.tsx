"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          エラーが発生しました
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          予期しないエラーが発生しました。再試行しても解決しない場合は、
          システム管理者にお問い合わせください。
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          再試行
        </button>
      </div>
    </div>
  );
}
