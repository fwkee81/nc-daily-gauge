// Shared cup-count celebration tiers, used by the daily report popup/badge
// and anywhere else a club's daily cup total should show its milestone.
export interface MilestoneTier {
  cups: number;
  emoji: string;
  title: string;
  message: string;
}

export const CUP_MILESTONES: MilestoneTier[] = [
  { cups: 25, emoji: "🎉", title: "Great day!", message: "Past 25 cups — great start, team!" },
  { cups: 35, emoji: "🔥", title: "On fire!", message: "Past 35 cups — the team is really cooking!" },
  { cups: 50, emoji: "🦸", title: "Hero day!", message: "50 cups — certified hero performance!" },
  { cups: 75, emoji: "💎", title: "Elite squad!", message: "75 cups — this is rare air, incredible work!" },
  { cups: 100, emoji: "🏆", title: "Legendary!", message: "100 cups — once-in-a-blue-moon legendary day!" },
];

export function getMilestoneTier(totalCups: number): MilestoneTier | null {
  let reached: MilestoneTier | null = null;
  for (const tier of CUP_MILESTONES) {
    if (totalCups >= tier.cups) reached = tier;
  }
  return reached;
}
