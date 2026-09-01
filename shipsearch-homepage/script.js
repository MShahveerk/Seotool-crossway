const header = document.querySelector("[data-header]");
const toggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const video = document.querySelector(".hero-video");

const onScroll = () => {
  header.classList.toggle("is-solid", window.scrollY > 24);
};

onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

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

if (video && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  video.pause();
} else if (video) {
  video.playbackRate = 0.8;
}

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
