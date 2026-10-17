export function newestWeeklyUpdate(entries) {
  return entries.filter((entry) => entry.weekly && entry.merged_at && Date.parse(entry.merged_at) <= Date.now())
    .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at))[0] ?? null;
}

export function updateSeenKey(userId, pr) {
  return `gemIncremental.weeklyUpdate.${userId}.${pr}`;
}

export function searchUpdates(entries, query = '') {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const text = [entry.title, entry.published_on, ...entry.sections.flatMap((section) => [section.heading, ...section.bullets])].join(' ').toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
