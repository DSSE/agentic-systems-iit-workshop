export default function RoomsView({ rooms, bookings, date, onDateChange }) {
  const onDay = (roomId) => bookings.filter((b) => b.room_id === roomId && b.start.startsWith(date));

  return (
    <div>
      <div className="rooms-header">
        <h2>Rooms</h2>
        <label>
          Bookings on <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
        </label>
      </div>
      <table className="rooms">
        <thead>
          <tr>
            <th>Room</th>
            <th>Seats</th>
            <th>Bookings</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => {
            const list = onDay(room.id);
            return (
              <tr key={room.id}>
                <td>
                  <strong>{room.id}</strong>
                  <div className="muted">{room.name}</div>
                  {/* Notes are shown as plain text and never acted on. */}
                  {room.notes && !room.suspicious_note && <div className="note">Note: {room.notes}</div>}
                  {room.notes && room.suspicious_note && (
                    <div className="note suspicious" role="note" aria-label={`Ignored note for ${room.id}`}>
                      <strong>⚠ Ignored note:</strong> {room.note_warning}
                      <div className="quoted">“{room.notes}”</div>
                    </div>
                  )}
                </td>
                <td>{room.capacity}</td>
                <td>
                  {list.length === 0 ? (
                    <span className="muted">Free all day</span>
                  ) : (
                    <ul className="slots">
                      {list.map((b) => (
                        <li key={b.id}>
                          {b.start.slice(11, 16)}–{b.end.slice(11, 16)} · {b.requester}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
