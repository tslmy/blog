// Seeded random numbers, so every figure shows the same example until "new" is pressed.
// 6-. Groups of two weights, in stages. Figures with the same data-scene share their mock groups (and the levels option); data-layers says what each one draws:
// strips (three lines of cells), points, quant (squares, grids, arrows and rings), bits (binary labels), ghost (where the groups started), curve (spikiness against angle), loss (how much each group loses).
// A group has a direction and a length; its two weights are length times (cos, sin). With "one fixed grid" the length is divided out, so the dots sit on a circle of length 1.
export const rng2 = (sd) => () => (sd = (sd * 16807) % 2147483647) / 2147483647;
