# Boids — 3D Flocking Simulation

Live demo: https://joethesaint.github.io/boids_algo_sim/

World-first demo: https://joethesaint.github.io/boids_algo_sim/hollowmere/prototype.html

The root demo preserves the original boids laboratory. **Enter Universe** opens the Hollowmere world, with Android-friendly navigation, a movable menu, flock controls, and Follow a bird. The return action and Android back gesture restore the laboratory.

> Built to explore three questions: *How does complex group behaviour emerge from simple rules? What are the real performance limits of WebGL on mobile? And how do you design a UI that lives on top of a live 3D canvas without fighting it?*

**Three.js r132 · Vanilla JS · No build step**

---

## What it is

A real-time 3D flocking simulation — 250+ autonomous agents (boids) each following three local rules that produce globally emergent behaviour: murmuration, schooling, evasion. Built on Craig Reynolds' 1987 algorithm, extended with a full predator/prey ecosystem, two visual themes, audio reactivity, and a glassmorphism control panel.

This is not a tutorial follow-along. Every system — the spatial index, the trail renderer, the post-processing pipeline, the UI — was designed and built from scratch.

---

## Why it's hard (the interesting parts)

### 1. The N² problem
Naively, checking every boid against every other boid is **O(N²)** — at 500 boids that's 250,000 comparisons per frame, per rule. Unacceptable at 60fps.

**Solution:** A custom **Spatial Hash Grid** that maps 3D space into fixed-size cells. Each boid only queries its immediate neighbourhood — reducing lookups to roughly **O(1)** regardless of total count. The predator AI reuses the same grid rather than maintaining a separate structure.

### 2. Draw call explosion
Early version: one `THREE.Line` per boid trail = **250 draw calls** for trails alone. GPU stalls, frame drops.

**Solution:** A **batched trail system** — all trails of a given species share a single `LineSegments` mesh backed by a ring-buffer. 250 draw calls → **1**. The entire flock renders in 3 draw calls total via `InstancedMesh`.

### 3. Mobile performance
Desktop WebGL and Android Chrome are very different environments. The same scene that runs at 120fps on desktop can drop to 15fps on a mid-range phone.

**Solution:** Device detection at load, automatic budget tuning (boid count, FPS cap, trail system toggled off, bloom resolution halved). The simulation stays usable on a 2021 Android phone.

### 4. UI on a live canvas
A control panel that lives over a 3D scene has two failure modes: it obscures the content, or it gets lost in it. Most overlay UIs pick one failure.

**Solution:** A **liquid glass** system — layered `backdrop-filter`, inset edge highlights, and a `::before` diagonal sheen that reads as floating glass at any zoom level, in both dark and blueprint themes. No CSS library. Every visual property is a CSS custom property so the entire theme is a single class toggle on `body`.

### 5. Post-processing as a theme layer
Blueprint mode needed a full-screen graph-paper grid. Adding it as geometry would be expensive and wouldn't sit at the right depth.

**Solution:** A custom **GLSL ShaderPass** injected into the EffectComposer pipeline — two-scale grid (56px major / 14px minor) plus vignette, added and removed dynamically on theme toggle. Zero geometry cost.

---

## Architecture

```
Simulation (main.js)
├── SpatialHashGrid        — O(1) neighbour lookup, shared by boids + predators
├── Boid                   — steering, boundary avoidance, food-seeking, flocking
├── Predator               — priority-scored hunt using spatial grid
├── TrailSystem            — ring-buffer LineSegments, one draw call per species
├── EffectComposer chain   — RenderPass → UnrealBloomPass → BlueprintPass (opt.)
├── applyTheme()           — dark / blueprint mode, all materials + lighting + passes
├── setupUI()              — bind() + delegated localStorage persistence
└── createBlueprintPass()  — GLSL graph-paper grid + vignette shader
```

---

## Features

| System | Detail |
|---|---|
| **Flocking** | Separation · Alignment · Cohesion + wander + species avoidance |
| **Ecosystem** | 3 species · predators with hunt cooldown · food sources · habitat layering |
| **Rendering** | InstancedMesh · custom GLSL trails · ACES tone mapping · Unreal Bloom |
| **Themes** | Dark (cinematic) ↔ Blueprint (navy + cyan + wireframe boids + grid shader) |
| **UI** | Liquid glass panels · FAB quick-controls popover · mobile drawer |
| **Persistence** | All 19 settings saved to localStorage, restored on reload |
| **Audio** | Microphone reactivity via Web Audio API |
| **Mobile** | Auto-budget tuning · safe-area-inset · Android Chrome tested |

---

## Running locally

```bash
git clone https://github.com/joethesaint/boids_algo_sim
cd boids_algo_sim
python3 -m http.server 8080 --bind 127.0.0.1
# open http://127.0.0.1:8080
```

No npm. No build. One file open.

---

## Controls

| Input | Action |
|---|---|
| Left drag | Orbit camera |
| Scroll | Zoom |
| Mouse move | Influence flock (attract / steer) |
| ▶ FAB (bottom-right) | Quick flocking controls popover |
| Features panel | Toggle trails · food · predators · blueprint mode |

---

## AI Attribution

Built using AI as a primary engineering collaborator across **Antigravity** and **Gemini CLI** — for architecture decisions, debugging, shader authoring, and UI iteration. All code reviewed, tested, and understood before committing.

---

MIT License
