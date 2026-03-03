/**
 * TypeRush Game Logic
 * Handles all calculations for typing stats
 */

/**
 * Calculate real-time progress percentage
 */
function calculateProgress(typed, fullText) {
  if (fullText.length === 0) return 0;
  return Math.round((typed.length / fullText.length) * 100);
}

/**
 * Calculate real-time WPM (Words Per Minute)
 * Formula: (characters / 5) / time in minutes
 */
function calculateWPM(typed, startTime) {
  if (!startTime) return 0;

  const timeElapsedMs = Date.now() - startTime;
  const timeElapsedSeconds = timeElapsedMs / 1000;
  const timeElapsedMinutes = timeElapsedSeconds / 60;

  if (timeElapsedMinutes < 0.016) return 0;

  const charCount = typed.length;
  const wordCount = charCount / 5;
  const wpm = wordCount / timeElapsedMinutes;

  return Math.round(wpm);
}

/**
 * Calculate accuracy percentage
 * Formula: (correct characters / total typed characters) * 100
 */
function calculateAccuracy(typed, fullText) {
  if (typed.length === 0) return 100;

  let correctCount = 0;

  for (let i = 0; i < typed.length && i < fullText.length; i++) {
    if (typed[i] === fullText[i]) {
      correctCount++;
    }
  }

  if (typed.length > fullText.length) {
    const penalty = typed.length - fullText.length;
    correctCount = Math.max(0, correctCount - penalty);
  }

  const accuracy = (correctCount / typed.length) * 100;
  return Math.round(accuracy);
}

/**
 * Calculate final stats after player finishes
 */
function calculateFinalStats(typed, fullText, timeElapsedSeconds) {
  const charCount = typed.length;
  const wordCount = charCount / 5;
  const timeElapsedMinutes = timeElapsedSeconds / 60;

  let finalWpm = 0;
  if (timeElapsedMinutes > 0) {
    finalWpm = Math.round(wordCount / timeElapsedMinutes);
  }

  let correctChars = 0;
  for (let i = 0; i < typed.length && i < fullText.length; i++) {
    if (typed[i] === fullText[i]) {
      correctChars++;
    }
  }

  let accuracy = 100;
  if (typed.length > 0) {
    accuracy = Math.round((correctChars / typed.length) * 100);
  }

  return {
    wpm: Math.max(0, finalWpm),
    accuracy: Math.max(0, accuracy),
    timeElapsed: Math.round(timeElapsedSeconds * 10) / 10,
    correctChars,
    totalChars: typed.length
  };
}

/**
 * Generate leaderboard from race results
 */
function generateLeaderboard(players) {
  const leaderboard = players
    .filter(p => p.finished)
    .map(p => ({
      rank: 0,
      name: p.name,
      wpm: p.finalWpm,
      accuracy: p.finalAccuracy,
      placement: p.placement || 0,
      finishTime: p.finishTime
    }))
    .sort((a, b) => b.wpm - a.wpm)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

  return leaderboard;
}

module.exports = {
  calculateProgress,
  calculateWPM,
  calculateAccuracy,
  calculateFinalStats,
  generateLeaderboard
};