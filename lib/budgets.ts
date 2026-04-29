// Spreadsheet-equivalent budget formulas.
// Single source of truth so PUT, POST, /inputs, and import paths all derive identically.

export interface ProjectInputs {
  wages_share?:         number | null;
  blended_hourly_wage?: number | null;
  rough_hours_est?:     number | null;
  finish_hours_est?:    number | null;
}

export interface DerivedBudgets {
  est_total_hours:      number;
  rough_hours_allowed:  number;
  finish_hours_allowed: number;
  goal_hours:           number;
}

const DEFAULTS = {
  wages_share:         0.20,
  blended_hourly_wage: 37,
};

// Rough = first 70% of project_completion, Finish = last 30%.
function calcProjectCompletion(stage: string, stageCompletion: number): number {
  const sc = Math.min(1, Math.max(0, stageCompletion ?? 0));
  if (stage === "Rough" || stage === "Underground") return sc * 0.70;
  if (stage === "Finish")  return 0.70 + sc * 0.30;
  if (stage === "Extras")  return 1.0;
  return 0;
}

// est_total_hours = (contract × wages_share) / blended_hourly_wage
function calcEstTotalHours(contractValue: number, wagesShare: number, hourlyWage: number): number {
  if (!hourlyWage || hourlyWage <= 0) return 0;
  return Math.round(((contractValue || 0) * wagesShare) / hourlyWage * 100) / 100;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function deriveBudgets(
  project: {
    contract_value?:    number | null;
    stage?:             string | null;
    stage_completion?:  number | null;
  },
  inputs: ProjectInputs | null | undefined,
): DerivedBudgets {
  const wagesShare = inputs?.wages_share         ?? DEFAULTS.wages_share;
  const wage       = inputs?.blended_hourly_wage ?? DEFAULTS.blended_hourly_wage;

  const est = calcEstTotalHours(project.contract_value ?? 0, wagesShare, wage);

  // GOAL Hours and Rough/Finish Hours Allowed are all proportional to project progress.
  // They grow with the project and ALWAYS equal each other in their respective stage:
  //   while in Rough/Underground:  rough_allowed = goal_hours = est × project_completion
  //   once in Finish/Extras:       rough portion locks at est × 0.70,
  //                                finish_allowed = est × (project_completion - 0.70)
  const projComp = calcProjectCompletion(project.stage ?? "Rough", project.stage_completion ?? 0);

  const inRough  = project.stage === "Rough" || project.stage === "Underground";
  const inFinish = project.stage === "Finish" || project.stage === "Extras";

  // Rough portion: dynamic while in rough; capped at full rough share (est × 0.70) afterward
  const roughAllowed = inRough
    ? round2(est * projComp)
    : round2(est * 0.70);

  // Finish portion: 0 until we reach Finish stage
  const finishAllowed = inFinish
    ? round2(est * Math.max(0, projComp - 0.70))
    : 0;

  // Goal Hours = the budget for the work completed so far (overall)
  const goalHours = round2(est * projComp);

  return {
    est_total_hours:      est,
    rough_hours_allowed:  roughAllowed,
    finish_hours_allowed: finishAllowed,
    goal_hours:           goalHours,
  };
}
