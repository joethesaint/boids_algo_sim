# Navigation review

Reviewed downloads: app-designer.zip (extracted to ../app-designer-reference.6jXKvZ), REVIEW.md (biogas-specific review), Hollowmere-2-scenes-1.html (identical to Hollowmere-2-scenes.html). The ZIP is a design toolkit, not a replacement world or application. Used its layout, motion and copy references; its iOS mockup workflow is not applied to this web app.

## Findings and implementation

- Critical: opacity-only hiding left invisible controls intercepting navigation. The menu now closes with the native hidden attribute, removing its controls from pointer and keyboard interaction.
- High: too many actions covered the landscape. One persistent labelled orbit menu opens a bounded, scrollable panel. Flock adjustments and help use disclosure sections. Targets are at least 44px tall.
- High: switching experiments lost the context of the original simulation. Enter Universe opens the world over the existing laboratory; laboratory rendering suspends and its objects stay in memory. Back removes the world frame and resumes the original session. A back button exists outside the world so loading failure cannot trap the user.
- Medium: keyboard-only hints did not describe touch input. Hints now distinguish left-side movement/right-side looking from desktop WASD and dragging. Motion lines illustrate vertical dragging and stop under reduced motion.
- Medium: debug copy and a false zero-bird count obscured useful feedback. Removed implementation copy and read the flock's actual count. Camera mode and visual style remain in the menu readout.
- High: Android navigation needed a reliable escape path. The universe entry now adds a history state; the Android back gesture/button closes it and resumes the original simulation. The world menu also has an explicit Back to simulation action.
- High: a fixed menu hid the world and could be mistaken for a canvas control. The menu button is a 56px draggable target, treats movement below 8px as a tap, clamps movement to a 12px safe margin, and places the panel beside the button.
- Medium: the handoff contract required a single task surface. Advanced flock controls now live inside a disclosure section, with a single Menu toggle and no simultaneous rectangular control layers.

## Evaluation lens

Nielsen: user control/freedom (return path), recognition over recall (Menu label and help), minimalism (closed panel), status (mode/count), consistency (single control surface).
Source: https://www.nngroup.com/articles/ten-usability-heuristics/

Hopkins: specific action copy (Enter Universe / Back to simulation), demonstration (explore immediately), relevant evidence (real bird count), testing rather than assumed success. This is an application of advertising principles to interface communication, not a conversion claim.
Source: https://www.loc.gov/item/23009362/

## Verification and next user check

JavaScript syntax and Git whitespace checks pass; both HTTP servers respond. No browser automation is available in this environment, so no visual or real-device pass is claimed.

On Android: tap and drag the Menu button separately; move it to each corner; use the left side to move and the right side to look; open Shape the flock, change cohesion, close it, press the Android back button, and return. Confirm the original count/settings remain. Repeat in landscape with the panel scrolled to the last action. Compare task completion and accidental taps against the old always-visible panel; do not infer usability improvement from styling alone.

## Limits

The world still uses Hollowmere's flock, not the original fish/bird ecosystem. Returning preserves the original simulation but does not transfer flock state between engines. Both local servers (8080 and 8081) must run. Full parity for food, trails, species, audio and follow remains future integration work. No source was published or merged.
