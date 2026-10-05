# Wings birds in Hollowmere

Bird mesh designs and elliptical perch-wire mathematics are adapted from [Danny Gelman's Wings](https://github.com/dannygelman1/Wings), copyright 2022, under the MIT licence. See WINGS-LICENSE.txt. The compiled geometry in wings-adapter.js preserves the original mesh normals and assigns explicit wing masks; it uses the same raw local coordinates as Wings' animated meshes, scaled to Hollowmere.

Open prototype.html and choose **Perch flock** to bring the birds onto unique wire slots. **Release flock** staggers take-off. Mobile keeps 110 birds; desktop keeps 280. Flying and folded birds use two compact instanced buffers, with shared shading and GPU wing rotation. Hollowmere's spatial grid, flock steering, follow camera and hawk are retained. Gliding intervals depend on steering effort and climb.

This is a visual behaviour adaptation, not a biomechanics model or a complete port of Wings. The hawk still shares the flight geometry at a larger scale. Arrival avoids terrain but does not yet avoid building/tree colliders.

## Verification
After installing the repository dependencies, run:
```sh
node hollowmere/tests/wings.test.mjs
```
Checks desktop/mobile flock budgets, unique wire slots, landing, staggered release, finite instance attributes, hiding/freezing and wing masks. JavaScript syntax was checked. Browser rendering and physical-phone performance remain unverified: the available Chromium process crashed at launch.

