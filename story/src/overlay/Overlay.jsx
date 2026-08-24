import { useEffect, useMemo, useState } from "react";
import { chapters, groups, site } from "../content.js";
import { story } from "../scene/store.js";

function Cluster({ cluster }) {
  return (
    <div className="cluster">
      <h3>{cluster.heading}</h3>
      <dl>
        {cluster.items.map((item) => (
          <div key={item.label} className="pair">
            <dt>{item.label}</dt>
            <dd>{item.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Overlay() {
  const [current, setCurrent] = useState(0);
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
    let last = -1;
    const tick = () => {
      if (story.chapter !== last) {
        last = story.chapter;
        setCurrent(last);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
        {chapters.map((c, i) => (
          <section
            key={c.id}
            id={`chapter-${c.id}`}
            className={`chapter chapter-${c.id} ${i === 0 ? "chapter-first" : ""}`}
            data-id={c.id}
          >
            <div className="chapter-inner">
              {c.kicker ? <p className="kicker">{c.kicker}</p> : <p className="kicker">{site.name}</p>}
              {i === 0 ? <h1>{c.title}</h1> : <h2>{c.title}</h2>}
              <span className="rule" aria-hidden="true" />
              <p className="lead">{c.lead}</p>
              {c.how ? (
                <p className="meta">
                  <strong>Where.</strong> {c.how}
                </p>
              ) : null}
              {c.needs ? (
                <p className="meta">
                  <strong>Needs.</strong> {c.needs}
                </p>
              ) : null}
              {(c.paragraphs || []).map((p) => (
                <p key={p.slice(0, 40)} className="body">
                  {p}
                </p>
              ))}
              {(c.steps || []).length ? (
                <ol className="steps">
                  {c.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              ) : null}
              {(c.clusters || []).map((cluster) => (
                <Cluster key={cluster.heading} cluster={cluster} />
              ))}
              {c.note ? <p className="note">{c.note}</p> : null}
              {c.footer ? <p className="footer-mark">{c.footer}</p> : null}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
