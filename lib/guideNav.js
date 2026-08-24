"use client";

import { useEffect, useRef } from "react";

export const GUIDE_PREPARE = "roboseo:guide-prepare";

export function prepareGuide(nav = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GUIDE_PREPARE, { detail: nav || {} }));
}

export function waitForGuideEl(id, { timeout = 2800, interval = 40 } = {}) {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || !id) {
      resolve(null);
      return;
    }
    const start = performance.now();
    const tick = () => {
      const el = document.querySelector(`[data-guide="${id}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width >= 4 && r.height >= 4) {
          resolve(el);
          return;
        }
      }
      if (performance.now() - start >= timeout) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, interval);
    };
    requestAnimationFrame(tick);
  });
}

export function useGuidePrepare(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onPrep = (e) => ref.current(e.detail || {});
    window.addEventListener(GUIDE_PREPARE, onPrep);
    return () => window.removeEventListener(GUIDE_PREPARE, onPrep);
  }, []);
}
