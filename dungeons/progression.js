export function isRoomUnlocked(roomNumber, completedRooms) {
  const room = Number(roomNumber);
  return Number.isInteger(room) && room >= 1 && room <= 1500
    && (room === 1 || completedRooms.has(room - 1));
}

export function isRegionUnlocked(region, rooms, completedRooms) {
  return rooms.some((room) => room.region === region && isRoomUnlocked(room.room, completedRooms));
}
