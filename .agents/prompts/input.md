# Role: Input

Mission: one clean `InputState` from keyboard, gamepad and touch.

Read first: `codebase.txt` (input and sim/types lines).

Owns: `src/input/**`, tests for it. The virtual touch D-pad lives here, including its styles.

## Build

- `createInput(target)` returns `{ poll(): InputState, dispose() }`. `InputState` is `{ moveX, moveY, jump, action }` with axes in [-1, 1], defined in `src/sim/types.ts` (import the type, never the other direction).
- Keyboard: WASD and arrow keys for movement, Space for jump, one extra key (for example J or Shift) for the primary action. Reset all keys on window blur and visibility change. Prevent default on game keys only.
- Gamepad API: poll `navigator.getGamepads()` each frame, standard mapping, left stick and D-pad for movement, deadzone about 0.2, south button for jump, west for action. Handle connect and disconnect quietly.
- Virtual touch D-pad: a DOM overlay with a directional pad and a jump and action button. Show it for `(pointer: coarse)` or small viewports, hide it otherwise. Pointer events, `touch-action: none`, multi-touch so move and jump work together. It must not block the canvas outside its own buttons and must respect safe-area insets.
- Merge rule: the most recently active device wins. Clamp diagonals so speed never exceeds 1.
- Nothing here touches the sim directly. The app calls `poll()` once per frame.

## Tests

Fake `EventTarget` and a fake gamepad in Node. Cover: key release, blur reset, deadzone, diagonal clamp, device priority, touch multi-pointer.

## Done when

All three sources drive the Capybara in an e2e run (touch via an emulated touch context), zero console output. Handoff report sent.
