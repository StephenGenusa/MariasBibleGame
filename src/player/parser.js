// Pasted week text -> rounds and warnings. No DOM access, ever.

const CLUES_EXPECTED = 5;
const RULES_HEADING = /^rules\b/i;
const SCORING_LINE = /points?\s*$/i;

// A block is one or more non-blank lines. A line of only whitespace separates
// blocks: the source emails use lines containing a single space, not truly
// empty lines, so trim before testing.
function splitBlocks(text) {
  const blocks = [];
  let current = [];
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") {
      if (current.length) { blocks.push(current); current = []; }
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function isPreamble(block) {
  if (RULES_HEADING.test(block[0])) return true;
  return block.every(line => SCORING_LINE.test(line));
}

export function parseWeekText(text) {
  const warnings = [];
  const rounds = [];
  const blocks = splitBlocks(text).filter(block => !isPreamble(block));

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.length === 1) {
      // The shape the source emails actually use: the character's name alone,
      // a blank line, then the clues as a block of their own.
      const next = blocks[i + 1];
      if (next && next.length >= 2) {
        rounds.push({ answer: block[0], clues: next });
        i++; // the clue block belongs to this round
      } else {
        warnings.push(`"${block[0]}" has no clues and was skipped.`);
      }
      continue;
    }

    // A block that already holds the name and its clues together.
    const [answer, ...clues] = block;
    rounds.push({ answer, clues });
  }

  for (const round of rounds) {
    if (round.clues.length !== CLUES_EXPECTED) {
      warnings.push(`"${round.answer}" has ${round.clues.length} clues, expected ${CLUES_EXPECTED}.`);
    }
  }

  const seen = new Set();
  for (const round of rounds) {
    const key = round.answer.toLowerCase();
    if (seen.has(key)) warnings.push(`"${round.answer}" appears more than once.`);
    seen.add(key);
  }

  if (rounds.length === 0) warnings.push("No rounds found. Check the pasted text.");
  return { rounds, warnings };
}
