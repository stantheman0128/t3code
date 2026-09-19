# Codex, Cursor, Claude desktop vs T3 Code

Compared one product at a time from this machine’s installed packages (and official stills where the live window was not capturable). Axes: smoothness, cohesion, animation.

A 1:1 clone of the full desktop shells is not possible inside T3 (Cursor Glass workbench, Claude ion-dist + Anthropicons + rearrangeable panes, Codex Owl + busy-bar). Those binaries stay out of the repo. Opt-in provider chrome copies each product’s measured chat-surface grammar.

## Codex

**Smoothness:** One busy-bar pill is the live actor. No CSS shine on every tool row. T3 default runs `live-tool-shine 2.2s steps(30)` plus activity-focus plus a banner stack — competing loops.

**Cohesion:** Roomy 16px/1.75 sans, mint `#10a37f`, pill composer, user bubble ~72% width, paper canvas. T3 default is a dense glass console with Lucide 2px and a shared `max-w-3xl`.

**Animation:** State-machine vector pill + still fallback; calm when idle. T3 default quantizes shine while focused and scales the send control on hover.

## Cursor

**Smoothness:** `--default-transition-duration: 150ms`. `--global-animation-timing: ease` when focused; `steps(30)` only on `.window-unfocused`. T3 default quantizes the primary live label while focused.

**Cohesion:** Glass Agents Window is one chrome: 13.5px, 8px radii, 12px icons, orange `#f54e00`. T3 default mixes glass, banners, and tool-row chrome.

**Animation:** 100ms composer notice fade; expensive FX isolated to a worker. T3 default uses 220ms / 200ms / 150ms clocks.

## Claude

**Smoothness:** CDS ladder 60 / 120 / 200 / 300 / 450ms and `--cds-ease-snap`. T3 default is ad-hoc 150 / 200 / 220 / 2.2s.

**Cohesion:** Cream page, serif 16/1.7, 42rem column, flat white composer, 6px status-dot. T3 default is a console with stacked notices.

**Animation:** Variable-font ANIM axis; artifact iframe 120ms opacity. T3 default is infinite shine plus dual working timers.
