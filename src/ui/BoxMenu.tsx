import { motion } from "motion/react";
import { WEAPON_DEFS } from "../sim/weapons";
import type { CurseKind, WeaponPickOption } from "../shared/types";

interface BoxMenuProps {
  options: WeaponPickOption[];
  onChoose: (optionIndex: number) => void;
  onCancel: () => void;
}

const DASH_ACCENT = 0xfbbf24;
const CURSE_ACCENT = 0xef4444;

const DASH_NAMES: Record<NonNullable<WeaponPickOption["dashMod"]>, string> = {
  range: "Dash: Reach",
  trail: "Dash: Trail",
  cooldown: "Dash: Cooldown",
};

const DASH_DESC: Record<NonNullable<WeaponPickOption["dashMod"]>, string> = {
  range: "Longer dash burst. Cover more ground in a blink.",
  trail: "Leave a damaging trail along your dash path.",
  cooldown: "Dash comes back sooner. More bursts, more i-frames.",
};

const CURSE_NAMES: Record<CurseKind, string> = {
  spawn: "Swarm Curse",
  speed: "Haste Curse",
  hp: "Frailty Curse",
  scroll: "Drift Curse",
};

const CURSE_DESC: Record<CurseKind, string> = {
  spawn: "More enemies spawn for the rest of the run.",
  speed: "Enemies chase faster for the rest of the run.",
  hp: "Your max HP is cut for the rest of the run.",
  scroll: "The safe zone scrolls faster for the rest of the run.",
};

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
  const isDash = option.dashMod !== undefined;
  const isCursed = option.cursed === true;
  const isUpgrade = !isHeal && !isShield && !isDash && option.upgradeIndex >= 0;

  const accentColor = isCursed
    ? CURSE_ACCENT
    : isDash
      ? DASH_ACCENT
      : isShield
        ? 0x7dd3fc
        : def.color;
  const accentHex = `#${accentColor.toString(16).padStart(6, "0")}`;

  const tag = isCursed
    ? "cursed"
    : isDash
      ? "dash"
      : isHeal
        ? "heal"
        : isShield
          ? "shield"
          : isUpgrade
            ? `lv ${option.resultingLevel}`
            : "new";

  const title = isCursed
    ? def.name
    : isDash
      ? DASH_NAMES[option.dashMod!]
      : isHeal
        ? "Mend"
        : isShield
          ? "Aegis"
          : def.name;

  const description = isCursed
    ? `Strong upgrade, but: ${option.curse ? CURSE_DESC[option.curse] : ""}`
    : isDash
      ? DASH_DESC[option.dashMod!]
      : isHeal
        ? "Restore some HP and close the box."
        : isShield
          ? `Add +${option.shield} absorb shield. Damage hits this before HP.`
          : def.description;

  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 ${
        isCursed
          ? "border-[var(--color-danger)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface)]"
          : isDash
            ? "border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)]"
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: accentHex }} />
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
            isCursed ? "text-[var(--color-danger)]" : "text-[var(--color-text-faint)]"
          }`}
        >
          {tag}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
      {isCursed && option.curse && (
        <div className="pt-1">
          <span className="rounded border border-[var(--color-danger)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-danger)]">
            {CURSE_NAMES[option.curse]}
          </span>
        </div>
      )}
      {!isHeal && !isShield && !isDash && !isCursed && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Stat label="dmg" value={def.baseDamage.toString()} />
          <Stat label="rate" value={`${(1 / def.baseInterval).toFixed(1)}/s`} />
          <Stat label="range" value={def.range.toString()} />
          {def.piercing && <Stat label="pierce" value="yes" />}
          {def.orbit && <Stat label="orbit" value="yes" />}
        </div>
      )}
      {isCursed && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Stat label="dmg" value={def.baseDamage.toString()} />
          <Stat label="lv" value={option.resultingLevel.toString()} />
          <Stat label="range" value={def.range.toString()} />
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
