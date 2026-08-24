import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { story } from "./store.js";

gsap.registerPlugin(ScrollTrigger);

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

    const root = document.getElementById("story");
    if (!root) return () => {};

    const st = ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: "bottom bottom",
      scrub: story.reduced ? 0 : 1,
      onUpdate: (self) => {
        story.progress = self.progress;
        story.chapter = Math.min(9, Math.floor(self.progress * 10));
      },
    });

    const hash = location.hash;
    if (hash) document.querySelector(hash)?.scrollIntoView();

    return () => {
      st.kill();
      reduce.removeEventListener("change", syncFlags);
      mobile.removeEventListener("change", syncFlags);
    };
  }, []);
}
