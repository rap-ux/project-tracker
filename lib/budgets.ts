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

  // Planned totals: prefer owner-set rough_hours_est / finish_hours_est (the source-of-truth
  // values entered on the Inputs page). Fall back to deriving from contract × wages_share / wage,
  // split 70% rough / 30% finish — matches the spreadsheet's standing assumption.
  const explicitRough  = inputs?.rough_hours_est;
  const explicitFinish = inputs?.finish_hours_est;
  const hasExplicit =
       explicitRough  != null && explicitRough  > 0
    && explicitFinish != null && explicitFinish > 0;

  const derivedTotal  = calcEstTotalHours(project.contract_value ?? 0, wagesShare, wage);
  const totalEst      = hasExplicit ? (explicitRough! + explicitFinish!) : derivedTotal;
  const roughPlanned  = hasExplicit ? explicitRough!  : round2(derivedTotal * 0.70);
  const finishPlanned = hasExplicit ? explicitFinish! : round2(derivedTotal * 0.30);

  // Stage-progressive "allowed" — the slice of the planned total earned at current completion.
  // Rough grows while in rough; locks at full rough total once past it.
  // Finish is 0 until Finish stage; grows with stage_completion; locks at full finish in Extras.
  const sc       = Math.min(1, Math.max(0, project.stage_completion ?? 0));
  const stage    = project.stage ?? "Rough";
  const inRough  = stage === "Rough"  || stage === "Underground";
  const inFinish = stage === "Finish";
  const inExtras = stage === "Extras";

  const roughAllowed = inRough
    ? round2(roughPlanned * sc)
    : roughPlanned;

  const finishAllowed =
      inExtras ? finishPlanned
    : inFinish ? round2(finishPlanned * sc)
    : 0;

  const goalHours = round2(roughAllowed + finishAllowed);

  return {
    est_total_hours:      round2(totalEst),
    rough_hours_allowed:  roughAllowed,
    finish_hours_allowed: finishAllowed,
    goal_hours:           goalHours,
  };
}
