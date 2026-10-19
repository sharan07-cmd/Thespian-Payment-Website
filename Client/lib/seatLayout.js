// Generates the fixed theater layout:
// - Rows 1-24 (labeled A-X): 12 seats each, split into two blocks of 6
//   (left: 1-6, right: 7-12) with a center aisle.
// - Row 25 (labeled Y): 15 seats, no split, straight across.
//
// This is a static config for now. Later, this can move into the database
// (a `seats` table) and be generated once per show instead of per page load.

const ROW_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXY".split(""); // 25 letters

// No seats are pre-booked — real availability will come from the backend
// once that's wired up. Every seat starts as "available".
const DEMO_BOOKED = new Set();

export function generateSeatLayout() {
  const rows = ROW_LABELS.map((label, index) => {
    const rowNumber = index + 1;
    const isLastRow = rowNumber === 25;

    if (isLastRow) {
      const seats = Array.from({ length: 15 }, (_, i) => {
        const seatNumber = i + 1;
        const id = `${label}-${seatNumber}`;
        return {
          id,
          label: `${label}${seatNumber}`,
          number: seatNumber,
          block: "single",
          status: DEMO_BOOKED.has(id) ? "booked" : "available",
        };
      });
      return { rowLabel: label, rowNumber, split: false, blocks: [seats] };
    }

    const left = Array.from({ length: 6 }, (_, i) => {
      const seatNumber = i + 1;
      const id = `${label}-${seatNumber}`;
      return {
        id,
        label: `${label}${seatNumber}`,
        number: seatNumber,
        block: "left",
        status: DEMO_BOOKED.has(id) ? "booked" : "available",
      };
    });

    const right = Array.from({ length: 6 }, (_, i) => {
      const seatNumber = i + 7;
      const id = `${label}-${seatNumber}`;
      return {
        id,
        label: `${label}${seatNumber}`,
        number: seatNumber,
        block: "right",
        status: DEMO_BOOKED.has(id) ? "booked" : "available",
      };
    });

    return { rowLabel: label, rowNumber, split: true, blocks: [left, right] };
  });

  const totalSeats = rows.reduce(
    (sum, row) => sum + row.blocks.reduce((s, b) => s + b.length, 0),
    0
  );

  return { rows, totalSeats };
}

export const SEAT_PRICE = 50; // in rupees, placeholder — adjust as needed
