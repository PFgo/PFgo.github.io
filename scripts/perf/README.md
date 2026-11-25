# Animation performance checks

These checks drive the Chrome installed on this machine (through `playwright-core`;
no browser download) against `dist/`, served by the script itself. Run them before
and after changing anything that moves: the opening, the street glide, the flag,
the walkers, or anything that appears while the street is moving.

```sh
cd scripts/perf
npm install            # once
npm run perf           # every check, about 5 minutes
npm run perf -- glides --phone --runs=2
```

| Check | What it does | What good looks like |
| --- | --- | --- |
| `smoke` | Loads the page, walks all four stops, collects failed requests and script errors | `OK` |
| `opening` | The camera pullback (desktop at full speed, phone at 4× slower CPU) | 0 dropped frames |
| `glides` | Clicks the top nav after the opening: Projects → Education → Say hi → About → Projects | 0 dropped, 0 slow |
| `swipes` | Eight touch swipes on a phone, four away from About and four back | under 0.5% dropped |
| `hurry` | Clicks Projects while the opening is still zooming | largest one-frame change well under 0.2 |

Options: `--phone` (390×844 at 3×, touch), `--cpu=N` (CPU throttling), `--runs=N`,
`--url=https://pfgo.github.io/` (test the published site instead of `dist/`).

## Reading the numbers

- **dropped**: frames Chrome's compositor did not present (its `PipelineReporter`
  trace). This is what a visitor sees as a hitch.
- **slow**: animation frames more than 20ms apart, measured in the page.
- A dropped frame at a fixed moment, run after run, usually means something
  started mid-motion and needed a new compositing layer or an image decode: a
  walker crossing into view, a note fading in, a canvas starting. Give it its
  layer before the motion starts (see the stop notes in `heading-ink.css`).

## Known limits

- This is Chrome emulating a phone, not a phone. iPhone Safari holds
  `requestAnimationFrame` to 60fps while finger scrolling runs at 120Hz on
  ProMotion screens. That difference only shows on a real device.
- Playwright's bundled WebKit runs at about 9fps on this Mac, so it cannot stand
  in for Safari here.
- The browser window must fit on the screen; a viewport taller than the display
  produces dropped frames that a real visitor would never see.
- Results move by a frame or two between runs. Compare several runs before and
  after a change rather than a single number.
