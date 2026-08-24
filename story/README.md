# RoboSEO.Ai story site

Standalone public field guide. Not part of the Next app.

```bash
cd story
npm install
npm run build
```

`npm run build` writes `dist/` (HTML, CSS, JS, fonts, robot mark). Upload that folder, or on Render:

- Type: Static Site
- Root Directory: `story`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

`npm run dev` starts Vite for live preview.
