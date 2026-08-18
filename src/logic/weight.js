import {
  random01
} from "./random.js";


function randomBetween(
  min,
  max
) {
  return (
    min +
    random01() *
    (max - min)
  );
}


export function highWeightChance(
  weightLuck = 1
) {
  const safeWeightLuck =
    Math.max(
      0,
      weightLuck
    );

  return (
    0.25 +
    0.6 *
    (
      1 -
      Math.exp(
        -0.35 *
        Math.max(
          0,
          safeWeightLuck - 1
        )
      )
    )
  );
}


export function rollWeightMultiplier(
  weightLuck = 1
) {
  const safeWeightLuck =
    Math.max(
      0,
      weightLuck
    );

  // Diminishing returns: preserves the 25% baseline at 1x
  // while ensuring high-weight rolls are never guaranteed.
  const highChance =
    highWeightChance(
      safeWeightLuck
    );

  const lowChance =
    1 - highChance;


  // ---------------------------------
  // Decide low or high weight region
  // ---------------------------------

  const roll =
    random01();


  // =================================
  // LOW REGION
  // =================================

  if (
    roll <
    lowChance
  ) {
    const lowRoll =
      random01();

    // 20% of the low region
    // = 0.50x – 0.85x
    if (
      lowRoll < 0.2
    ) {
      return randomBetween(
        0.5,
        0.85
      );
    }

    // 80% of the low region
    // = 0.85x – 1.10x
    return randomBetween(
      0.85,
      1.1
    );
  }


  // =================================
  // HIGH REGION
  // =================================

  const highRoll =
    random01();


  // 60% of high region
  // = 1.10x – 1.50x
  if (
    highRoll < 0.6
  ) {
    return randomBetween(
      1.1,
      1.5
    );
  }


  // Next 15% of high region
  // = 1.50x – 2.00x
  if (
    highRoll < 0.75
  ) {
    return randomBetween(
      1.5,
      2
    );
  }


  // =================================
  // 2x+ TAIL
  // =================================

  let wholeMultiplier =
    2;

// Each additional whole multiplier
// is a 1-in-3 roll.
  while (
    random01() < (1 / 3)
  ) {
    wholeMultiplier++;
  }

  return randomBetween(
    wholeMultiplier,
    wholeMultiplier + 1
  );
}
