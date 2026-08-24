export const IDLE = {
  rest: "./mascot/bible.png",
  blink: "./mascot/idle-blink.png",
  squash: "./mascot/idle-squash.png",
};

export const POSES = {
  accounts: "./mascot/accounts.png",
  projects: "./mascot/projects.png",
  search: "./mascot/search.png",
  site: "./mascot/site.png",
  blogs: "./mascot/blogs.png",
  studio: "./mascot/studio.png",
  social: "./mascot/social.png",
  keywords: "./mascot/keywords.png",
  links: "./mascot/links.png",
  reports: "./mascot/reports.png",
  admin: "./mascot/admin.png",
  help: "./mascot/help.png",
  point: "./mascot/point.png",
};

/**
 * hx/hy are the gesture origin on the sprite (finger, glass, visor).
 * flip mirrors him so the gesture faces the copy on the left.
 */
export const META = {
  accounts: { hx: 0.28, hy: 0.4, flip: false, sit: 0 },
  projects: { hx: 0.64, hy: 0.54, flip: true, sit: 0 },
  search: { hx: 0.74, hy: 0.42, flip: true, sit: 0 },
  site: { hx: 0.34, hy: 0.48, flip: false, sit: 0 },
  blogs: { hx: 0.5, hy: 0.5, flip: true, sit: 0 },
  studio: { hx: 0.58, hy: 0.4, flip: true, sit: 36 },
  social: { hx: 0.32, hy: 0.3, flip: true, sit: 0 },
  keywords: { hx: 0.48, hy: 0.5, flip: true, sit: 0 },
  links: { hx: 0.5, hy: 0.5, flip: true, sit: 0 },
  reports: { hx: 0.52, hy: 0.52, flip: true, sit: 0 },
  admin: { hx: 0.48, hy: 0.5, flip: true, sit: 0 },
  help: { hx: 0.7, hy: 0.72, flip: true, sit: 0 },
  point: { hx: 0.1, hy: 0.48, flip: false, sit: 0 },
  bible: { hx: 0.5, hy: 0.28, flip: false, sit: 0 },
};

export function poseSrc(pose) {
  return POSES[pose] || POSES.accounts;
}

export function poseMeta(pose) {
  return META[pose] || META.accounts;
}

export function allSpriteSrc() {
  return [...Object.values(POSES), ...Object.values(IDLE)];
}
