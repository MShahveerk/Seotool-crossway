import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { chapters } from "../content.js";
import { story } from "../scene/store.js";
import { lineFor, nudgeFor } from "./lines.js";
import { IDLE, allSpriteSrc, poseMeta, poseSrc } from "./sprites.js";

const CLAMP_Y = 110;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function targetEl(chapterId, key) {
  const root = document.querySelector(`#chapter-${chapterId}`);
  if (!root) return null;
  return (
    root.querySelector(`[data-point="${key}"]`) ||
    root.querySelector(`[data-point="lead"]`) ||
    root.querySelector(`[data-point="title"]`)
  );
}

export function Mascot() {
  const stage = useRef(null);
  const hop = useRef(null);
  const hit = useRef(null);
  const hot = useRef(null);
  const layer = useRef(null);
  const path = useRef(null);
  const fromDot = useRef(null);
  const toDot = useRef(null);
  const yTo = useRef(null);
  const rotTo = useRef(null);
  const leanX = useRef(null);
  const leanY = useRef(null);
  const pokeCount = useRef(0);

  const [chapter, setChapter] = useState(0);
  const [mode, setMode] = useState("pose");
  const [quip, setQuip] = useState("");
  const [idle, setIdle] = useState("rest");

  const active = chapters[chapter] || chapters[0];
  const flavor = active?.pose || "accounts";
  const pose = mode === "point" ? "point" : flavor;
  const meta = poseMeta(pose);
  const src =
    pose === "accounts" && idle !== "rest" && mode !== "point"
      ? idle === "blink"
        ? IDLE.blink
        : IDLE.squash
      : poseSrc(pose);
  const spoken = quip || lineFor(active.id);

  useEffect(() => {
    allSpriteSrc().forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, []);

  useEffect(() => {
    if (!hop.current || !stage.current || !hit.current) return;
    yTo.current = gsap.quickTo(stage.current, "y", { duration: 0.5, ease: "power3.out" });
    rotTo.current = gsap.quickTo(stage.current, "rotation", { duration: 0.5, ease: "power3.out" });
    leanX.current = gsap.quickTo(hit.current, "rotateY", { duration: 0.35, ease: "power2.out" });
    leanY.current = gsap.quickTo(hit.current, "rotateX", { duration: 0.35, ease: "power2.out" });
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = { chapter: -1, mode: "", quip: "" };
    const tick = () => {
      if (story.chapter !== last.chapter) {
        last.chapter = story.chapter;
        setChapter(story.chapter);
      }
      if (story.mode !== last.mode) {
        last.mode = story.mode;
        setMode(story.mode);
      }
      if (story.quip !== last.quip) {
        last.quip = story.quip;
        setQuip(story.quip);
      }

      const ch = chapters[story.chapter] || chapters[0];
      const showing = document.querySelector(".mascot-pose");
      const finger = hot.current;
      const svgPath = path.current;
      const livePose = story.mode === "point" ? "point" : ch.pose || "accounts";
      const liveMeta = poseMeta(livePose);
      const liveHx = liveMeta.flip ? 1 - liveMeta.hx : liveMeta.hx;

      if (finger && showing) {
        finger.style.left = `${liveHx * 100}%`;
        finger.style.top = `${liveMeta.hy * 100}%`;
      }

      const origin = finger?.getBoundingClientRect();
      const aim = targetEl(ch.id, story.targetKey);
      const box = aim?.getBoundingClientRect();
      const visible =
        origin &&
        box &&
        box.width > 8 &&
        box.height > 8 &&
        box.bottom > 72 &&
        box.top < window.innerHeight - 36;

      if (layer.current) layer.current.classList.toggle("is-on", Boolean(visible));

      if (visible && svgPath && fromDot.current && toDot.current) {
        const x1 = origin.left + origin.width / 2;
        const y1 = origin.top + origin.height / 2;
        const x2 = Math.min(box.right - 8, origin.left - 16);
        const y2 = box.top + Math.min(box.height * 0.4, 26);
        svgPath.setAttribute("d", `M ${x1} ${y1} C ${x1 - 80} ${y1}, ${x2 + 64} ${y2}, ${x2} ${y2}`);
        fromDot.current.setAttribute("cx", x1);
        fromDot.current.setAttribute("cy", y1);
        toDot.current.setAttribute("cx", x2);
        toDot.current.setAttribute("cy", y2);

        if (!story.reduced && yTo.current && rotTo.current) {
          yTo.current(clamp(y2 - y1, -CLAMP_Y, CLAMP_Y));
          rotTo.current(clamp((y2 - y1) / -14, -8, 8));
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!hop.current || story.reduced) return;
    const tl = gsap.timeline();
    tl.fromTo(
      hop.current,
      { scaleY: 0.92, scaleX: 1.05, filter: "blur(4px)", opacity: 0.7 },
      {
        scaleY: 1.04,
        scaleX: 0.98,
        filter: "blur(0px)",
        opacity: 1,
        duration: 0.28,
        ease: "power2.out",
      }
    ).to(hop.current, { scaleY: 1, scaleX: 1, duration: 0.18, ease: "power2.out" });
    return () => tl.kill();
  }, [chapter, pose]);

  useEffect(() => {
    if (story.reduced) {
      story.mode = "pose";
      return;
    }
    const t1 = window.setTimeout(() => {
      if (!story.held) story.mode = "point";
    }, 400);
    const t2 = window.setTimeout(() => {
      if (!story.held) story.mode = "pose";
    }, 4200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [chapter]);

  useEffect(() => {
    if (story.reduced || pose !== "accounts" || mode === "point") {
      setIdle("rest");
      return;
    }
    let i = 0;
    const frames = ["rest", "blink", "rest", "squash", "rest"];
    const id = window.setInterval(() => {
      i = (i + 1) % frames.length;
      setIdle(frames[i]);
    }, 1200);
    return () => window.clearInterval(id);
  }, [chapter, mode, pose]);

  const onPoke = () => {
    pokeCount.current += 1;
    story.held = true;
    story.mode = "point";
    story.quip = nudgeFor(pokeCount.current);
    story.poke += 1;
    if (story.reduced || !hop.current) return;
    gsap
      .timeline()
      .to(hop.current, { scaleY: 0.86, scaleX: 1.08, duration: 0.1, ease: "power2.in" })
      .to(hop.current, { scaleY: 1.05, scaleX: 0.97, duration: 0.16, ease: "power2.out" })
      .to(hop.current, { scaleY: 1, scaleX: 1, duration: 0.18, ease: "power2.out" });
  };

  const onMove = (e) => {
    if (story.reduced || !leanX.current) return;
    const box = hit.current?.getBoundingClientRect();
    if (!box) return;
    const dx = (e.clientX - (box.left + box.width / 2)) / box.width;
    const dy = (e.clientY - (box.top + box.height / 2)) / box.height;
    leanX.current(clamp(dx * 14, -10, 10));
    leanY.current(clamp(-dy * 10, -8, 8));
  };

  const onLeave = () => {
    if (story.reduced) return;
    leanX.current?.(0);
    leanY.current?.(0);
  };

  return (
    <>
      <svg ref={layer} className="aim-layer" aria-hidden="true">
        <path ref={path} className="aim-path" />
        <circle ref={fromDot} className="aim-from" r="3.5" />
        <circle ref={toDot} className="aim-to" r="5.5" />
      </svg>

      <aside
        className={`mascot-stage${meta.flip ? " is-flip" : ""}${mode === "point" ? " is-pointing" : ""}`}
        style={{ "--sit": `${meta.sit}px` }}
      >
        <p className="mascot-say" aria-live="polite" key={spoken}>
          <span className="mascot-say-label">Robo</span>
          {spoken}
          {quip ? null : <span className="mascot-say-hint">Click a line. I will point.</span>}
        </p>
        <div className="mascot-hop" ref={hop}>
          <div className="mascot-body" ref={stage}>
            <div className="mascot-ground" aria-hidden="true" />
            <button
              type="button"
              ref={hit}
              className="mascot-hit"
              onClick={onPoke}
              onPointerMove={onMove}
              onPointerLeave={onLeave}
              aria-label="The RoboSEO mascot. Click to get his attention."
            >
              <img
                className="mascot-pose"
                data-pose={pose}
                src={src}
                alt=""
                width="720"
                height="720"
                draggable="false"
              />
            </button>
            <span className="mascot-hot" ref={hot} aria-hidden="true" />
          </div>
        </div>
      </aside>
    </>
  );
}
