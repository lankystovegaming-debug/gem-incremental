export function isDungeonAnnouncementReleased(entry, now = Date.now()) {
  return entry?.published === true && Number.isSafeInteger(entry.release_pr) && entry.release_pr > 0 &&
    typeof entry.merged_at === 'string' && Number.isFinite(Date.parse(entry.merged_at)) && Date.parse(entry.merged_at) <= now;
}

export function dungeonAnnouncementSeenKey(userId, pr) {
  return `gemIncremental.dungeonsAnnouncement.${userId}.${pr}`;
}
