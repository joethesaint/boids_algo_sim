# Boids Flocking Simulation

An interactive 3D flocking simulation built with Three.js, implementing Craig Reynolds' boids algorithm with an added ecosystem layer including predators and food sources. This version is highly optimized for performance and visual fidelity.

![Boids Simulation](https://img.shields.io/badge/Three.js-r132-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Classic Boids Rules**: Separation, Alignment, and Cohesion.
- **Dynamic Ecosystem**: 
  - **Species**: Small Fish, Large Fish, and Birds with different behaviors and perception radii.
  - **Predators**: Hunt boids with cooldown periods and sophisticated targeting.
  - **Food Sources**: Attract boids and can be consumed/respawned.
- **Cinematic Visuals**:
  - **Real-time Glow**: UnrealBloomPass for soft light bleeding.
  - **Ambient Occlusion**: SSAOPass for depth shadows in dense swarms.
  - **Tone Mapping**: ACES Filmic tone mapping for a professional photorealistic look.
- **Interactive Controls**:
  - Adjust flocking weights and perception ranges in real-time.
  - Modify ecosystem ratios and predator behavior.
- **State-of-the-Art Performance**: Capable of simulating thousands of boids smoothly on modern hardware.

## Optimization & Architecture

- **Spatial Partitioning**: Implements a **Spatial Hash Grid** to reduce neighbor lookup complexity from $O(N^2)$ to $O(N \log N)$ or better.
- **Instanced Rendering**: Utilizes `THREE.InstancedMesh` to render all boids of a specific species in a single draw call, minimizing GPU overhead.
- **Memory Management**: Zero-allocation "hot" loops. Uses object pooling and scratchpad vectors to prevent garbage collection stuttering during simulation.
- **Frame-Rate Independence**: Physics calculations use `deltaTime` to ensure consistent simulation speed across 60Hz, 144Hz, and higher refresh rate monitors.

## How to Run

Simply open `index.html` in any modern web browser. No local server is required as it uses CDN-hosted Three.js and consolidated logic for maximum portability.

## Controls

- **Left Mouse**: Rotate camera
- **Right Mouse / Arrows**: Pan camera
- **Scroll**: Zoom in/out
- **UI Panels**: Expand/collapse sections to adjust simulation parameters in real-time.

## AI Attribution

AI was instrumental in the development of this simulation. This project was built using AI as a primary engineering tool, spanning multiple models and interfaces including **Antigravity** and the **Gemini CLI**.

## License

This project is open-source and available under the MIT License.
