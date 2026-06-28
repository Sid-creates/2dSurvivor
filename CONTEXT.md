# 2DSurvivor

A peer-to-peer co-op survivor-like where two players (scaling to four) fight off waves of enemies, find random weapons from loot boxes, and can coordinate a position Swap to trade places on the battlefield.

## Language

**Swap**:
A coordinated action where two players trade positions on the battlefield. Both players must hold their charge button until both charges complete; on completion, both players teleport to the other's former position with invulnerability frames. Costs mana.
_Avoid_: teleport, blink, trade, exchange

**Charge**:
The wind-up phase of a Swap. A player holds the Swap button to fill their charge. Both players' charges must complete for the Swap to fire. A charge can be released (cancelled) by letting go.
_Avoid_: wind-up, cast, channel

**i-frames**:
Invulnerability frames granted to both players during and briefly after a Swap completes. Enemies cannot deal damage during this window.
_Avoid_: invuln, immunity, dodge frames

**Mana**:
The shared resource pool spent to initiate a Swap. Drains on use, regenerates over time.
_Avoid_: energy, stamina, focus, resource

**Box**:
A loot container that offers the opener a choice of three random weapons or upgrades. Two kinds exist: small drops from elite/boss enemies, and rare world-spawn chests at fixed map locations.
_Avoid_: chest, crate, loot, drop, pickup

**Looting**:
The state a player enters while the Box pick-3 menu is open. The game continues in real time for both players during Looting; only the looter's input is consumed by the menu. A Looting player cannot Charge and therefore cannot be part of a Swap.
_Avoid_: opening, picking, menuing

## Roles

**Player**:
The persistent game-logical actor that owns weapons, mana, and a battlefield position for the duration of a match. A Player is not an input slot and not a network peer; those are different concepts bound to a Player.
_Avoid_: character, avatar, hero, user

**InputSlot**:
The mapping from a physical input device (keyboard, gamepad slot 1, gamepad slot 2) to a Player. Distinct from Player identity and from Peer role.
_Avoid_: controller, port, P1/P2

**Peer**:
The network-level actor in the WebRTC session. Each Peer is one browser tab on one machine. A Peer is bound to exactly one Player for the duration of a match.
_Avoid_: client, node, connection

**Host**:
The Peer that owns the authoritative world simulation. There is exactly one Host per session. The Host is a Peer role, not a Player property.
_Avoid_: server, authority, master

**Guest**:
Any Peer that is not the Host. A Guest sends its local Player's inputs to the Host and renders snapshots broadcast by the Host. There may be multiple Guests (up to 3 in the 4-player future).
_Avoid_: client, slave

**Opener**:
The transient role held by the Player currently inside a Box's pick-3 menu. The other Player is the Non-opener. Becoming the Opener requires being the first Player to interact with the Box; the other Player cannot open the same Box.
_Avoid_: looter (use Looting for the state, Opener for the role)

## Game Structure

**Wave**:
A discrete escalating combat encounter. Waves are separated by short breaks during which players may open Boxes, coordinate Swaps, and reposition. The overall run is timed; surviving to the end of the run timer is the win condition.

**Boss Wave**:
A special Wave whose primary enemy is a single powerful Boss. A Boss Wave has a DPS-check Timer; if the Boss is not defeated before the Timer expires, the Boss enters Phase 2 and becomes substantially harder.
_Avoid_: boss fight, mini-boss

**Timer (Boss)**:
The DPS-check window on a Boss Wave. Distinct from the run survival timer.

**Phase 2**:
The escalated state a Boss enters when its Timer expires without being defeated. Phase 2 bosses are harder (more HP, faster, new attack patterns) but typically drop better loot to compensate for the failure to kill in time.
_Avoid_: enrage, rage, second phase

**Downed**:
The state a Player enters when their HP reaches zero. A Downed Player cannot act, cannot Charge, and cannot be the target of a Swap (because they cannot complete the second charge). A Downed Player is revived when their partner reaches them and remains in proximity for a revive channel duration.
_Avoid_: dead, dying, KO

**Run**:
A single play session from spawn to win or loss. A Run has a fixed survival duration as its win condition.
_Avoid_: match, game, session (session is reserved for the network session)

## Design Intent

**Swap Strategic Role**:
The Swap is intended for three uses: emergency escape (a surrounded player blinks out), positional optimization (players trade roles mid-fight, e.g. ranged↔melee), and boss-phase mitigation (trade who occupies a bad spot during Phase 2 positional attacks). Box-racing (using Swap to reach a Box before a partner) is explicitly **not** a design goal, despite Boxes being first-to-open. The UI should not emphasize partner-vs-partner competition over loot.

## Weapons

**Weapon**:
An auto-attacking offensive item bound to a Player. Each Weapon fires on its own cooldown without player input; the player picks targets implicitly by being near enemies. A Player's loadout holds up to 4 Weapons. Each Weapon levels up to a maximum of 4.
_Avoid_: gun, item, ability, skill

**Weapon Kind**:
One of five distinct firing patterns. The five Kinds are: Pulse Bolt (single accurate shot), Scatter Cone (three-shot fan), Orbit Shard (two projectiles orbiting the player), Phase Lance (long-range piercing shot), Nova Burst (radial burst of twelve shards). Each Kind has independent damage, fire rate, projectile count, and behavior.
_Avoid_: weapon type, class

**Loadout**:
The set of Weapons a Player currently holds, maximum 4. New Weapons from Boxes are added to the Loadout; upgrades apply to existing Loadout entries. When the Loadout is full and all Weapons are at max level, a Box offers a Mend instead.
_Avoid_: inventory, kit

**Mend**:
The fallback Box option when a Player's Loadout is full and all Weapons are at maximum level. Restores some HP and closes the Box without adding or upgrading a Weapon.
_Avoid_: heal, restore

## Revive

**Revive**:
The act of restoring a Downed Player to active play. The non-downed Player must stand within Revive Range of the Downed Player for the Revive Duration (2.5 seconds). Revive progress fills while in range and slowly decays when out of range. On completion, the Downed Player returns at 50% HP with brief i-frames.
_Avoid_: resurrection, pick-up, revive channel (use Revive for the act, Downed for the state)

**Revive Range**:
The proximity distance within which a non-downed Player can fill a Downed Player's Revive progress.
_Avoid_: revive radius

## Run Outcome

**Run Status**:
The current state of the Run: playing, won, or lost. Transitions from playing to won when the Run Duration is reached. Transitions from playing to lost when all Players are Downed simultaneously. Once ended, the Run cannot resume; players return to the lobby to start a new Run.
_Avoid_: game state, match state

**Run Duration**:
The fixed survival time a Run must reach for a Win. Set to 10 minutes for v1.

