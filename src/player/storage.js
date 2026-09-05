// A small library of weeks in localStorage. Every path degrades to the
// embedded week rather than throwing: iOS can refuse storage access outright.

export const WEEKS_KEY = "bibleClueGame.weeks";
export const ACTIVE_KEY = "bibleClueGame.activeWeekId";
export const MAX_WEEKS = 10;

function isWeek(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.id === "string"
    && Array.isArray(value.rounds)
    && value.rounds.length > 0;
}

export function createStorage(backing) {
  function read(key) {
    try {
      return backing ? backing.getItem(key) : null;
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (backing) backing.setItem(key, value);
    } catch {
      // Storage unavailable. The in-memory session still works.
    }
  }

  function loadWeeks() {
    const raw = read(WEEKS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isWeek) : [];
    } catch {
      return [];
    }
  }

  function persist(weeks) {
    write(WEEKS_KEY, JSON.stringify(weeks));
    return weeks;
  }

  function setActiveWeekId(id) {
    write(ACTIVE_KEY, id);
  }

  function saveWeek(newWeek) {
    if (!isWeek(newWeek)) return loadWeeks();
    const weeks = loadWeeks().filter(w => w.id !== newWeek.id);
    weeks.push(newWeek);
    // Oldest first, so trimming from the front drops the oldest.
    const trimmed = weeks.slice(-MAX_WEEKS);
    persist(trimmed);
    setActiveWeekId(newWeek.id);
    return trimmed;
  }

  function deleteWeek(id) {
    const remaining = loadWeeks().filter(w => w.id !== id);
    persist(remaining);
    if (read(ACTIVE_KEY) === id) {
      const newest = remaining.at(-1);
      if (newest) {
        setActiveWeekId(newest.id);
      } else {
        try {
          if (backing) backing.removeItem(ACTIVE_KEY);
        } catch {
          // Nothing to do; getActiveWeek falls back on its own.
        }
      }
    }
    return remaining;
  }

  function getActiveWeek(embeddedWeek) {
    const weeks = loadWeeks();
    if (weeks.length === 0) return embeddedWeek;
    const activeId = read(ACTIVE_KEY);
    return weeks.find(w => w.id === activeId) ?? weeks.at(-1) ?? embeddedWeek;
  }

  return { loadWeeks, saveWeek, deleteWeek, setActiveWeekId, getActiveWeek };
}
