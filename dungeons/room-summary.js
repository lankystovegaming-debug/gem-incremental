const escapeHtml = (value) => String(value ?? '—')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Use structured backend fields, never the imported specification pages.
export function renderRoomSummary(room) {
  const boss = String(room.room_type).startsWith('Boss Room');
  const treasure = String(room.room_type).startsWith('Treasure Room');
  const role = boss ? 'boss' : treasure ? 'chest' : 'enemy';
  const rows = [
    ['Enemy level', room.mob_level || (boss ? 'Boss encounter' : '—')],
    ['Typical enemy count', room.base_count || 'Varies by encounter'],
    ['Possible encounters', (room.encounters || []).filter((entry) => entry.kind)
      .map((entry) => `${entry.kind} · ${entry.chance || '—'}`).join('\n') || '—'],
    ['Enemies · spawn chance', (room.enemies || [])
      .map((enemy) => `${enemy.name} · ${enemy.spawn || '—'}`).join('\n') || '—'],
    ['Room key chance', room.room_key_chance || '—'],
    ['Fog chance', room.fog_chance || '—'],
    ['Enemy mutation chance', String(room.mutation_summary || '')
      .match(/Mob mutation chance:\s*([\d.]+%)/i)?.[1] || '—'],
  ];
  for (const type of ['Weapon', 'Armor']) {
    rows.push([`${type} drop / ${role}`, room.gear_chances?.[`${type} / ${role}`]
      ?? (role === 'enemy' ? room[`${type.toLowerCase()}_chance`] : null) ?? '—']);
    const secondary = boss ? 'add' : treasure ? 'guard' : null;
    if (secondary && room.gear_chances?.[`${type} / ${secondary}`] != null) {
      rows.push([`${type} drop / ${secondary}`, room.gear_chances[`${type} / ${secondary}`]]);
    }
  }
  return `<table class="room-summary-table"><caption>Room ${escapeHtml(room.room_number)} at a glance</caption>`
    + '<thead><tr><th scope="col">Detail</th><th scope="col">What to expect</th></tr></thead><tbody>'
    + rows.map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')
    + '</tbody></table>';
}
