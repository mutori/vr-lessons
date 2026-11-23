# Light Up the Village (Grades 5–7)

An original WebXR circuits game for Grades 5 to 7. It runs in the **Meta Quest Browser**
(Quest 2, 3, 3S, Pro) with no app install, and in any desktop browser for teachers to preview.
Hands work best (pinch and touch); controllers work the same way.

The learner stands at a workbench in a village homestead and helps Tendai's family with five
missions. Every bulb, pump and spark comes from a real circuit calculation (nodal analysis), so
whatever the learner builds behaves like the real thing: open loops stay dark, a wire across the
cell is a short circuit, two bulbs in series are dim and go out together, two in parallel stay bright.

## Why this topic

The ZIMSEC primary **Science and Technology** syllabus (Junior, Grades 3–7) has an
*Electricity and Electronics* topic (sources of electricity, conductors and insulators, safety,
flow of current, electric circuits, household circuits) and an *Energy and Fuels* topic
(solar energy and how it is harnessed, forms of energy). Circuits were chosen because:

* they are abstract for this age: current cannot be seen, so the game shows it as moving yellow dots;
* many schools do not have enough cells, bulbs and wires for every learner to build circuits by hand;
* they are hands-on by nature, which is what VR does well, and they link directly to everyday
  Zimbabwean life: torches, lighting a home, and solar power for pumping water.

A teacher should confirm the fit against the school's current scheme of work.

## The five missions

| # | Mission | What the learner does | Syllabus link |
|---|---|---|---|
| 1 | Make a torch | Build a complete loop with a cell, a bulb and wires; add a switch and turn it off and on. | Electric circuits, flow of current, open and closed circuits |
| 2 | Conductor or insulator? | Put 8 everyday objects into a tester's gap, watch the bulb, and sort each one. | Conductors and insulators |
| 3 | Fix the faults | Find and fix five broken torches: switch off, missing wire, blown bulb, flat cell, short circuit. | Circuits, safety precautions (short circuits) |
| 4 | Light up the hut | Light two rooms in series (dim; one out, both out), then in parallel (bright, independent). The hut's windows light up. | Household circuits |
| 5 | Solar water pump | Connect a solar panel, switch and pump; fill the garden's tank. A cloud slows the pump. | Solar energy, energy changes (light → electrical → kinetic) |

Each mission ends with one question. A mission gives one star for finishing and one for answering
the question right the first time (10 stars in all). Progress is saved on the device and listed on
the web page after leaving VR, so a teacher can note it.

## Design choices

* **One workbench, no walking.** Everything is within reach of a child standing (or seated: the view
  lifts automatically). No thumbsticks are needed.
* **Hands first.** Pinch a part to pick it up (it stays in the hand), pinch over an empty gap to place
  it, pinch in the air to put it back. Touch the red switch lever or the buttons. A quick pinch on a
  placed switch flips it; pinch and pull lifts it off. The gap that will be used is outlined in yellow
  before the pinch, and a pinch uses the gap that was outlined just before the fingers closed.
* **Clear guidance.** Big text on the board in front, a yellow arrow on what to use next, hints after
  25 seconds, sounds for success and mistakes, and Restart / Clear board buttons. In mission 3 the
  arrow only appears with the hint, so learners diagnose the fault themselves first.
* **Safety taught through play.** A wire across the cell makes it glow red and sound an alarm.

## Controls

* **Quest, hands:** pinch to pick up and place; touch buttons and the switch lever; point and pinch for things out of reach.
* **Quest, controllers:** trigger (or grip) to pick up and place; touch with the controller tip, or point and pull the trigger.
* **Computer:** click a part, then click an empty gap. Click a switch lever to flip it. Drag to look around.
  Keys: 1–5 missions, R restart, C clear board, N next mission.

## Run it locally

```
python3 -m http.server 8000
```

from the repository root, then open http://localhost:8000/primary-circuits/. There is no build step;
Three.js is in `vendor/`, and the shared hands-first input lives in `../shared/xr-input.js`.
Add `?debug=1` to the address to see frame rate and input in the headset.

## Files

* `index.html` – page, on-screen help and progress
* `main.js` – the whole game: village, workbench, circuit solver, five missions, VR and desktop controls
* `vendor/` – Three.js r170 and its VRButton helper (MIT licence, see `vendor/THREE-LICENSE`)

## Testing done

* Desktop: an automated play-through of all five missions with real mouse clicks (circuit results,
  short circuits, sorting, the five faults, restart, clear board, series and parallel, the cloud,
  questions and stars), with no page errors.
* Emulated Meta Quest 3 (IWER): tracked hands (pinch to pick and place, pinch in the air to return,
  poking the switch and buttons, quick pinch and pinch-and-pull on a switch) and controllers
  (point and trigger to pick, place and flip).
* Not yet tested on a physical headset.
