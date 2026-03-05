/**
 * TypeRush Game Logic - With Game Mode Support
 */

const GAME_MODES = {
  SPRINT: 'sprint',
  MARATHON: 'marathon',
  ENDLESS: 'endless'
};

const GAME_MODE_CONFIG = {
  sprint: {
    name: 'Sprint',
    timeLimit: 60,
    description: '1 minute race - Speed is everything!',
    winCondition: 'Highest WPM when time runs out'
  },
  marathon: {
    name: 'Marathon',
    timeLimit: null,
    description: '2-3 paragraphs - Accuracy matters!',
    winCondition: 'First to finish accurately'
  },
  endless: {
    name: 'Endless',
    timeLimit: null,
    description: '20 paragraphs - Type as much as you can!',
    winCondition: 'Whoever types the most wins'
  }
};

function calculateProgress(typed, fullText) {
  if (!fullText || fullText.length === 0) return 0;
  const percent = (typed.length / fullText.length) * 100;
  return Math.round(Math.max(0, Math.min(100, percent)));
}

function calculateWPM(typed, startTime) {
  if (!startTime) return 0;

  const timeElapsedMs = Date.now() - startTime;
  const timeElapsedMinutes = (timeElapsedMs / 1000) / 60;

  if (timeElapsedMinutes < 0.016) return 0;

  const wordCount = typed.length / 5;
  return Math.max(0, Math.round(wordCount / timeElapsedMinutes));
}

function calculateAccuracy(typed, fullText) {
  if (typed.length === 0) return 100;

  let correctCount = 0;
  for (let i = 0; i < typed.length && i < fullText.length; i++) {
    if (typed[i] === fullText[i]) {
      correctCount++;
    }
  }

  if (typed.length > fullText.length) {
    correctCount = Math.max(0, correctCount - (typed.length - fullText.length));
  }

  return Math.round((correctCount / typed.length) * 100);
}

function calculateFinalStats(typed, fullText, timeElapsedSeconds) {
  const minutes = timeElapsedSeconds / 60;
  const wpm = minutes > 0 ? Math.round((typed.length / 5) / minutes) : 0;

  let correctChars = 0;
  for (let i = 0; i < typed.length && i < fullText.length; i++) {
    if (typed[i] === fullText[i]) {
      correctChars++;
    }
  }

  const accuracy = typed.length > 0 ? Math.round((correctChars / typed.length) * 100) : 100;

  return {
    wpm: Math.max(0, wpm),
    accuracy: Math.max(0, accuracy),
    timeElapsed: Math.round(timeElapsedSeconds * 10) / 10,
    correctChars,
    totalChars: typed.length
  };
}

function isPlayerFinished(typed, fullText, gameMode) {
  switch (gameMode) {
    case GAME_MODES.SPRINT:
    case GAME_MODES.MARATHON:
      return typed.length >= fullText.length;
    case GAME_MODES.ENDLESS:
      return false;
    default:
      return typed.length >= fullText.length;
  }
}

function calculateWinner(players, gameMode) {
  if (!players || players.length === 0) return null;

  switch (gameMode) {
    case GAME_MODES.SPRINT:
      return [...players].sort((a, b) => (b.finalWpm || b.wpm || 0) - (a.finalWpm || a.wpm || 0))[0] || null;
    case GAME_MODES.MARATHON:
      return [...players]
        .filter((p) => p.finished)
        .sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity))[0] || null;
    case GAME_MODES.ENDLESS:
      return [...players].sort((a, b) => (b.progress || 0) - (a.progress || 0))[0] || null;
    default:
      return [...players].sort((a, b) => (b.finalWpm || b.wpm || 0) - (a.finalWpm || a.wpm || 0))[0] || null;
  }
}

function generateLeaderboard(players, gameMode) {
  let leaderboard = [];

  switch (gameMode) {
    case GAME_MODES.SPRINT:
      leaderboard = [...players].sort((a, b) => (b.finalWpm || b.wpm || 0) - (a.finalWpm || a.wpm || 0));
      break;
    case GAME_MODES.MARATHON:
      leaderboard = [...players]
        .filter((p) => p.finished)
        .sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity));
      break;
    case GAME_MODES.ENDLESS:
      leaderboard = [...players].sort((a, b) => (b.progress || 0) - (a.progress || 0));
      break;
    default:
      leaderboard = [...players].sort((a, b) => (b.finalWpm || b.wpm || 0) - (a.finalWpm || a.wpm || 0));
      break;
  }

  return leaderboard.map((entry, index) => ({
    rank: index + 1,
    name: entry.name,
    wpm: entry.finalWpm || entry.wpm || 0,
    accuracy: entry.finalAccuracy || entry.accuracy || 0,
    progress: entry.progress || 0,
    timeElapsed: entry.timeElapsed || 0,
    finished: entry.finished || false
  }));
}

module.exports = {
  GAME_MODES,
  GAME_MODE_CONFIG,
  calculateProgress,
  calculateWPM,
  calculateAccuracy,
  calculateFinalStats,
  isPlayerFinished,
  calculateWinner,
  generateLeaderboard
};
