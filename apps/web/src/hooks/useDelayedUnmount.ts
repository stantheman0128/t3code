import { useEffect, useState } from "react";

/** Keep a tree mounted through its close animation, then drop it. */
export function useDelayedUnmount(open: boolean, exitMs: number): boolean {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timeoutId = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timeoutId);
  }, [open, exitMs]);

  return open || mounted;
}
