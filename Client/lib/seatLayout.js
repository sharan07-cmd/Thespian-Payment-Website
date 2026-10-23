
export const SEAT_PRICE = 50; // Legacy default; use getSeatPrice() for dynamic pricing.

export const SEAT_PRICES = {
  premium: 75,
  standard: 50,
  economy: 40,
};

export function getSeatPrice(rowNumber) {
  if (rowNumber >= 1 && rowNumber <= 5) {
    return SEAT_PRICES.premium;
  }

  if (rowNumber >= 6 && rowNumber <= 11) {
    return SEAT_PRICES.standard;
  }

  if (rowNumber >= 12 && rowNumber <= 16) {
    return SEAT_PRICES.economy;
  }

  return null;
}

export function generateSeatLayout() {
  const ROW_LABELS = "ABCDEFGHIJKLMNOP".split("");

  const rows = ROW_LABELS.map((label, index) => {
    const rowNumber = index + 1;
    const price = getSeatPrice(rowNumber);

    // Row P: single block of 17 seats.
    if (rowNumber === 16) {
      const seats = Array.from({ length: 17 }, (_, i) => ({
        id: `${label}-${i + 1}`,
        label: `${label}${i + 1}`,
        number: i + 1,
        block: "single",
        status: "available",
        price,
      }));

      return {
        rowLabel: label,
        rowNumber,
        price,
        split: false,
        blocks: [seats],
      };
    }

    // Rows F-K (6-11) have five seats on the right.
    const isShortRow = rowNumber >= 6 && rowNumber <= 11;
    const rightSeatCount = isShortRow ? 5 : 7;

    const left = Array.from({ length: 7 }, (_, i) => ({
      id: `${label}-${i + 1}`,
      label: `${label}${i + 1}`,
      number: i + 1,
      block: "left",
      status: "available",
      price,
    }));

    const rightSeats = Array.from(
      { length: rightSeatCount },
      (_, i) => ({
        id: `${label}-${8 + i}`,
        label: `${label}${8 + i}`,
        number: 8 + i,
        block: "right",
        status: "available",
        price,
      })
    );

    // Preserve the two empty placeholders in short rows.
    const rightPlaceholders = Array.from(
      { length: 7 - rightSeatCount },
      (_, i) => ({
        id: `${label}-empty-${i + 1}`,
        label: "",
        number: null,
        block: "right",
        status: "empty",
        price: null,
      })
    );

    return {
      rowLabel: label,
      rowNumber,
      price,
      split: true,
      blocks: [left, [...rightSeats, ...rightPlaceholders]],
    };
  });

  const totalSeats = rows.reduce(
    (sum, row) =>
      sum +
      row.blocks.reduce(
        (rowSum, block) =>
          rowSum + block.filter((seat) => seat.status !== "empty").length,
        0
      ),
    0
  );

  return { rows, totalSeats };
}
