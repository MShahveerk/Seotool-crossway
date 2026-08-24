import { useEffect, useState } from "react";
import { chapters, site } from "../content.js";
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
      <nav className="rail" aria-label="Chapters">
        <p className="rail-brand">{site.name}</p>
        {chapters.map((c, i) => (
          <a
            key={c.id}
            href={`#chapter-${c.id}`}
            aria-current={current === i ? "true" : undefined}
            aria-label={c.kicker || c.title}
          />
        ))}
      </nav>
      <main id="story">
        {chapters.map((c, i) => (
          <section
            key={c.id}
            id={`chapter-${c.id}`}
            className={`chapter chapter-${c.id} ${i % 2 ? "chapter-even" : "chapter-odd"}`}
            data-id={c.id}
          >
            <div className="chapter-inner">
              {c.kicker ? <p className="kicker">{c.kicker}</p> : <p className="kicker">{site.name}</p>}
              {i === 0 ? <h1>{c.title}</h1> : <h2>{c.title}</h2>}
              <span className="rule" aria-hidden="true" />
              <p className="lead">{c.lead}</p>
              {(c.paragraphs || []).map((p) => (
                <p key={p.slice(0, 24)} className="body">
                  {p}
                </p>
              ))}
              {(c.clusters || []).map((cluster) => (
                <Cluster key={cluster.heading} cluster={cluster} />
              ))}
              {c.footer ? <p className="footer-mark">{c.footer}</p> : null}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
