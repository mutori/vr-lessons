# Light Up the Village (Grades 5–7)

An original WebXR circuits game for Grades 5 to 7. It runs in the **Meta Quest Browser**
(Quest 2, 3, 3S, Pro) with no app install, and in any desktop browser for teachers to preview.
Hands work best (pinch and touch); controllers work the same way.

The learner stands at a workbench under a msasa tree in a village homestead and helps Tendai, who
stands by the board, waves, claps, cheers and reacts to mistakes and short circuits, with five
missions, a night-time bonus and a free-build workshop. Every bulb, pump and spark comes from a real circuit calculation (nodal analysis), so
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
| Bonus | Find the chickens | After mission 1, night falls: pick up your own torch and shine it around the yard to find Tendai's 3 lost chickens. | Uses of electricity, light |
| 6 | Workshop | Free build with plenty of parts plus a buzzer and a fan, and five challenges in any order: three bulbs; a buzzer with a switch; a fan spinning both ways (turn the cell round); two cells for an extra-bright bulb; two bulbs each with its own switch. | Circuits, cells in series, household circuits |

Each mission ends with one question. A mission gives one star for finishing and one for answering
the question right the first time (10 stars in all). Workshop challenges are ticked off as they are
done. Progress is saved on the device and listed on the web page after leaving VR, so a teacher can note it.

## Look and feel

The visuals follow a short set of rules (from Meta's VR design guidance and low-poly art practice):

* **One focal point.** The workbench and board sit in the middle; the hut frames the left, the solar pump
  the right, the msasa tree shades the learner, and granite kopjes fade into the haze behind.
* **One palette.** Warm earth, thatch and msasa reds against a cool sky. The sun is a warm key light; the sky
  fills the shadows with cool blue. Neutral tone mapping keeps colours true.
* **Depth.** Fog takes the horizon colour, so far hills fade into it; soft contact shadows ground every hut,
  tree and the table; a real shadow map over the bench shows where a held part will land.
* **Commit to low poly.** Flat-shaded shapes, with textures only where they tell a story: swept-yard soil,
  mud walls with a painted band, thatch, wood grain.
* **Life without clutter.** Chickens peck in the yard, birds wheel over the kopjes, motes drift by day,
  fireflies and stars come out at night, light spills from the hut windows.
* **Juicy feedback.** Parts squash into place with a puff of dust; a bulb sparkles when it first lights and
  throws a warm pool of light on the board; a short circuit throws sparks; finished missions rain confetti.
  On controllers, picking, placing and flipping give a small buzz.
* **Comfort and reading.** Big plain (non-italic) text on an unlit board, no flashing, no camera movement.
  A Read aloud button reads the board for younger readers.

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
  In the workshop, a quick pinch on a placed cell turns it round (pinch and pull lifts it off).
* **Quest, controllers:** trigger (or grip) to pick up and place; touch with the controller tip, or point and pull the trigger.
* **Computer:** click a part, then click an empty gap. Click a switch lever to flip it. Drag to look around.
  Right-click a placed cell in the workshop to turn it round (or hover it and press F).
  Keys: 1–6 missions (6 is the workshop), R restart, C clear board, N next mission.

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
* Desktop: the workshop (buzzer with a switch, fan both ways after a right-click turns the cell round,
  two cells adding up and cancelling when opposed, own switches, three bulbs), Read aloud, and the
  mission-1 night bonus (pick up the torch, find all three chickens, Next clears it).
* About 150 draw calls and 23,000 triangles in the main view (static scenery is baked into a few meshes).
* Emulated Meta Quest 3 (IWER): tracked hands (pinch to pick and place, pinch in the air to return,
  poking the switch and buttons, quick pinch and pinch-and-pull on a switch) and controllers
  (point and trigger to pick, place and flip).
* Not yet tested on a physical headset.
