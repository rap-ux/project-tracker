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

// est_total_hours = (contract × wages_share) / blended_hourly_wage  (matches spreadsheet)
function calcEstTotalHours(contractValue: number, wagesShare: number, hourlyWage: number): number {
  if (!hourlyWage || hourlyWage <= 0) return 0;
  return Math.round(((contractValue || 0) * wagesShare) / hourlyWage * 100) / 100;
}

// While in Rough/Underground, the goal is the rough budget.
// Once Finish/Extras, the full project budget is in play.
function calcGoalHours(stage: string, rough: number, finish: number): number {
  if (stage === "Rough" || stage === "Underground") return rough;
  if (stage === "Finish" || stage === "Extras")     return rough + finish;
  return 0;
}

export function deriveBudgets(
  project: {
    contract_value?:        number | null;
    stage?:                 string | null;
    rough_hours_allowed?:   number | null;
    finish_hours_allowed?:  number | null;
  },
  inputs: ProjectInputs | null | undefined,
): DerivedBudgets {
  const wagesShare = inputs?.wages_share         ?? DEFAULTS.wages_share;
  const wage       = inputs?.blended_hourly_wage ?? DEFAULTS.blended_hourly_wage;

  // rough/finish allowed: prefer inputs (user's "official" estimate), fall back to project columns
  const rough  = inputs?.rough_hours_est  ?? project.rough_hours_allowed  ?? 0;
  const finish = inputs?.finish_hours_est ?? project.finish_hours_allowed ?? 0;

  return {
    est_total_hours:      calcEstTotalHours(project.contract_value ?? 0, wagesShare, wage),
    rough_hours_allowed:  rough,
    finish_hours_allowed: finish,
    goal_hours:           calcGoalHours(project.stage ?? "Rough", rough, finish),
  };
}
