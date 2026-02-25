# Boids Flocking Simulation

An interactive 3D flocking simulation built with Three.js, implementing Craig Reynolds' boids algorithm with an added ecosystem layer including predators and food sources. This version is highly optimized for performance and visual fidelity.

![Boids Simulation](https://img.shields.io/badge/Three.js-r132-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Classic Boids Rules**: Separation, Alignment, and Cohesion.
- **Dynamic Ecosystem**: 
  - **Species**: Small Fish, Large Fish, and Birds with distinct visual styles.
  - **Predators**: Sophisticated hunt-and-consume cycles.
  - **Food Sources**: Dynamic energy sources that attract and nourish boids.
- **Cinematic Visuals**:
  - **Custom Shader Trails**: GLSL-based light ribbons that fade organically over time.
  - **Supernatural Bloom**: High-intensity light bleeding for a premium aesthetic.
  - **Tone Mapping**: ACES Filmic for photography-grade color reproduction.
  - **Glassmorphism UI**: Modern, translucent control panel.
- **State-of-the-Art Performance**: Optimized Spatial Hash Grid and Instanced Rendering for thousands of boids.

## Optimization & Architecture

- **Spatial Partitioning**: Implements a **Spatial Hash Grid** to reduce neighbor lookup complexity from $O(N^2)$ to $O(N)$ for local interactions.
- **Instanced Rendering**: Utilizes `THREE.InstancedMesh` to render all boids of a specific species in a single draw call, minimizing GPU overhead.
- **Memory Management**: Zero-allocation "hot" loops. Uses object pooling and scratchpad vectors to prevent garbage collection stuttering during simulation.
- **Frame-Rate Independence**: Physics calculations use `deltaTime` to ensure consistent simulation speed across varying refresh rates.

## How to Run

1. **Clone the repository.**
2. **Open `index.html`** in any modern web browser.
   > *Note: For Audio Reactivity (Microphone access), some browsers may require a local server (e.g., `python -m http.server` or a VS Code Live Server extension).*

## Controls

*   **Camera Navigation:**
    *   **Left Mouse (Drag):** Rotate the camera around the simulation.
    *   **Right Mouse (Drag) / Arrows:** Pan the camera target.
    *   **Scroll Wheel:** Zoom in and out.
*   **UI Panels & Features:**
    *   **Simulation Data (Left Panel):** View real-time FPS and total boid count. Add or remove boids using the buttons.
    *   **Simulation Controls (Left Panel):** Pause/resume the simulation, reset the state, or toggle "Follow Boid" mode.
    *   **Flocking Rules (Left Panel):** Fine-tune Reynolds' algorithms (Separation, Alignment, Cohesion) using live sliders.
    *   **Ecosystem Control (Right Panel):** Adjust the species ratio and tweak rendering settings (Bloom, Ambient Light).
    *   **Features Toggle (Right Panel):** Enable or disable Custom Trails, the Food System, and Predator logic.
    *   **Audio Reactivity (Right Panel):** Click **Enable Microphone** to allow the flock to react to live audio input.

## AI Attribution

AI was instrumental in the development of this simulation. This project was built using AI as a primary engineering tool, spanning multiple models and interfaces including **Antigravity** and the **Gemini CLI**.

## License

This project is open-source and available under the MIT License.
