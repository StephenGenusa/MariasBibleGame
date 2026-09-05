// Keys and taps -> action types. The mapping and the debounce gate are pure.

export const DEBOUNCE_MS = 250;

// Enter, PageUp and PageDown are absent on purpose. See test/input.test.js.
const KEY_MAP = {
  " ": "ADVANCE",
  ArrowRight: "ADVANCE",
  ArrowLeft: "BACK",
  Backspace: "BACK",
  ArrowDown: "NEXT_ROUND",
  y: "WIN",
  n: "FAIL",
  e: "EDIT",
};

export function keyToAction(key) {
  if (typeof key !== "string" || key === "") return null;
  // Single letters are matched case-insensitively; named keys are not.
  const lookup = key.length === 1 ? key.toLowerCase() : key;
  return KEY_MAP[lookup] ?? null;
}

// The editor has a textarea. Game keys must never be stolen from a text field,
// and space in particular would both advance the game and fail to type.
export function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "");
}

export function createDebouncer(ms) {
  let last = -Infinity;
  return function allow(now) {
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}

export function bindInput({ stage, dispatch, getState }) {
  const allow = createDebouncer(DEBOUNCE_MS);

  function fire(event, type) {
    event.preventDefault();
    if (!allow(event.timeStamp)) return;
    dispatch({ type });
  }

  function onKeyDown(event) {
    // A held key must not blow through all five clues.
    if (event.repeat) return;
    // While the editor is open the game must not react to anything.
    if (isTypingTarget(event.target) || document.querySelector(".editor")) return;
    const type = keyToAction(event.key);
    if (!type) return;
    fire(event, type);
  }

  function onPointerDown(event) {
    const target = event.target;

    // Buttons and the next bar carry their own meaning.
    if (target.closest(".btn-win")) return fire(event, "WIN");
    if (target.closest(".btn-fail")) return fire(event, "FAIL");
    if (target.closest(".next-bar")) return fire(event, "NEXT_ROUND");

    const rect = stage.getBoundingClientRect();
    if (getState().phase === "RESOLVED") return fire(event, "NEXT_ROUND");

    // The right 70% advances; the left 30% is dead space, which is what keeps
    // the top-left corner free for the editor's triple-tap.
    if (event.clientX - rect.left > rect.width * 0.3) fire(event, "ADVANCE");
  }

  // Triple-tap the top-left corner opens the editor without a keyboard.
  let corner = [];
  function onCornerTap(event) {
    const rect = stage.getBoundingClientRect();
    const inCorner = event.clientX - rect.left < rect.width * 0.14
      && event.clientY - rect.top < rect.height * 0.16;
    if (!inCorner) { corner = []; return; }
    corner = corner.filter(t => event.timeStamp - t < 1200);
    corner.push(event.timeStamp);
    if (corner.length >= 3) {
      corner = [];
      dispatch({ type: "EDIT" });
    }
  }

  window.addEventListener("keydown", onKeyDown);
  stage.addEventListener("pointerdown", onCornerTap);
  stage.addEventListener("pointerdown", onPointerDown);

  return function unbind() {
    window.removeEventListener("keydown", onKeyDown);
    stage.removeEventListener("pointerdown", onCornerTap);
    stage.removeEventListener("pointerdown", onPointerDown);
  };
}
