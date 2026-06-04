// Ordinamento classifica (puro, testabile).
// Davanti chi: ha finito prima > piu' giri > piu' strada nel giro corrente.
export function sortRanking(players) {
  return [...players].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    if ((b.lap || 0) !== (a.lap || 0)) return (b.lap || 0) - (a.lap || 0);
    return (b.s || 0) - (a.s || 0);
  });
}
