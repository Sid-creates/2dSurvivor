// Local input capture. Keyboard-driven 8-direction movement + Space to charge
// the Swap + E to open a nearby box + Shift to dash.

import type Phaser from "phaser";
import type { PlayerInput } from "../shared/types";

export interface FrameInput {
  movement: PlayerInput;
  /** True on the frame E was pressed (edge-triggered, not held). */
  openBoxPressed: boolean;
}

export class InputManager {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW: Phaser.Input.Keyboard.Key;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyS: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private space: Phaser.Input.Keyboard.Key;
  private keyE: Phaser.Input.Keyboard.Key;
  private shift: Phaser.Input.Keyboard.Key;
  private prevE = false;
  private prevDash = false;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey("W");
    this.keyA = keyboard.addKey("A");
    this.keyS = keyboard.addKey("S");
    this.keyD = keyboard.addKey("D");
    this.space = keyboard.addKey("SPACE");
    this.keyE = keyboard.addKey("E");
    this.shift = keyboard.addKey("SHIFT");
  }

  sample(): FrameInput {
    let mx = 0;
    let my = 0;
    if (this.keyW.isDown || this.cursors.up.isDown) my -= 1;
    if (this.keyS.isDown || this.cursors.down.isDown) my += 1;
    if (this.keyA.isDown || this.cursors.left.isDown) mx -= 1;
    if (this.keyD.isDown || this.cursors.right.isDown) mx += 1;
    const eDown = this.keyE.isDown;
    const justPressedE = eDown && !this.prevE;
    this.prevE = eDown;
    const dashDown = this.shift.isDown;
    const justPressedDash = dashDown && !this.prevDash;
    this.prevDash = dashDown;
    return {
      movement: { mx, my, charging: this.space.isDown, dashPressed: justPressedDash },
      openBoxPressed: justPressedE,
    };
  }
}
