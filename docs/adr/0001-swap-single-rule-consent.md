# 0001 - Swap is a single-rule two-party consent mechanic

## Context

A position Swap is the signature co-op mechanic. We considered several consent models (unilateral initiation, mutual simultaneous charge, refusable swaps, warned-but-no-veto) and several interaction rules with other game states (looting immunity, swap-cancels-menu, etc.).

## Decision

A Swap fires **if and only if both players' charges are full**. There is exactly one rule and no special cases.

Consequences that fall out of this single rule (and therefore require no separate code):

- A player who is **looting a box** cannot charge (their input is consumed by the loot menu). Therefore a looting player cannot be part of a Swap, and so cannot be yanked out of their menu.
- A non-looting player can charge to full with the looter as their target, but the Swap will not fire until the looter also charges, which they cannot do until they finish or cancel the loot. The looter is therefore effectively immune-by-construction, not by a special "immune" flag.
- If a Swap is urgent while a partner is looting, the looter can cancel their loot menu to begin charging. The decision to abandon loot for a defensive Swap is the looter's, not forced on them.

## Why

Special-cased immunity (a `looting` flag that blocks Swap-targeting) would have been the obvious implementation. We rejected it because:

1. It introduces a second rule that must be kept in sync with the first.
2. It removes player agency: the looter can't choose to abandon loot for an urgent Swap.
3. The single-rule version produces the same observable behavior at every edge case we tested, with strictly less code.

The single-rule version is harder to reason about casually but easier to implement correctly and impossible to put in an inconsistent state.
