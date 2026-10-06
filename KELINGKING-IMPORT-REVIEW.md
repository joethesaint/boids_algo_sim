# Kelingking + Flamingos import review

Local package: `kelingking-flamingos/`  
Source archive: `/storage/emulated/0/Download/Kelingking-Flamingos.zip`  
Archive SHA-256: `b925d889b213e43306626f08b70f481e64e9dff26aa8ced965a8f006ef80f1ff`

## Current state

- The full standalone preview is `Kelingking-Flamingos.html` (54 MB). It is self-contained and is the correct file to use for local review.
- The modular source is 3.7 MB. It includes terrain, water, vegetation, sky, scroll experience, and a 36/72-bird flamingo system.
- `node source/src/birds/test.mjs` passes the 36- and 72-bird terrain-clearance and speed-bound checks.
- The source folder does not include the terrain bake or source textures. It must extract them from the standalone preview before it can run by itself.

## Repository boundary

`kelingking-flamingos/` is ignored by Git. This keeps the 54 MB standalone file and third-party assets out of the Boids deployment while we review the world. Nothing in the existing Hollowmere, Bliss, or Cloudreach routes was changed.

## Licences and deployment

- Kelingking code: MIT, Samnang Aing.
- Terrain data: OpenStreetMap-derived, ODbL.
- Surface textures: Poly Haven, CC0.
- Flamingo: Mirada / ROME, CC BY-NC-SA 3.0.

Do not publish the imported package as part of a commercial site without resolving the flamingo asset's non-commercial restriction. A deployment-ready version should use a compatible bird asset, preserve all source credits, extract only the assets it needs, and avoid committing the large standalone preview.

## Next safe step

Review the standalone page locally. If it should become a fourth deployed universe, create a slim build from the source and replace the ROME flamingo with a compatible asset before connecting it to the Boids navigation.
