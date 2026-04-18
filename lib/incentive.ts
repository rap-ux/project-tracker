// ── Bonus tiers by contract value ─────────────────────────────────────────────
// Applied per stage — Rough earns its own tier, Finish earns its own tier.
export interface BonusTier {
  meet: number;   // Budget Met  (within ±10%)
  beat: number;   // Extra bonus (>10% under budget)
  max:  number;   // meet + beat
}

export function getBonusTier(contractValue: number): BonusTier {
  if (contractValue >= 500_000) return { meet: 1000, beat: 1500, max: 2500 };
  if (contractValue >= 250_000) return { meet:  750, beat: 1000, max: 1750 };
  if (contractValue >= 100_000) return { meet:  500, beat:  750, max: 1250 };
  if (contractValue >=  50_000) return { meet:  300, beat:  400, max:  700 };
  return                               { meet:  150, beat:  200, max:  350 };
}

// ── Per-stage bonus ────────────────────────────────────────────────────────────
export type StageBonusStatus =
  | "beat"        // >10% under budget — eligible, confirmed
  | "meet"        // within ±10%       — eligible, confirmed
  | "miss"        // over budget       — eligible, not earned
  | "locked"      // stage >10% but not yet 100% — actively tracking, bonus pending
  | "too-early"   // rough ≤10% — mobilization/underground phase, not tracking yet
  | "no-data";    // no hours budgeted for this stage

export interface StageBonus {
  allowed:     number;           // goal hours for this stage
  actual:      number;           // actual hours used (snapshotted)
  variance:    number;           // allowed − actual  (+ = under = good)
  variancePct: number;           // variance / allowed
  eligible:    boolean;          // stage 100% complete — can be formally assessed
  status:      StageBonusStatus;
  earned:      number;           // $ amount earned (0 if locked / miss / no-data)
  tier:        BonusTier;
  label:       string;           // short display label
}

// ── Backward-compat summary status (used for flagging / table coloring) ────────
export type BonusStatus = "beat" | "meet" | "miss" | "in-progress";

// ── Project health status ──────────────────────────────────────────────────────
export type ProjectStatus = "critical" | "at-risk" | "watch" | "on-track" | "ahead";

export interface StatusInfo {
  key:   ProjectStatus;
  label: string;
  emoji: string;
  color: string;
}

export function getProjectStatus(variancePct: number): StatusInfo {
  if (variancePct >   0.10) return { key: "ahead",    label: "Ahead",         emoji: "🟢", color: "green"  };
  if (variancePct >=  0)    return { key: "on-track", label: "On Track",      emoji: "✅", color: "blue"   };
  if (variancePct >= -0.10) return { key: "watch",    label: "Watch",         emoji: "⚠️", color: "yellow" };
  if (variancePct >= -0.20) return { key: "at-risk",  label: "At Risk",       emoji: "🚨", color: "orange" };
  return                           { key: "critical",  label: "Critical",      emoji: "🛑", color: "red"    };
}

// ── Highlight message ──────────────────────────────────────────────────────────
export function getHighlight(
  stage: string,
  stageCompletion: number,
  varianceHours: number,
  variancePct: number,
  goalHours: number,
): string {
  if (goalHours === 0) return "No hours budgeted yet.";
  const pctStr   = Math.abs(variancePct * 100).toFixed(0) + "%";
  const hrsStr   = Math.abs(varianceHours).toFixed(0) + " hrs";
  const isOver   = varianceHours < 0;
  const complete = (stageCompletion * 100).toFixed(0) + "%";
  if (stageCompletion >= 1) {
    if (isOver) return `${stage} complete — over budget by ${hrsStr} (${pctStr}). Finish must recover hours — tighten plan, eliminate rework, escalate blockers early.`;
    return `${stage} complete — under budget by ${hrsStr} (${pctStr}). Shift focus to next stage — keep efficiency and avoid rework to protect bonus.`;
  }
  if (isOver) return `${complete} complete — over pace by ${hrsStr} (${pctStr}). Check crew loading, sequencing, rework, or scope creep.`;
  return `${complete} complete — under pace by ${hrsStr} (${pctStr}). Good pace — maintain quality and document any scope changes early.`;
}

// ── Internal: calculate one stage's bonus ────────────────────────────────────
function calcOneStage(
  allowed:      number,
  actual:       number,
  contractValue: number,
  eligible:     boolean,
  tooEarly:     boolean = false,
): StageBonus {
  const tier = getBonusTier(contractValue);

  if (allowed === 0) {
    return { allowed, actual, variance: 0, variancePct: 0, eligible: false,
             status: "no-data", earned: 0, tier, label: "No budget set" };
  }
  if (tooEarly) {
    return { allowed, actual, variance: 0, variancePct: 0, eligible: false,
             status: "too-early", earned: 0, tier, label: "Mobilization phase" };
  }
  if (!eligible) {
    return { allowed, actual, variance: 0, variancePct: 0, eligible: false,
             status: "locked", earned: 0, tier, label: "In Progress" };
  }

  const variance    = allowed - actual;
  const variancePct = variance / allowed;
  let status: StageBonusStatus;
  let earned: number;
  let label:  string;

  if (variancePct > 0.10) {
    status = "beat"; earned = tier.meet + tier.beat; label = "Budget Beat ✓";
  } else if (variancePct >= -0.10) {
    status = "meet"; earned = tier.meet;             label = "Budget Met ✓";
  } else {
    status = "miss"; earned = 0;                     label = "Over Budget ✗";
  }

  return { allowed, actual, variance, variancePct, eligible: true, status, earned, tier, label };
}

