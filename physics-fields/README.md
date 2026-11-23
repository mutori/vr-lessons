# Field Lab (A-Level Physics, Form 6)

An original WebXR game on **electromagnetism, electromagnetic induction, alternating current and charged
particles in fields**, written for the ZIMSEC A-Level (Forms 5–6) Physics syllabus. It runs in the
**Meta Quest Browser** (hands or controllers) and in any desktop browser.

The learner stands at a lab bench (with a window onto the Harare hills) in front of a control panel.

## Why this topic

The syllabus puts *Electromagnetism*, *Electromagnetic induction* and *Alternating currents* in Form 6,
and *charged particles in fields* (deflection, velocity selection, mass spectrometry) under Modern Physics.
These are among the hardest A-Level ideas because forces act at right angles in three dimensions.
On paper students twist their hands at diagrams; in VR they can lean round the magnet and see it.

## The five experiments

| Experiment | What the learner does | Syllabus ideas |
|---|---|---|
| 1. Motor Effect | Four random 3D set-ups with flowing field lines: grab a green arrow and aim it (or press a direction button) to predict the force, then switch the current on and watch the wire jump. A miss shows a 3D left hand. Part B: turn the wire on a protractor turntable to halve the force. | Fleming's left-hand rule, F = BIL sin θ |
| 2. Particle Paths | Turns a field-strength dial and flips the field up or down (the Helmholtz coils glow and their current circulates) so a proton, an electron and an alpha particle land on a glowing detector. Past shots stay as faint ghost trails. | F = Bqv, r = mv/Bq, negative charges curve the other way, no work done by a magnetic force |
| 3. Mass Spectrometer | Turns the plate-voltage dial of a velocity selector (the plates glow and E-field arrows grow) until only 2.0 × 10⁵ m/s ions pass, then slides a marker along the ruler to measure the neon-20, -21 and -22 lines while a live histogram counts arrivals. | qE = Bqv so v = E/B, E = V/d, r = mv/Bq ∝ m |
| 4. Induction | Slides a bar magnet (with its field lines) in and out of a 200-turn coil. A centre-zero meter swings, red and green LEDs show the current's direction, charge flows round the coil and a hum rises with the e.m.f. | Faraday's law E = −N dΦ/dt, Lenz's law |
| 5. Generator | Winds a crank to turn a coil between magnet poles (it keeps spinning like a flywheel), then uses a motor dial. An oscilloscope draws the a.c. trace and a bulb lights. Tasks: one full cycle, light the bulb, double the speed, find the angle of biggest e.m.f. | E = BANω sin ωt, Φ = BA cos θ, peak and frequency both ∝ ω |

Each experiment ends with exam-style questions; a wrong answer explains the mistake. Stars are saved in the browser.

## Story and levels

**Power for Chinyika Clinic.** Dr Farai Moyo, head of the Field Lab, is building a small hydro power station for a
rural clinic with no mains power. Every experiment tests a part of it: motors for the pumps and fans, particle
detectors for the X-ray room's radiation monitor, a spectrometer for water testing, induction and the generator
itself. Dr Moyo briefs each level (with a portrait on the board) and reacts to the result; the learner is promoted
as stars add up: Lab Assistant → Technician → Engineer → Senior Engineer → Chief Engineer. Finishing every level
lights the clinic.

Each experiment has three levels (15 in all, 45 stars). Level 1 teaches the idea; levels 2 and 3 use it in a new
situation with new exam-style questions. A level opens when the one before it has at least one star.

| Experiment | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| 1. Motor Effect | Fleming's Rule (4 set-ups, then half force) | Pump Motor Check (6 set-ups, no hand chart, then 75% force) | Fan Motor Spec (new B, I and L; set exactly 0.025 N) |
| 2. Particle Paths | Proton, Electron, Alpha | Isotope Beams (deuteron, positron, helium-3 nucleus) | Mystery Particles (mass unknown: fire a test shot, find m = Bqr/v; a muon and a lithium ion) |
| 3. Mass Spectrometer | Neon Lines (3 isotopes) | Chlorine Check (new speed; Ar = 35.5) | Unknown Sample (find the metal: magnesium) |
| 4. Induction | Faraday and Lenz | Coil Design (fair test with 100, 200 and 400 turns: E ∝ N) | Lenz Predictions (predict the needle for N/S pushed in/pulled out) |
| 5. Generator | Hand Generator | Clinic Lamp (400 turns; full and half brightness; find zero e.m.f.) | Match the Trace (choose N and speed to copy two oscilloscope traces) |
Particle paths and ion motion use real values (e = 1.60 × 10⁻¹⁹ C, 1 u = 1.66 × 10⁻²⁷ kg).

## How it looks and feels (design rules applied)

Based on Meta's VR design guidelines (see `a-level-physics-vr/design-rules.md` in the project files):
one colour language (field blue, current yellow, force green, N red, S blue, electric field red-orange);
direct manipulation (dials, grab handles, a crank, switches) with hover glow, sound and haptics on every
control; bold text on dark boards near the centre of view; a warm key light, a cool rim light, image-based
reflections and soft contact shadows; additive glows instead of full-screen effects to keep the Quest frame
rate up; a bouncing arrow that points at what to try next.

## Controls

* **Quest, hands:** touch buttons with your fingertip; pinch anything that glows when your hand is near (dials, the force arrow, the magnet, the crank, the marker); point and pinch for things further away.
* **Quest, controllers:** touch with the controller tip, or point and pull the trigger; hold the trigger to drag or turn. Right stick snap-turns.
* **Computer:** click buttons, drag dials, handles and the magnet, drag the background to look around, scroll to zoom.

## Files

* `index.html`, `main.js` (the game), `kit.js` (shared lesson kit; uses `../shared/xr-input.js`), `vendor/` (Three.js r170, MIT).

## Testing done

Automated play-throughs on 23 November 2026, all passing with no console errors, in headless desktop Chromium (mouse only) and in the Meta IWER Quest 3 emulator.
Desktop: 41 checks across all five experiments, including mouse drags of the force arrow, the wire on the turntable, the field dial, the ruler marker, the magnet and the crank, every judged outcome, and every question set. Quest 3 emulator: 10 checks with hands (finger poke, pinch-turn the dial, pinch-slide the magnet into the coil, wind the crank by hand) and controllers (ray + trigger, tip poke, ray-drag the force arrow).
Story version (23 November 2026): a further 53 desktop checks play levels 2 and 3 of every experiment (6-round motor checks with 75% and 0.025 N targets, the isotope and mystery particles found from a test shot, chlorine and magnesium spectra, the coil-turns fair test, the four Lenz predictions, the clinic lamp and both trace matches), and the level-1 desktop (42) and Quest 3 emulator (10) runs were repeated through the new level picker. All pass with no console errors.
Testing on a real headset is still to be done.
