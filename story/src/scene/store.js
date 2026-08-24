export const story = {
  progress: 0,
  chapter: 0,
  reduced: false,
  mobile: false,
};

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function blendIndex(progress, count) {
  const x = Math.max(0, Math.min(0.9999, progress)) * (count - 1);
  const i = Math.floor(x);
  return { i, t: x - i, j: Math.min(count - 1, i + 1) };
}

export function mixPose(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) {
    const av = a[key];
    const bv = b[key];
    if (Array.isArray(av)) out[key] = lerp3(av, bv, t);
    else out[key] = lerp(av, bv, t);
  }
  return out;
}

/* Each pose is a job the robot is doing, not a tilt. */
export const POSES = [
  {
    cam: [0.2, 0.55, 13.5],
    look: [0, 0.15, 0],
    robot: [0.15, -0.35, 0],
    rot: [0.12, 0.55, 0],
    scale: 0.62,
    glass: 0,
    charts: 0,
    stars: 0,
    papers: 0,
    tiles: 0,
    reports: 0,
    spot: 0,
    rest: 0,
    ring: 0.25,
  },
  {
    cam: [2.4, 0.35, 7.4],
    look: [-0.2, 0.25, 0],
    robot: [-0.15, -0.05, 0],
    rot: [0.02, -0.55, 0],
    scale: 1,
    glass: 0,
    charts: 0.15,
    stars: 0,
    papers: 0,
    tiles: 0.15,
    reports: 0,
    spot: 0,
    rest: 0,
    ring: 1,
  },
  {
    cam: [-1.8, 0.5, 6.6],
    look: [0.4, 0.2, 0],
    robot: [0.55, -0.05, 0],
    rot: [0.05, 0.7, 0],
    scale: 1.05,
    glass: 1,
    charts: 0.85,
    stars: 0,
    papers: 0,
    tiles: 0,
    reports: 0,
    spot: 0,
    rest: 0,
    ring: 0.7,
  },
  {
    cam: [1.6, 1.1, 7.2],
    look: [0, 0.1, 0],
    robot: [-0.35, -0.15, 0],
    rot: [0.15, -0.4, 0],
    scale: 0.95,
    glass: 0.2,
    charts: 1,
    stars: 0,
    papers: 0,
    tiles: 0,
    reports: 0,
    spot: 0,
    rest: 0,
    ring: 0.9,
  },
  {
    cam: [0, 0.2, 8.8],
    look: [0, 0.4, 0],
    robot: [0, 0.15, -0.4],
    rot: [-0.15, 0.2, 0],
    scale: 0.88,
    glass: 0,
    charts: 0.2,
    stars: 1,
    papers: 0,
    tiles: 0,
    reports: 0,
    spot: 0,
    rest: 0,
    ring: 0.4,
  },
  {
    cam: [2.1, 0.45, 6.8],
    look: [-0.3, 0.15, 0],
    robot: [-0.5, -0.1, 0],
    rot: [0.08, -0.85, 0],
    scale: 1,
    glass: 0,
    charts: 0,
    stars: 0,
    papers: 1,
    tiles: 0,
    reports: 0,
    spot: 0,
    rest: 0,
    ring: 0.55,
  },
  {
    cam: [-2.2, 0.4, 7],
    look: [0.35, 0.15, 0],
    robot: [0.45, -0.08, 0],
    rot: [0.04, 0.9, 0],
    scale: 1,
    glass: 0,
    charts: 0.25,
    stars: 0,
    papers: 0,
    tiles: 1,
    reports: 0,
    spot: 0,
    rest: 0,
    ring: 0.6,
  },
  {
    cam: [0.4, 0.9, 7.6],
    look: [0, 0.05, 0],
    robot: [0.2, -0.2, 0],
    rot: [0.2, -0.15, 0],
    scale: 0.92,
    glass: 0,
    charts: 0,
    stars: 0,
    papers: 0.2,
    tiles: 0,
    reports: 1,
    spot: 0,
    rest: 0,
    ring: 0.5,
  },
  {
    cam: [0, 0.3, 5.8],
    look: [0, 0.35, 0],
    robot: [0, 0.05, 0.2],
    rot: [0, 0, 0],
    scale: 1.08,
    glass: 0,
    charts: 0,
    stars: 0,
    papers: 0,
    tiles: 0,
    reports: 0,
    spot: 1,
    rest: 0,
    ring: 0.2,
  },
  {
    cam: [0.8, 0.15, 8.4],
    look: [0, -0.05, 0],
    robot: [0.1, -0.45, 0],
    rot: [0.25, 0.15, 0],
    scale: 0.82,
    glass: 0,
    charts: 0,
    stars: 0,
    papers: 0,
    tiles: 0,
    reports: 0,
    spot: 0,
    rest: 1,
    ring: 0.08,
  },
];
