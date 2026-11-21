// Seeded random numbers, so every figure shows the same example until its "new" button is pressed.
export const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;                         // Park–Miller, uniform in (0, 1)
export const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());     // Box–Muller, standard normal
export const nextSeed = (seed) => (seed * 48271) % 2147483647;                                                // what a "new" button does to the seed