// ── Main result ────────────────────────────────────────────────────────────────
export interface IncentiveResult {
  // Per-stage
  rough:  StageBonus;
  finish: StageBonus;
  // Totals
  totalEarned:  number;
  maxPossible:  number;
  // Project health (current stage pace)
  projectStatus:  StatusInfo;
  highlight:      string;
  variancePct:    number;
  varianceHours:  number;
  // Backward-compat summary (used for table coloring + flagging)
  bonusStatus: BonusStatus;
  bonusLabel:  string;
  bonusEarned: number;
  tier:        BonusTier;
}

export function calcIncentive(
  goalHours:       number,
  actualHours:     number,
  contractValue:   number,
  stage:           string  = "Rough",
  stageCompletion: number  = 0,
  roughAllowed:    number  = 0,
  roughActual:     number  = 0,
  finishAllowed:   number  = 0,
  finishActual:    number  = 0,
): IncentiveResult {
  const tier = getBonusTier(contractValue);

  // ── Eligibility rules ──────────────────────────────────────────────────────
  // Rough: done when stage moved past Rough, OR stage=Rough at 100%
  const stageOrder: Record<string, number> = {
    "Contracting Phase": 0, "Underground": 1, "Rough": 2, "Finish": 3, "Extras": 4,
  };
  const currentOrder = stageOrder[stage] ?? 2;

  const roughDone    = currentOrder > stageOrder["Rough"]
                    || (stage === "Rough" && stageCompletion >= 1.0);
  const roughEligible = roughDone && roughAllowed > 0 && roughActual > 0;
  // First 10% of Rough = mobilization / underground phase — not trackable yet
  const roughTooEarly = !roughDone
                      && stage === "Rough"
                      && stageCompletion <= 0.10;

  // Finish: done when stage=Extras OR stage=Finish at 100%
  const finishDone    = stage === "Extras"
                     || (stage === "Finish" && stageCompletion >= 1.0);
  const finishEligible = finishDone && finishAllowed > 0 && finishActual > 0;

  const rough  = calcOneStage(roughAllowed,  roughActual,  contractValue, roughEligible, roughTooEarly);
  const finish = calcOneStage(finishAllowed, finishActual, contractValue, finishEligible);

  const totalEarned = rough.earned + finish.earned;
  const maxPossible = (roughAllowed  > 0 ? tier.max : 0)
                    + (finishAllowed > 0 ? tier.max : 0);

  // ── Project health (current stage pace) ───────────────────────────────────
  // Suppress health warnings during mobilization (rough ≤ 10%) — too early to judge pace
  const varianceHours = goalHours > 0 ? goalHours - actualHours : 0;
  const variancePct   = (goalHours > 0 && !roughTooEarly) ? varianceHours / goalHours : 0;

  // ── Backward-compat summary ────────────────────────────────────────────────
  // Pick the most "interesting" eligible stage for the compact table cell
  const eligibleStages = [rough, finish].filter(s => s.eligible && s.status !== "too-early");
  let bonusStatus: BonusStatus;
  let bonusLabel:  string;

  if (eligibleStages.length === 0) {
    bonusStatus = "in-progress";
    bonusLabel  = "In Progress";
  } else if (eligibleStages.some(s => s.status === "beat")) {
    bonusStatus = "beat"; bonusLabel = "Budget Beat ✓";
  } else if (eligibleStages.some(s => s.status === "meet")) {
    bonusStatus = "meet"; bonusLabel = "Budget Met ✓";
  } else {
    bonusStatus = "miss"; bonusLabel = "Over Budget ✗";
  }

  return {
    rough, finish, totalEarned, maxPossible,
    projectStatus:  getProjectStatus(variancePct),
    highlight:      getHighlight(stage, stageCompletion, varianceHours, variancePct, goalHours),
    variancePct, varianceHours,
    bonusStatus, bonusLabel,
    bonusEarned: totalEarned,
    tier,
  };
}

// ── Foreman totals ─────────────────────────────────────────────────────────────
export function calcForemanTotal(projects: {
  goalHours:      number;
  actualHours:    number;
  contractValue:  number;
  stage:          string;
  stageCompletion: number;
  roughAllowed?:  number;
  roughActual?:   number;
  finishAllowed?: number;
  finishActual?:  number;
}[]) {
  const results = projects.map(p =>
    calcIncentive(
      p.goalHours, p.actualHours, p.contractValue, p.stage, p.stageCompletion,
      p.roughAllowed ?? 0, p.roughActual ?? 0, p.finishAllowed ?? 0, p.finishActual ?? 0,
    )
  );

  // Stage-level counts
  const allStages = results.flatMap(r => [
    { ...r.rough,  stageName: "Rough"  },
    { ...r.finish, stageName: "Finish" },
  ]).filter(s => s.status !== "no-data");

  return {
    totalBonus:       results.reduce((s, r) => s + r.totalEarned, 0),
    maxPossibleBonus: results.reduce((s, r) => s + r.maxPossible, 0),
    jobsBeat:         allStages.filter(s => s.status === "beat").length,
    jobsMet:          allStages.filter(s => s.status === "meet").length,
    jobsMissed:       allStages.filter(s => s.status === "miss").length,
    jobsLocked:       allStages.filter(s => s.status === "locked" || s.status === "too-early").length,
    jobsNotStarted:   results.filter(r =>
      r.rough.status === "no-data" && r.finish.status === "no-data"
    ).length,
    results,
  };
}
