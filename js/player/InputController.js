/**
 * 把键盘原始按键映射成本帧/边沿事件输入。
 */
class InputController {
    constructor(scene) {
        this.scene = scene;
        this.cursors = scene.input.keyboard.createCursorKeys();
        this.keys = scene.input.keyboard.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            S: Phaser.Input.Keyboard.KeyCodes.S,
            D: Phaser.Input.Keyboard.KeyCodes.D,
            SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
            J: Phaser.Input.Keyboard.KeyCodes.J,
            K: Phaser.Input.Keyboard.KeyCodes.K,
            L: Phaser.Input.Keyboard.KeyCodes.L,
            O: Phaser.Input.Keyboard.KeyCodes.O
        });
    }

    sample() {
        const k = this.keys;
        const c = this.cursors;
        return {
            left:  k.A.isDown || c.left.isDown,
            right: k.D.isDown || c.right.isDown,
            down:  k.S.isDown || c.down.isDown,
            downPressed: Phaser.Input.Keyboard.JustDown(k.S) || Phaser.Input.Keyboard.JustDown(c.down),
            jumpPressed:     Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(c.up) || Phaser.Input.Keyboard.JustDown(k.W),
            dashPressed:     Phaser.Input.Keyboard.JustDown(k.L),
            attackPressed:   Phaser.Input.Keyboard.JustDown(k.J),
            swordChargePressed: Phaser.Input.Keyboard.JustDown(k.K),
            swordChargeHeld: k.K.isDown,
            ultimatePressed: Phaser.Input.Keyboard.JustDown(k.O)
        };
    }
}
