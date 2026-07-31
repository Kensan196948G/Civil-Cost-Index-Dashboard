"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

export function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => setData(d))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "予期しないエラーが発生しました。"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, reload: run };
}
