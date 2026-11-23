# Field Lab (A-Level Physics, Form 6)

An original WebXR game on **electromagnetism, electromagnetic induction and charged particles in
fields**, written for the ZIMSEC A-Level (Forms 5–6) Physics syllabus. It runs in the **Meta Quest
Browser** (hands or controllers) and in any desktop browser.

## Why this topic

The syllabus puts *Electromagnetism*, *Electromagnetic induction* and *Alternating currents* in Form 6,
and *charged particles in fields* (deflection, velocity selection, mass spectrometry) under Modern Physics.
These are among the hardest A-Level ideas because forces act at right angles in three dimensions.
On paper students twist their hands at diagrams; in VR they can lean round the magnet and see it.

## The four missions

| Mission | What the learner does | Syllabus ideas |
|---|---|---|
| 1. Motor Effect | Four random 3D set-ups: predict which way a current-carrying wire is pushed (pinch an arrow or press its button). A wrong answer shows a 3D "left hand". Then turns the wire to find the angle that halves the force. | Fleming's left-hand rule, F = BIL sin θ |
| 2. Particle Paths | Sets the size **and** direction of B so a proton, an electron and an alpha particle land on a detector. Each miss explains itself (wrong way, too weak, too strong). | F = Bqv, r = mv/Bq, negative charges curve the other way, no work done by a magnetic force |
| 3. Mass Spectrometer | Sets the plate voltage of a velocity selector so only 2.0 × 10⁵ m/s ions pass, then watches neon-20, -21 and -22 land on a detector with a ruler and works out a mass. | qE = Bqv so v = E/B, E = V/d, r = mv/Bq ∝ m |
| 4. Induction | Pinches a bar magnet and pushes it in and out of a 200-turn coil joined to a centre-zero meter: push in, hold still, pull out, go fast, turn the magnet round. The coil end shows the induced pole. | Faraday's law E = −N dΦ/dt, Lenz's law |

Each mission ends with exam-style questions; a wrong answer explains the mistake. Stars are saved in the browser.
Particle paths and ion motion use real values (e = 1.60 × 10⁻¹⁹ C, 1 u = 1.66 × 10⁻²⁷ kg), and the apparatus is drawn at real size.

## Controls

* **Quest, hands:** touch buttons with your fingertip; pinch a slider knob, an arrow or the magnet; point and pinch for things further away.
* **Quest, controllers:** touch with the controller tip, or point and pull the trigger; hold the trigger to drag. Right stick snap-turns.
* **Computer:** click buttons and arrows, drag knobs and the magnet, drag the background to look around, scroll to zoom.

## Files

* `index.html`, `main.js` (the game), `kit.js` (shared lesson kit; uses `../shared/xr-input.js`), `vendor/` (Three.js r170, MIT).

## Testing done

Played through all four missions in desktop Chromium, and in the Meta IWER Quest 3 emulator with
emulated hands (finger pokes, pinch on arrows, pinch-and-push of the magnet through the whole induction
sequence) and controllers. No console errors. Testing on a real headset is still to be done.
