import { chapters, site } from "./content.js";
import "./style.css";

const story = document.getElementById("story");
const rail = document.querySelector(".rail");

const supportsViewTimeline =
  typeof CSS !== "undefined" && CSS.supports?.("animation-timeline", "view()");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleHtml(text, tag) {
  return `<${tag} class="rise">${escapeHtml(text).replace(/\n/g, "<br />")}</${tag}>`;
}

function render() {
  rail.insertAdjacentHTML(
    "beforeend",
    chapters
      .map(
        (c, i) =>
          `<a href="#chapter-${c.id}" data-id="${c.id}" ${i === 0 ? 'aria-current="true"' : ""}>${c.rail}</a>`
      )
      .join("")
  );

  story.innerHTML = chapters
    .map((c, i) => {
      const points = c.points
        ? `<ul class="points">${c.points
            .map((p) => `<li><strong>${escapeHtml(p.label)}</strong><span>${escapeHtml(p.body)}</span></li>`)
            .join("")}</ul>`
        : "";
      const aside = c.aside ? `<p class="aside">${escapeHtml(c.aside)}</p>` : "";
      const kicker = i === 0 ? `${site.kicker} · ${c.kicker}` : c.kicker;
      const heading = titleHtml(c.title, i === 0 ? "h1" : "h2");
      const foot =
        c.id === "limits"
          ? `<p class="footer-mark">${escapeHtml(site.name)} · ${escapeHtml(site.tagline)}</p>`
          : "";
      return `<section class="chapter chapter-${c.id}" id="chapter-${c.id}" data-id="${c.id}">
        <div class="chapter-inner">
          <p class="kicker rise">${escapeHtml(kicker)}</p>
          ${heading}
          <span class="rule" aria-hidden="true"></span>
          <p class="lead rise">${escapeHtml(c.lead)}</p>
          ${aside}
          ${points}
          ${foot}
        </div>
      </section>`;
    })
    .join("");
}

function setCurrent(id) {
  rail.querySelectorAll("a[data-id]").forEach((a) => {
    if (a.dataset.id === id) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
}

function observe() {
  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.dataset.id) setCurrent(visible.target.dataset.id);
    },
    { rootMargin: "-35% 0px -45% 0px", threshold: [0.1, 0.25, 0.5] }
  );
  document.querySelectorAll(".chapter").forEach((s) => io.observe(s));

  if (supportsViewTimeline) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.querySelectorAll(".rise, .rule, .points li").forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(18px)";
    el.style.transition =
      "opacity 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1)";
    const one = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.style.opacity = "1";
          el.style.transform = "none";
          one.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    one.observe(el);
  });
}

render();
observe();

const start = location.hash;
if (start) document.querySelector(start)?.scrollIntoView();
