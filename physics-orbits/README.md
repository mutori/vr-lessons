# Orbit Command (A-Level Physics, Form 5)

An original WebXR game on **gravitational fields and circular motion**, written for the ZIMSEC
A-Level (Forms 5–6) Physics syllabus. It runs in the **Meta Quest Browser** (hands or controllers)
with no install, and in any desktop browser for teachers to preview.

## Why this topic

The syllabus puts *Circular motion* and *Gravitational field* in Form 5 (Newtonian Mechanics).
Students find them hard because they are invisible and three-dimensional: an inverse-square field,
"gravity provides the centripetal force", and an orbit that must match the turning Earth. In VR the
learner stands beside a scaled Earth, launches a real-physics satellite and watches the result.

## The three missions

| Mission | What the learner does | Syllabus ideas |
|---|---|---|
| 1. Field Probe | Slides a probe out from Earth and records g at 1R, 2R, 3R, 4R. A graph builds itself. Three questions follow. | g = GM/r², inverse-square law, φ = −GM/r, r measured from the centre |
| 2. Into Orbit | Works out the speed for a circular orbit 400 km up (ISS height), sets it and launches. Too slow crashes, a little off gives an ellipse, too fast escapes, each with an explanation. | GMm/r² = mv²/r, v = √(GM/r), T = 2πr/v, free fall and "weightlessness" |
| 3. Geostationary | Chooses height, direction and orbit plane so a TV satellite stays over Zimbabwe's longitude for a whole simulated day. A dish in Harare tracks it and the ground track is drawn on the Earth. | T = 24 h, r³ = GMT²/4π², h = r − R, equatorial and eastward |

Each mission gives live readouts, hints that cost stars, sound and colour feedback, and exam-style
multiple-choice questions where a wrong answer explains the mistake and allows another try.
Stars are saved in the browser.

The flight in mission 2 is a numerical integration of Newton's law of gravitation (velocity Verlet),
so every speed gives the true trajectory. Data values match the exam data sheet:
G = 6.67 × 10⁻¹¹ N m² kg⁻², M = 6.00 × 10²⁴ kg, R = 6.40 × 10⁶ m.

## Controls

* **Quest, hands:** touch buttons with your fingertip; pinch a yellow slider knob and slide it; point and pinch for things out of reach.
* **Quest, controllers:** touch with the controller tip, or point and pull the trigger; hold the trigger on a knob to slide it. Right stick snap-turns.
* **Computer:** click buttons, drag a knob, drag the background to look around, scroll to zoom.

## Files

* `index.html` – page and on-screen help
* `main.js` – the game
* `kit.js` – shared lesson kit (renderer, boards, buttons, sliders, questions); uses `../shared/xr-input.js`
* `vendor/` – Three.js r170 and its VRButton (MIT licence, see `vendor/THREE-LICENSE`)

## Testing done

Played through all three missions in desktop Chromium, and in the Meta IWER Quest 3 emulator with
emulated hands (finger pokes, pinch-drag of a slider, hand rays) and controllers (ray + trigger, tip poke).
No console errors. Testing on a real headset is still to be done.
