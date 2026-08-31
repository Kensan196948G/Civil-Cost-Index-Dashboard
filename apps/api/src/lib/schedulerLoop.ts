export function parseSchedulerSeconds(
  value: string | undefined,
  fallback: number,
  minimum: number
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function waitForNextCycle(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runSchedulerLoop(options: {
  intervalMilliseconds: number;
  signal: AbortSignal;
  runOnce: () => Promise<void>;
  onError: (error: unknown) => void;
}): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await options.runOnce();
    } catch (error) {
      options.onError(error);
    }
    await waitForNextCycle(options.intervalMilliseconds, options.signal);
  }
}
