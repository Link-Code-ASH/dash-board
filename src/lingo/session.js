export function createSession(words, random = Math.random) {
  const queue = structuredClone(words);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return { queue, total: queue.length, previous: null };
}

export function judgeCard(session, known) {
  if (!session.queue.length) return session;
  const [word, ...remaining] = session.queue;
  return { ...session, queue: known ? remaining : [...remaining, word], previous: session.queue };
}

export function undoCard(session) {
  return session.previous ? { ...session, queue: session.previous, previous: null } : session;
}

export function swipeDirection(dx, dy) {
  return Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx > 0 ? "known" : "again") : null;
}
