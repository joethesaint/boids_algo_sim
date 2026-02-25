# Boids Flocking Simulation

An interactive 3D flocking simulation built with Three.js, implementing Craig Reynolds' boids algorithm with an added ecosystem layer including predators and food sources.

![Boids Simulation](https://img.shields.io/badge/Three.js-r132-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Classic Boids Rules**: Separation, Alignment, and Cohesion.
- **Dynamic Ecosystem**: 
  - **Species**: Small Fish, Large Fish, and Birds with different behaviors.
  - **Predators**: Hunt boids with cooldown periods.
  - **Food Sources**: Attract boids and can be consumed.
- **Interactive Controls**:
  - Adjust flocking weights in real-time.
  - Modify ecosystem ratios and spawn rates.
  - Control lighting (Ambient, Directional, Edge).
  - Follow a random boid in "FPS-style" view.
- **Performance**: Efficient rendering of 150+ boids with real-time FPS monitoring.
- **Dark Theme**: Optimized for visibility and contrast.

## How to Run

Simply open `index.html` in any modern web browser. No local server is required as it uses CDN-hosted Three.js.

## Controls

- **Left Mouse**: Rotate camera
- **Right Mouse / Arrows**: Pan camera
- **Scroll**: Zoom in/out
- **UI Panels**: Expand/collapse sections to adjust simulation parameters.

## Implementation Details

- **Three.js**: Used for 3D rendering and basic physics.
- **OrbitControls**: For intuitive scene navigation.
- **Custom Physics**: Weighted steering behaviors for complex emergent movement.
- **Spatial Partitioning**: Implements a **Spatial Hash Grid** to optimize neighbor lookups from $O(N^2)$ to $O(N)$, ensuring high performance even with large flocks.
- **Instanced Rendering**: Uses `THREE.InstancedMesh` to render hundreds of boids in a single draw call, drastically reducing GPU overhead and CPU-to-GPU communication.
- **Frame-Rate Independence**: All movement and physics calculations use `deltaTime` to ensure consistent simulation speed across different monitor refresh rates.

## AI Attribution

AI was instrumental in the development of this simulation. This project was built using AI as a primary engineering tool, spanning multiple models and interfaces including **Antigravity** and the **Gemini CLI**.

## License

This project is open-source and available under the MIT License.
