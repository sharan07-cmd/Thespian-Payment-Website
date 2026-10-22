export const SEAT_PRICE = 50;
const ROW_LABELS = "ABCDEFGHIJKLMNOP".split("");

export function generateSeatLayout() {
  const rows = ROW_LABELS.map((label, index) => {
    const rowNumber = index + 1;

    // Row P
    if (rowNumber === 16) {
      const seats = Array.from({ length: 17 }, (_, i) => ({
        id: `${label}-${i + 1}`,
        label: `${label}${i + 1}`,
        number: i + 1,
        block: "single",
        status: "available",
      }));
      return { rowLabel: label, rowNumber, split: false, blocks: [seats] };
    }

    // Rows F–K (6-11)
    const isShortRow = rowNumber >= 6 && rowNumber <= 11;
    const rightSeatCount = isShortRow ? 5 : 7;

    const left = Array.from({ length: 7 }, (_, i) => ({
      id: `${label}-${i + 1}`,
      label: `${label}${i + 1}`,
      number: i + 1,
      block: "left",
      status: "available",
    }));

    const rightSeats = Array.from({ length: rightSeatCount }, (_, i) => ({
      id: `${label}-${8 + i}`,
      label: `${label}${8 + i}`,
      number: 8 + i,
      block: "right",
      status: "available",
    }));

    // Pad the right side of rows F-K with 2 empty placeholder objects
    const rightPlaceholders = Array.from(
      { length: 7 - rightSeatCount },
      (_, i) => ({
        id: `${label}-empty-${i + 1}`,
        label: "",
        number: null,
        block: "right",
        status: "empty", 
      })
    );

    return {
      rowLabel: label,
      rowNumber,
      split: true,
      blocks: [left, [...rightSeats, ...rightPlaceholders]],
    };
  });

  // Calculate total bookable seats (ignores placeholders)
  const totalSeats = rows.reduce(
    (sum, row) => sum + row.blocks.reduce(
      (rowSum, block) => rowSum + block.filter(s => s.status !== "empty").length, 0
    ), 0
  );

  return { rows, totalSeats };
}