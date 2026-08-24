# RoboSEO.Ai story site

Standalone public product manual. Not part of the Next app.

```bash
cd story
npm install
npm run build
```

`npm run build` writes `dist/`. On Render:

- Type: Static Site
- Root Directory: `story`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

`npm run dev` starts Vite for live preview.

The robot is a 2D narrator in `public/mascot/`, drawn from the product mark. He talks, hops between chapters, and points at the line you click. No Three.js.
