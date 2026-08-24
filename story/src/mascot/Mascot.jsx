import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { chapters } from "../content.js";
import { story } from "../scene/store.js";
import { IDLE, POSES, poseSrc } from "./sprites.js";

export function Mascot() {
  const stage = useRef(null);
  const [chapter, setChapter] = useState(0);
  const [idle, setIdle] = useState("rest");
  const pose = chapters[chapter]?.pose || "accounts";

  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      if (story.chapter !== last) {
        last = story.chapter;
        setChapter(last);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    Object.values({ ...POSES, ...IDLE }).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    if (!stage.current || story.reduced) return;
    const tl = gsap.timeline();
    tl.to(stage.current, { scaleY: 0.92, scaleX: 1.04, duration: 0.12, ease: "power2.in" })
      .to(stage.current, { scaleY: 1.06, scaleX: 0.98, duration: 0.14, ease: "power2.out" })
      .to(stage.current, { scaleY: 1, scaleX: 1, duration: 0.16, ease: "power2.out" });
    return () => tl.kill();
  }, [chapter]);

  useEffect(() => {
    if (story.reduced) {
      setIdle("rest");
      return;
    }
    let i = 0;
    const frames = ["rest", "blink", "rest", "squash", "rest"];
    const id = window.setInterval(() => {
      i = (i + 1) % frames.length;
      setIdle(frames[i]);
    }, 900);
    return () => window.clearInterval(id);
  }, [chapter]);

  const idleSrc = idle === "blink" ? IDLE.blink : idle === "squash" ? IDLE.squash : IDLE.rest;
  const showIdle = pose === "accounts" && !story.reduced;

  return (
    <div className="mascot-stage" aria-hidden="true">
      <div className="mascot-hop" ref={stage}>
        <img
          className="mascot-pose"
          src={showIdle ? idleSrc : poseSrc(pose)}
          alt=""
          width="720"
          height="720"
        />
      </div>
    </div>
  );
}
