# Boids Flocking Simulation

An interactive 3D flocking simulation built with Three.js, implementing Craig Reynolds' boids algorithm with an added ecosystem layer including predators and food sources. This version is highly optimized for performance and visual fidelity.

![Boids Simulation](https://img.shields.io/badge/Three.js-r132-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **The Solar Heart**: A central, pulsating power source that dictates the orbit and flow of the entire boid collective.
- **Classic Boids Rules**: Separation, Alignment, and Cohesion.
- **Cinematic Visuals**:
  - **Dynamic Nebula Starfield**: Thousands of stars and cosmic glows.
  - **Custom Light Ribbons**: Shader-based trails that fade organically over time.
  - **Supernatural Bloom**: High-intensity light bleeding for a "solar" feel.
  - **Tone Mapping**: ACES Filmic for photography-grade color reproduction.
- **State-of-the-Art Performance**: Optimized Spatial Hash Grid and Instanced Rendering.

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
