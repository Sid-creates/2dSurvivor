// Local input capture. Keyboard-driven 8-direction movement + space-to-charge
// + E to open nearby box.

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
  private prevE = false;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey("W");
    this.keyA = keyboard.addKey("A");
    this.keyS = keyboard.addKey("S");
    this.keyD = keyboard.addKey("D");
    this.space = keyboard.addKey("SPACE");
    this.keyE = keyboard.addKey("E");
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
    return {
      movement: { mx, my, charging: this.space.isDown },
      openBoxPressed: justPressedE,
    };
  }
}
