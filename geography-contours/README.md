# Reading the Land: Contours and Relief (Form 2 Geography VR lesson)

A WebXR lesson for Meta Quest (Quest Browser) that also runs in any desktop browser.
Pure static files: no build step, no server code, no external CDN at runtime.

## Lesson flow (about 15 minutes)
1. Objectives and four key words (pre-training).
2. Station 1: flood a table-top model 20 m at a time; each shoreline becomes a contour line. Predict, then watch the hill flatten into a map.
3. Station 2: eight pins (hill, steep slope, gentle slope, plateau, spur, valley, ridge, saddle). Flatten/raise to compare land and map.
4. Station 3: stand at real size south of Dombo Hill, point at the steeper side, then visit the summit.
5. Seven-question map test with feedback (two are "point at the map" tasks), score and summary.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000

## Host
Any static host works (GitHub Pages, Netlify, Cloudflare Pages). WebXR needs HTTPS.

Files: index.html, app.js (lesson), terrain.js (landscape maths), vendor/ (three.js r170, MIT).
