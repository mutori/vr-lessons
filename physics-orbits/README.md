# Orbit Command (A-Level Physics, Form 5)

An original WebXR game on **gravitational fields and circular motion**, written for the ZIMSEC
A-Level (Forms 5–6) Physics syllabus. It runs in the **Meta Quest Browser** (hands or controllers)
with no install, and in any desktop browser for teachers to preview.

You are the flight controller for ZimSat-1, a Zimbabwean satellite, standing on an observation deck
in space beside a holographic Earth.

## Why this topic

The syllabus puts *Circular motion* and *Gravitational field* in Form 5 (Newtonian Mechanics).
Students find them hard because they are invisible and three-dimensional: an inverse-square field,
"gravity provides the centripetal force", an orbit that must match the turning Earth, and energy in a
potential well. In VR the learner stands beside a scaled Earth, launches a real-physics satellite and
watches the result.

## The four missions

| Mission | What the learner does | Syllabus ideas |
|---|---|---|
| 1. Field Probe | Grabs a glowing probe and carries it out from Earth through flowing field lines; it snaps onto the 1R–4R rings to record g. An equipotential bubble follows the probe, and a graph builds itself. | g = GM/r², inverse-square law, φ = −GM/r, r measured from the centre |
| 2. Into Orbit | Pushes a throttle lever to set the launch speed for a circular orbit 400 km up, then launches (3-2-1). Too slow crashes in a fireball, a little off gives an ellipse, too fast escapes. The last flight stays as a ghost to compare with; a balance bar compares gravity with the force a circle needs. | GMm/r² = mv²/r, v = √(GM/r), T = 2πr/v |
| 3. Geostationary | Pulls the satellite out to the right height and flips switches for direction and orbit plane, so a TV satellite stays over Harare for a whole simulated day. A dish in Harare tracks it and signal pulses fly along the beam. | T = 24 h, r³ = GMT²/4π², h = r − R, equatorial and eastward |
| 4. Escape Velocity (new) | Fires a probe straight up with a chosen speed and watches kinetic energy turn into potential energy on 3D energy bars and a potential-well graph. Finds the least speed that never comes back. | Eₚ = −GMm/r, ½mv² − GMm/r ≥ 0, v = √(2GM/R) = 11.2 km/s |

Each mission gives live readouts, sound, haptics and colour feedback, a bouncing arrow that shows what to
try next, and exam-style questions where a wrong answer explains the mistake and allows another try.
Stars are saved in the browser.

## Story and levels

**The ZimSat Programme.** Director Rudo Chikwanha runs mission control. Zimbabwe is building its own satellite
fleet and the learner is the newest controller. She briefs every level (with a portrait on the board), reacts
to the result, and the learner is promoted as stars add up: Cadet → Flight Engineer → Mission Specialist →
Senior Controller → Flight Director. Finishing every level unlocks the finale.

Each mission now has three levels (12 in all, 36 stars). Level 1 teaches the idea; levels 2 and 3 use it in a
new situation with new exam-style questions. A level opens when the one before it has at least one star; the
menu shows a level picker for each mission, and "Next level" carries straight on.

| Mission | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| 1. Field Probe | Survey the Field (g at 1R–4R) | Map the Potential (φ = −GM/r and its graph) | Find the Spot (carry the probe to where g has a given value; g is hidden until recorded) |
| 2. Into Orbit | Test Flight (400 km) | Earth Watcher (2000 km) | Four-Hour Relay (find the height for T = 4 h, then the speed) |
| 3. Geostationary | TV Over Harare (geostationary) | Polar Mapper (a 2-hour polar orbit) | Three-Hour Relay (a 3-hour equatorial orbit) |
| 4. Escape Velocity | Leave Earth (from the surface) | High Platform (from 2R) | From the GEO Depot (from geostationary height) |

Mission 2 is a numerical integration of Newton's law of gravitation (velocity Verlet); mission 4 integrates
the radial motion the same way, so every speed gives the true result. Data values match the exam data sheet:
G = 6.67 × 10⁻¹¹ N m² kg⁻², M = 6.00 × 10²⁴ kg, R = 6.40 × 10⁶ m.

## How it looks and feels (design rules applied)

Based on Meta's VR design guidelines and common real-time rendering practice (see
`a-level-physics-vr/design-rules.md` in the project files):

* One colour language: gravity red, velocity green, "needed" force yellow, field blue, interactive cyan.
* Direct manipulation: a throttle lever, grabbable probe and satellite, flip switches, instead of flat sliders.
  Every control has hover glow, a press animation, a sound and a controller/hand haptic pulse.
* Text is bold, on dark panels, near the middle of the view; boards are about 30° either side.
* Lighting: a sun key light, a blue rim light and an image-based environment; a day/night Earth with
  city lights, moving clouds, sea glint and an atmosphere glow. Bloom is faked with additive glow sprites
  (no full-screen effects, to keep the frame rate high on a Quest). The camera never moves on its own.

## Controls

* **Quest, hands:** touch buttons with your fingertip; pinch anything that glows when your hand is near (lever, probe, satellite, switches); point and pinch for things out of reach.
* **Quest, controllers:** touch with the controller tip, or point and pull the trigger; hold the trigger to drag. Right stick snap-turns.
* **Computer:** click buttons, drag levers and glowing objects, drag the background to look around, scroll to zoom.

## Files

* `index.html` – page and on-screen help
* `main.js` – the game
* `kit.js` – shared lesson kit (renderer, lighting, boards, buttons, levers, dials, switches, grabbing, particles, sound, questions); uses `../shared/xr-input.js`
* `assets/earth-day.jpg`, `assets/earth-night.jpg` – NASA Blue Marble and Black Marble images (public domain, NASA Earth Observatory), as packaged with the MIT-licensed three-globe examples
* `vendor/` – Three.js r170 and its VRButton (MIT licence, see `vendor/THREE-LICENSE`)

## Testing done

Automated play-throughs on 23 November 2026, all passing with no console errors, in headless desktop Chromium (mouse only) and in the Meta IWER Quest 3 emulator.
Desktop: 25 checks across all four missions, including mouse drags of the probe, lever and satellite, every launch outcome (crash, ellipse, circle, escape, geostationary drift and lock), and every question set. Quest 3 emulator: 12 checks with hands (finger poke, pinch-carry the probe, pinch-push the lever, ray-pinch LAUNCH) and controllers (ray + trigger, tip poke, ray-drag the lever).
Story version (23 November 2026): a further 34 desktop checks play levels 2 and 3 of every mission (the potential map, placing instruments by g, the 2000 km and 4-hour orbits, the polar and 3-hour orbits, escape from 2R and from geostationary height), and the level-1 desktop (25) and Quest 3 emulator (13) runs were repeated through the new level picker. All pass with no console errors.
Testing on a real headset is still to be done.
