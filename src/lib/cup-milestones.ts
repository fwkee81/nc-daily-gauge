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

// Personal Coach's Cup tiers — same idea as CUP_MILESTONES but per-coach,
// celebrated individually rather than club-wide. Tone escalates: 5 is just a
// good start, 10-15 build momentum, 20+ is "hero" territory.
export interface CoachMilestoneTier {
  cups: number;
  emoji: string;
  title: string;
  // {name} and {cups} are substituted in — see formatCoachMilestoneMessage.
  messageTemplate: string;
}

export const COACH_CUP_MILESTONES: CoachMilestoneTier[] = [
  {
    cups: 5,
    emoji: "🌱",
    title: "美好的开始！",
    messageTemplate: "恭喜 {name}，今天达到个人杯数 {cups}，迈出漂亮的第一步，再接再厉冲向10杯！",
  },
  {
    cups: 10,
    emoji: "💪",
    title: "势头正猛！",
    messageTemplate: "恭喜 {name}，今天达到个人杯数 {cups}，表现相当亮眼，再接再厉冲向15杯！",
  },
  {
    cups: 15,
    emoji: "🔥",
    title: "火力全开！",
    messageTemplate: "恭喜 {name}，今天达到个人杯数 {cups}，状态非常厉害，再接再厉冲向20杯！",
  },
  {
    cups: 20,
    emoji: "🦸",
    title: "英雄降临！",
    messageTemplate: "恭喜 {name}，今天达到个人杯数 {cups}，已晋升英雄级别，再接再厉冲向25杯！",
  },
  {
    cups: 25,
    emoji: "🏆",
    title: "超级英雄！",
    messageTemplate: "恭喜 {name}，今天达到个人杯数 {cups}，超级英雄级表现，再接再厉冲向30杯！",
  },
  {
    cups: 30,
    emoji: "👑",
    title: "传奇教练！",
    messageTemplate: "恭喜 {name}，今天达到个人杯数 {cups}，传奇级表现，无人能及！",
  },
];

export function getCoachMilestoneTier(cups: number): CoachMilestoneTier | null {
  let reached: CoachMilestoneTier | null = null;
  for (const tier of COACH_CUP_MILESTONES) {
    if (cups >= tier.cups) reached = tier;
  }
  return reached;
}

export function formatCoachMilestoneMessage(
  tier: CoachMilestoneTier,
  name: string,
  cups: number
): string {
  return tier.messageTemplate.replace("{name}", name).replace("{cups}", String(cups));
}
