import { useEffect } from "react";
import { chapters } from "../content.js";
import { story } from "./store.js";

export function useScrollDriver() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 900px)");
    const syncFlags = () => {
      story.reduced = reduce.matches;
      story.mobile = mobile.matches;
    };
    syncFlags();
    reduce.addEventListener("change", syncFlags);
    mobile.addEventListener("change", syncFlags);

    const nodes = [...document.querySelectorAll("main#story .chapter")];
    if (!nodes.length) {
      return () => {
        reduce.removeEventListener("change", syncFlags);
        mobile.removeEventListener("change", syncFlags);
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const id = visible.target.getAttribute("data-id");
        const idx = chapters.findIndex((c) => c.id === id);
        if (idx >= 0) {
          story.chapter = idx;
          story.progress = idx / Math.max(chapters.length - 1, 1);
        }
      },
      { root: null, threshold: [0.2, 0.35, 0.5, 0.7], rootMargin: "-12% 0px -35% 0px" }
    );
    nodes.forEach((n) => io.observe(n));

    const hash = location.hash;
    if (hash) document.querySelector(hash)?.scrollIntoView();

    return () => {
      io.disconnect();
      reduce.removeEventListener("change", syncFlags);
      mobile.removeEventListener("change", syncFlags);
    };
  }, []);
}
