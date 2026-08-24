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
};

export function poseSrc(pose) {
  return POSES[pose] || POSES.accounts;
}
