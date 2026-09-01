const header = document.querySelector("[data-header]");
const toggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const story = document.querySelector("[data-story]");
const video = document.querySelector("[data-story-video]");
const chapters = [...document.querySelectorAll("[data-chapter]")];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let videoReady = false;
let ticking = false;

const storyProgress = () => {
  if (!story) return 0;
  const total = story.offsetHeight - window.innerHeight;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, -story.getBoundingClientRect().top / total));
};

const setChapter = (progress) => {
  const index = Math.min(chapters.length - 1, Math.floor(progress * chapters.length));
  chapters.forEach((chapter, i) => chapter.classList.toggle("is-on", i === index));
};

const paint = () => {
  ticking = false;
  const progress = storyProgress();
  setChapter(progress);

  if (header && story) {
    header.classList.toggle("is-solid", story.getBoundingClientRect().bottom <= 80);
  }

  if (videoReady && video && !reduceMotion && Number.isFinite(video.duration)) {
    const t = progress * Math.max(0, video.duration - 0.08);
    if (Math.abs(video.currentTime - t) > 0.04) {
      video.currentTime = t;
    }
  }
};

const onScroll = () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(paint);
};

if (video) {
  video.pause();
  const markReady = () => {
    videoReady = true;
    paint();
  };
  if (video.readyState >= 1) markReady();
  video.addEventListener("loadedmetadata", markReady);
}

paint();
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);

toggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    toggle?.setAttribute("aria-expanded", "false");
  });
});

const goldPrice = document.querySelector("[data-gold-price]");
const goldCta = document.querySelector("[data-gold-cta]");
const buttons = document.querySelectorAll("[data-period]");

buttons.forEach((btn) => {
  btn.addEventListener("click", () => {
    buttons.forEach((other) => {
      other.classList.toggle("is-on", other === btn);
      other.setAttribute("aria-selected", String(other === btn));
    });
    const yearly = btn.dataset.period === "year";
    if (goldPrice) {
      goldPrice.innerHTML = yearly
        ? "$83.29<span data-gold-cadence> / month, billed yearly</span>"
        : "$99.99<span data-gold-cadence> / month</span>";
    }
    if (goldCta) {
      goldCta.href = yearly
        ? "https://portal.shipsearch.com/registration?sub=Gold&price=year"
        : "https://portal.shipsearch.com/registration?sub=Gold&price=month";
    }
  });
});
