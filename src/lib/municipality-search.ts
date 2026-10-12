type SearchableMunicipality = { code: string; name: string };

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("fi-FI").normalize("NFD").replace(/\p{M}/gu, "");
}

function distance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

export function searchMunicipalities<T extends SearchableMunicipality>(items: T[], query: string): T[] {
  const needle = normalize(query);
  if (needle.length > 80) return [];
  if (!needle) return items;
  return items.map((item) => {
    const name = normalize(item.name);
    const score = name === needle ? 0 : name.startsWith(needle) ? 1 : name.includes(needle) ? 2
      : needle.length >= 3 ? 3 + distance(needle, name) : Infinity;
    const threshold = needle.length >= 7 ? 2 : 1;
    return { item, score: score <= 2 || score <= 3 + threshold ? score : Infinity };
  }).filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, "fi"))
    .map(({ item }) => item);
}
