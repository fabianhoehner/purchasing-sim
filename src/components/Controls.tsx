// Control sidebar. The budget slider is live (it only re-walks the ranked list).
// Everything else re-runs the Monte Carlo, so those sliders commit on release to
// keep dragging smooth.

import { useEffect, useState } from "react";
import type { Config, Material, Prepared } from "../engine/types";
import type { SimActions } from "../hooks/useSimulation";

function euro(v: number): string {
  return `€${Math.round(v).toLocaleString("en-US")}`;
}

/** Range input that can commit live or only when the drag ends. */
function Slider(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  live?: boolean;
  onCommit: (v: number) => void;
  format?: (v: number) => string;
}) {
  const [local, setLocal] = useState(props.value);
  useEffect(() => setLocal(props.value), [props.value]);
  const commit = () => props.onCommit(local);
  return (
    <div className="slider-row">
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={local}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          if (props.live) props.onCommit(v);
        }}
        onPointerUp={props.live ? undefined : commit}
        onKeyUp={props.live ? undefined : commit}
      />
      <span className="slider-val">{props.format ? props.format(local) : local}</span>
    </div>
  );
}

function MaterialEditor({ world, config, actions }: { world: { materials: Material[] }; config: Config; actions: SimActions }) {
  const [sel, setSel] = useState(world.materials[0]?.id ?? "");
  const m = world.materials.find((x) => x.id === sel) ?? world.materials[0];
  if (!m) return null;
  const hasOverride = !!config.materialOverrides[m.id];
  return (
    <div className="ctrl-group">
      <label className="ctrl-label">Per-material edits</label>
      <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Edit material">
        {world.materials.map((mm) => (
          <option key={mm.id} value={mm.id}>
            {mm.name}
          </option>
        ))}
      </select>
      <div className="sub-ctrl">
        <span className="sub-label">Unit cost · €{m.unitCost.toFixed(2)}</span>
        <Slider
          value={m.unitCost}
          min={0.5}
          max={Math.max(120, Math.ceil(m.unitCost * 2))}
          step={0.5}
          onCommit={(v) => actions.setMaterialOverride(m.id, { unitCost: v })}
          format={(v) => `€${v.toFixed(2)}`}
        />
      </div>
      <div className="sub-ctrl">
        <span className="sub-label">Lead time · {m.leadTimeMean.toFixed(1)} mo</span>
        <Slider
          value={m.leadTimeMean}
          min={1}
          max={6}
          step={0.5}
          onCommit={(v) => actions.setMaterialOverride(m.id, { leadTimeMean: v })}
          format={(v) => `${v.toFixed(1)} mo`}
        />
      </div>
      {hasOverride && (
        <button className="link-btn" onClick={() => actions.setMaterialOverride(m.id, { unitCost: undefined, leadTimeMean: undefined })}>
          reset this material
        </button>
      )}
    </div>
  );
}

export function Controls({
  config,
  prepared,
  fullCost,
  actions,
}: {
  config: Config;
  prepared: Prepared;
  fullCost: number;
  actions: SimActions;
}) {
  return (
    <aside className="controls">
      <div className="ctrl-group primary">
        <label className="ctrl-label">Budget</label>
        <Slider
          value={config.budget}
          min={0}
          max={Math.ceil(fullCost * 1.05)}
          step={Math.max(100, Math.round(fullCost / 400))}
          live
          onCommit={actions.setBudget}
          format={euro}
        />
        <input
          className="num-input"
          type="number"
          value={config.budget}
          min={0}
          step={500}
          onChange={(e) => actions.setBudget(Number(e.target.value))}
        />
        <p className="ctrl-hint">Funds the ranked list top-down. Full list costs {euro(fullCost)}.</p>
      </div>

      <div className="ctrl-group">
        <label className="ctrl-label">Manufacturing lead time</label>
        <Slider value={config.manufacturingLeadTime} min={0} max={6} step={1} onCommit={actions.setManufacturingLeadTime} format={(v) => `${v} mo`} />
        <p className="ctrl-hint">Shifts the requirement curve earlier than the sale.</p>
      </div>

      <div className="ctrl-group">
        <label className="ctrl-label">Stockout penalty</label>
        <Slider
          value={config.stockoutPenaltyRatio}
          min={0.05}
          max={1.5}
          step={0.05}
          onCommit={actions.setStockoutPenaltyRatio}
          format={(v) => `${v.toFixed(2)}× margin`}
        />
        <p className="ctrl-hint">How dearly a missed sale is valued, relative to the enabled margin.</p>
      </div>

      <div className="ctrl-group">
        <label className="ctrl-toggle">
          <input type="checkbox" checked={config.correlatedShock} onChange={(e) => actions.setCorrelatedShock(e.target.checked)} />
          Correlated demand shock
        </label>
        <p className="ctrl-hint">Goods move together, fattening the tail of any shared material.</p>
      </div>

      {prepared.substitutionPairs.length > 0 && (
        <div className="ctrl-group">
          <label className="ctrl-label">Substitution links (one-way)</label>
          {prepared.substitutionPairs.map((p) => (
            <label className="ctrl-toggle small" key={`${p.donorId}->${p.baseId}`}>
              <input type="checkbox" checked={p.enabled} onChange={() => actions.toggleSubstitution(p.donorId, p.baseId)} />
              <span>
                <strong>{p.donorName}</strong> can rescue <strong>{p.baseName}</strong>
              </span>
            </label>
          ))}
          <p className="ctrl-hint">Switch a link off to watch the premium part lose its option value.</p>
        </div>
      )}

      <MaterialEditor world={prepared.world} config={config} actions={actions} />

      <div className="ctrl-group buttons">
        <button className="btn" onClick={actions.reseed}>
          Reseed world
        </button>
        <button className="btn ghost" onClick={actions.reset}>
          Reset to defaults
        </button>
        <span className="seed-tag">seed {config.seed}</span>
      </div>
    </aside>
  );
}
