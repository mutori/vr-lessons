# O-Level Science Lab VR

An original WebXR science lab where an O-Level student carries out five core practicals.
It runs in the **Meta Quest Browser** (Quest 2, 3, 3S, Pro) with no app install, sideloading
or store account, and also in any desktop browser for teachers to preview.

## The five practicals and why these five

| Bench | Practical | Subject | Why it was chosen |
|---|---|---|---|
| 1 | Food tests: iodine (starch), Benedict's (reducing sugar, heated), biuret (protein) | Biology / Combined Science | Core food-test practical; tests three different reagents and the "must heat" rule. |
| 2 | Acid–base titration (HCl into NaOH, methyl orange) with a mole calculation | Chemistry | The most heavily examined quantitative practical; trains burette reading, end-point control and the c = n/V calculation. |
| 3 | Tests for gases: H₂ (squeaky pop), O₂ (relights glowing splint), CO₂ (limewater milky) | Chemistry / Combined Science | Standard identification tests that appear across papers. |
| 4 | Identifying metal ions with NaOH(aq): Cu²⁺, Fe²⁺, Fe³⁺ | Chemistry | Core qualitative analysis: precipitate colours. |
| 5 | Simple pendulum: period vs length, estimate of g | Physics | Core physics practical: repeat timings, 20 oscillations to cut reaction-time error, tables and derived quantities. |

The choice follows the practical content common to O-Level science papers. A science teacher
should confirm it against the current ZIMSEC syllabus for the school's subject codes.

Each bench gives a step-by-step method on the board, a yellow arrow on the next thing to use,
live results, sound feedback, a "Restart this practical" button, and a closing question.
Titration end points are randomised so every attempt is different, and overshooting is possible.

## Design lessons taken from other VR labs

* Text is big and sits on the bench board right in front of the student (usability studies found small or distant text was the most common complaint).
* One tool held at a time; selecting a different tool puts the first one back.
* Comfort: teleport pads and snap turning by default; smooth walking is optional on the left stick.
* Clear prompts: a bobbing arrow marks the next object, names appear when you point at things, and success and error sounds play.
* Quick recovery: every bench can be restarted on its own.
* A short tutorial first: putting on the safety goggles teaches point-and-select before any practical.
* Works with Quest hand tracking (pinch to select) as well as controllers.

## Open it on a Meta Quest

1. Put on the headset and open the **Browser** app.
2. Go to the lab's web address (the HTTPS link you were given).
3. Wait for the lab to load, then press **ENTER VR** at the bottom of the page and allow access if asked.
4. Point at the goggles on the table to your right and pull the trigger. Then pick a bench.

WebXR needs HTTPS. GitHub Pages and most hosts provide it automatically.

## Controls

* **Quest:** point and pull the trigger (or pinch) to use; point at a green floor pad to move there; right stick turns; left stick walks.
* **Computer:** click to use, drag to look, W A S D to walk, 1–5 to jump to a bench, H to go back to the start.

## Run it locally

Any static web server works, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. There is no build step, and Three.js is included in `vendor/`,
so the lab works without an internet connection to a CDN.

## Files

* `index.html` – page and on-screen help
* `main.js` – the whole lab (room, apparatus, the five practicals, VR and desktop controls)
* `vendor/` – Three.js r170 and its VRButton helper (MIT licence, see `vendor/THREE-LICENSE`)

Sources reviewed for these lessons:
[VR digital design lab usability study (Frontiers in VR, 2025)](https://www.frontiersin.org/articles/10.3389/frvir.2025.1566680/full),
[Chemistry VR lab for Quest 2 (ICVRV 2022)](https://hiherlab.github.io/docs/publications/pdf/%5BC13%5D2022.11.ICVRV.ChemistryVR.pdf),
[Mixed Reality Chemistry Lab for Meta Quest 3](https://dc-i2.arcabc.ca/_flysystem/repo-bin/2025-04/Mixed%20Reality%20Chemistry%20Lab%20for%20the%20Meta%20Quest%203_Secured.pdf).
