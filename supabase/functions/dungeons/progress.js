// Supabase's default response cap is 1000 rows; late dungeon progress must
// not disappear when the UI asks which rooms/regions are unlocked.
export async function loadDungeonProgress(client, playerId) {
  const progress = [];
  const pageSize = 500;
  for (let offset = 0; offset < 1500; offset += pageSize) {
    const { data, error } = await client.from('dungeon_room_progress')
      .select('room_number,completed_at').eq('player_id', playerId)
      .order('room_number').range(offset, offset + pageSize - 1);
    if (error) throw error;
    progress.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return progress;
}
