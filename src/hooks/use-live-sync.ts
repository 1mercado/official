import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

type Pulse = { signature: string };

/**
 * Polls a cheap `pulse` server function while the tab is visible and reloads every route
 * loader when its signature changes, so screens stay in sync without a manual refresh.
 * `onChange` receives the previous and next pulse just before the reload.
 */
export function useLiveSync<T extends Pulse>(
  pulse: () => Promise<T>,
  {
    interval = 60_000,
    onChange,
  }: { interval?: number; onChange?: (prev: T, next: T) => void } = {},
) {
  const router = useRouter();
  const last = useRef<T | null>(null);
  const changeRef = useRef(onChange);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    changeRef.current = onChange;
  });

  useEffect(() => {
    let stopped = false;
    let running = false;
    async function tick() {
      if (running || stopped || document.visibilityState !== "visible") return;
      running = true;
      try {
        const next = await pulse();
        if (stopped) return;
        const prev = last.current;
        last.current = next;
        if (prev && prev.signature !== next.signature) {
          changeRef.current?.(prev, next);
          await router.invalidate();
        }
        setOnline(true);
        setSyncedAt(new Date());
      } catch {
        setOnline(false);
      } finally {
        running = false;
      }
    }
    void tick();
    const timer = window.setInterval(tick, interval);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [pulse, interval, router]);

  return { syncedAt, online };
}
