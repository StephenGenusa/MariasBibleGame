// The whole game, as a pure reducer. No DOM, no timers.

export const TITLE = "TITLE";
export const CLUES = "CLUES";
export const RESOLVED = "RESOLVED";
export const END = "END";

export const CLUES_PER_ROUND = 5;

export function pointValue(k) {
  return CLUES_PER_ROUND + 1 - k;
}

export function initialState(week) {
  return {
    phase: TITLE,
    round: 0,
    k: 1,
    outcome: null,
    outcomes: [],
    justResolved: false,
    week,
  };
}

function recordOutcome(outcomes, round, outcome) {
  const next = outcomes.slice();
  next[round] = outcome;
  return next;
}

export function reduce(state, action) {
  const lastRound = state.week.rounds.length - 1;
  // Every path starts from justResolved: false, so only WIN and FAIL can set it.
  const s = { ...state, justResolved: false };

  switch (action.type) {
    case "ADVANCE":
      if (s.phase === TITLE) return { ...s, phase: CLUES, round: 0, k: 1 };
      if (s.phase !== CLUES) return s;
      return s.k >= CLUES_PER_ROUND ? s : { ...s, k: s.k + 1 };

    case "WIN":
      if (s.phase !== CLUES) return s;
      return {
        ...s,
        phase: RESOLVED,
        outcome: "win",
        outcomes: recordOutcome(s.outcomes, s.round, "win"),
        justResolved: true,
      };

    case "FAIL":
      // Only meaningful once every clue has been shown.
      if (s.phase !== CLUES || s.k < CLUES_PER_ROUND) return s;
      return {
        ...s,
        phase: RESOLVED,
        outcome: "fail",
        outcomes: recordOutcome(s.outcomes, s.round, "fail"),
        justResolved: true,
      };

    case "NEXT_ROUND":
      if (s.phase !== RESOLVED) return s;
      if (s.round >= lastRound) return { ...s, phase: END };
      return { ...s, phase: CLUES, round: s.round + 1, k: 1, outcome: null };

    case "RESTART":
      return initialState(s.week);

    default:
      return s;
  }
}
