// Owns simulation state. The crucial split: `prepare` (world → Monte Carlo →
// scoring) is memoised on every structural input *except* the budget, while the
// budget walk re-runs on each tick. So dragging the budget slider is instant and
// never re-rolls the Monte Carlo.

import { useEffect, useMemo, useRef, useState } from "react";
import { allocateFor, DEFAULT_CONFIG, fullListCost, prepare } from "../engine/simulate";
import type { Config, MaterialOverride } from "../engine/types";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function useSimulation() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const budgetInitialised = useRef(false);

  // Structural signature excludes the budget so the slider doesn't re-prepare.
  const structuralKey = useMemo(() => JSON.stringify({ ...config, budget: 0 }), [config]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prepared = useMemo(() => prepare(config), [structuralKey]);
  const fullCost = useMemo(() => fullListCost(prepared), [prepared]);

  // Start at the economic optimum: fund every value-positive unit and no more.
  // Ceil to €100 (not round) so we never land just below the optimum and leave
  // the last value-positive unit unfunded. The user can then slide up or down.
  const defaultBudget = () => Math.ceil(prepared.economicSpend / 100) * 100;

  useEffect(() => {
    if (!budgetInitialised.current && fullCost > 0) {
      budgetInitialised.current = true;
      setConfig((c) => ({ ...c, budget: defaultBudget() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullCost]);

  const allocation = useMemo(() => allocateFor(prepared, config.budget), [prepared, config.budget]);

  const actions = useMemo(
    () => ({
      setBudget: (b: number) => setConfig((c) => ({ ...c, budget: clamp(Math.round(b), 0, Math.ceil(fullCost * 1.05)) })),
      setCorrelatedShock: (on: boolean) => setConfig((c) => ({ ...c, correlatedShock: on })),
      setStockoutPenaltyRatio: (r: number) => setConfig((c) => ({ ...c, stockoutPenaltyRatio: clamp(r, 0.05, 2) })),
      setMaterialOverride: (id: string, o: MaterialOverride) =>
        setConfig((c) => {
          const next = { ...c.materialOverrides };
          const merged = { ...next[id], ...o };
          // drop undefined keys so a reset to default removes the override
          (Object.keys(merged) as (keyof MaterialOverride)[]).forEach((k) => merged[k] === undefined && delete merged[k]);
          if (Object.keys(merged).length === 0) delete next[id];
          else next[id] = merged;
          return { ...c, materialOverrides: next };
        }),
      toggleSubstitution: (donorId: string, recipientId: string) =>
        setConfig((c) => {
          const key = `${donorId}->${recipientId}`;
          const has = c.disabledSubstitutions.includes(key);
          return {
            ...c,
            disabledSubstitutions: has
              ? c.disabledSubstitutions.filter((k) => k !== key)
              : [...c.disabledSubstitutions, key],
          };
        }),
      reset: () => {
        // Reset to the same default seed leaves fullCost unchanged, so the init
        // effect won't re-fire — set the budget directly here.
        budgetInitialised.current = true;
        setConfig({ ...DEFAULT_CONFIG, budget: defaultBudget() });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullCost, prepared.economicSpend],
  );

  return { config, prepared, allocation, fullCost, actions };
}

export type SimActions = ReturnType<typeof useSimulation>["actions"];
