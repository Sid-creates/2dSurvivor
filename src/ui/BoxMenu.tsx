import { motion } from "motion/react";
import { WEAPON_DEFS } from "../sim/weapons";
import type { WeaponPickOption } from "../shared/types";

interface BoxMenuProps {
  options: WeaponPickOption[];
  onChoose: (optionIndex: number) => void;
  onCancel: () => void;
}

// Pick-3 weapon menu. Per design-taste skill: dark surface, single accent,
// no em-dashes, no serif, no fake screenshots. The three options are the
// whole UI; the game continues in real time behind the overlay.

export function BoxMenu({ options, onChoose, onCancel }: BoxMenuProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6"
      >
        <header className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-[var(--color-text)]">
              Choose your upgrade
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              The fight continues. Pick fast.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
          >
            Skip
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {options.map((opt, i) => (
            <OptionCard key={i} option={opt} onClick={() => onChoose(i)} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function OptionCard({
  option,
  onClick,
}: {
  option: WeaponPickOption;
  onClick: () => void;
}) {
  const def = WEAPON_DEFS[option.kind];
  const isHeal = option.resultingLevel === 0;
  const isShield = option.shield !== undefined;
  const isUpgrade = !isHeal && !isShield && option.upgradeIndex >= 0;
  const accentColor = isShield ? 0x7dd3fc : def.color;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)] active:translate-y-0"
    >
      <div className="flex w-full items-center justify-between">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: `#${accentColor.toString(16).padStart(6, "0")}` }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          {isHeal ? "heal" : isShield ? "shield" : isUpgrade ? `lv ${option.resultingLevel}` : "new"}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">
          {isHeal ? "Mend" : isShield ? "Aegis" : def.name}
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {isHeal
            ? "Restore some HP and close the box."
            : isShield
              ? `Add +${option.shield} absorb shield. Damage hits this before HP.`
              : def.description}
        </p>
      </div>
      {!isHeal && !isShield && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Stat label="dmg" value={def.baseDamage.toString()} />
          <Stat label="rate" value={`${(1 / def.baseInterval).toFixed(1)}/s`} />
          <Stat label="range" value={def.range.toString()} />
          {def.piercing && <Stat label="pierce" value="yes" />}
          {def.orbit && <Stat label="orbit" value="yes" />}
        </div>
      )}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
      {label} {value}
    </span>
  );
}
