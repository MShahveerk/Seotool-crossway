import { useEffect, useMemo, useRef, useState } from "react";
import { chapters, groups, site } from "../content.js";
import { nudgeFor } from "../mascot/lines.js";
import { story } from "../scene/store.js";

function Cluster({ cluster, prefix, aimed }) {
  return (
    <div className="cluster">
      <h3>{cluster.heading}</h3>
      <dl>
        {cluster.items.map((item) => {
          const id = `${prefix}-${item.label}`;
          return (
            <div
              key={item.label}
              className={`pair${aimed === id ? " is-aim" : ""}`}
              data-point={id}
              data-say={`That is ${item.label}.`}
              role="button"
              tabIndex={0}
            >
              <dt>{item.label}</dt>
              <dd>{item.body}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function aimAt(hit, poke) {
  if (!hit) return;
  const key = hit.getAttribute("data-point");
  if (!key) return;
  story.targetKey = key;
  story.mode = "point";
  story.held = true;
  story.quip = hit.getAttribute("data-say") || nudgeFor(poke);
  story.poke += 1;
}

export function Overlay() {
  const [current, setCurrent] = useState(0);
  const [aim, setAim] = useState("title");
  const poke = useRef(0);
  const active = chapters[current] || chapters[0];
  const activeGroup = active?.group;

  const groupChapters = useMemo(() => {
    const map = new Map();
    for (const g of groups) map.set(g.id, []);
    for (const c of chapters) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group).push(c);
    }
    return map;
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastChapter = -1;
    let lastAim = "";
    const tick = () => {
      if (story.chapter !== lastChapter) {
        lastChapter = story.chapter;
        setCurrent(story.chapter);
      }
      if (story.targetKey !== lastAim) {
        lastAim = story.targetKey;
        setAim(story.targetKey);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const main = document.getElementById("story");
    if (!main) return;
    const onClick = (e) => {
      const hit = e.target.closest("[data-point]");
      if (!hit || !main.contains(hit)) return;
      aimAt(hit, poke.current++);
    };
    const onKey = (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const hit = e.target.closest("[data-point]");
      if (!hit || e.target !== hit) return;
      e.preventDefault();
      aimAt(hit, poke.current++);
    };
    main.addEventListener("click", onClick);
    main.addEventListener("keydown", onKey);
    return () => {
      main.removeEventListener("click", onClick);
      main.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      <nav className="rail" aria-label="Manual">
        <p className="rail-brand">{site.name}</p>
        {groups.map((g) => {
          const kids = groupChapters.get(g.id) || [];
          const first = kids[0];
          return (
            <a
              key={g.id}
              href={first ? `#chapter-${first.id}` : "#chapter-intro"}
              aria-current={activeGroup === g.id ? "true" : undefined}
              title={g.label}
            >
              <span className="rail-dot" />
              <span className="rail-label">{g.label}</span>
            </a>
          );
        })}
      </nav>
      <main id="story">
        {chapters.map((c, i) => {
          const live = i === current;
          const marked = (key) => (live && aim === key ? " is-aim" : "");
          return (
            <section
              key={c.id}
              id={`chapter-${c.id}`}
              className={`chapter chapter-${c.id} ${i === 0 ? "chapter-first" : ""}`}
              data-id={c.id}
            >
              <div className="chapter-inner">
                {c.kicker ? <p className="kicker">{c.kicker}</p> : <p className="kicker">{site.name}</p>}
                {i === 0 ? (
                  <h1 className={marked("title")} data-point="title" tabIndex={0}>
                    {c.title}
                  </h1>
                ) : (
                  <h2 className={marked("title")} data-point="title" tabIndex={0}>
                    {c.title}
                  </h2>
                )}
                <span className="rule" aria-hidden="true" />
                <p className={`lead${marked("lead")}`} data-point="lead" data-say="Start with this." tabIndex={0}>
                  {c.lead}
                </p>
                {c.how ? (
                  <p
                    className={`meta${marked("how")}`}
                    data-point="how"
                    data-say="This is where you open it."
                    tabIndex={0}
                  >
                    <strong>Where.</strong> {c.how}
                  </p>
                ) : null}
                {c.needs ? (
                  <p
                    className={`meta${marked("needs")}`}
                    data-point="needs"
                    data-say="This is what you need first."
                    tabIndex={0}
                  >
                    <strong>Needs.</strong> {c.needs}
                  </p>
                ) : null}
                {(c.paragraphs || []).map((p, pi) => {
                  const id = `p-${pi}`;
                  return (
                    <p key={p.slice(0, 40)} className={`body${marked(id)}`} data-point={id} tabIndex={0}>
                      {p}
                    </p>
                  );
                })}
                {(c.steps || []).length ? (
                  <ol className="steps">
                    {c.steps.map((s, si) => {
                      const id = `step-${si}`;
                      return (
                        <li
                          key={s}
                          className={live && aim === id ? "is-aim" : undefined}
                          data-point={id}
                          data-say={`Step ${si + 1}.`}
                          tabIndex={0}
                        >
                          {s}
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
                {(c.clusters || []).map((cluster) => (
                  <Cluster
                    key={cluster.heading}
                    cluster={cluster}
                    prefix={`c-${cluster.heading}`}
                    aimed={live ? aim : ""}
                  />
                ))}
                {c.note ? (
                  <p className={`note${marked("note")}`} data-point="note" data-say="A limit. I mean it." tabIndex={0}>
                    {c.note}
                  </p>
                ) : null}
                {c.footer ? <p className="footer-mark">{c.footer}</p> : null}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}
