/**
 * 关卡拾取物（回血、回能量等）
 */
class Pickups {
    static spawn(scene, levelConfig) {
        return (levelConfig.pickups || [])
            .map(cfg => {
                if (cfg.type === 'health') return new HealthPickup(scene, cfg);
                if (cfg.type === 'energy') return new EnergyPickup(scene, cfg);
                return null;
            })
            .filter(Boolean);
    }
}

class HealthPickup {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y ?? (scene.levelHeight - 68);
        this.amount = Math.max(1, cfg.amount ?? 30);
        this.collected = false;
        const size = 24;

        this.sprite = scene.add.circle(this.x, this.y, size / 2, 0x44dd88, 0.85)
            .setStrokeStyle(2, 0xaaffcc, 0.9)
            .setDepth(12);
        this.label = scene.add.text(this.x, this.y, '+', {
            font: 'bold 14px Arial',
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(13);

        this._bindOverlap(scene, size);
    }

    _bindOverlap(scene, size) {
        scene.physics.add.existing(this.sprite, false);
        const body = this.sprite.body;
        body.setAllowGravity(false);
        body.setImmovable(true);
        body.setCircle(size / 2);
        scene.physics.add.overlap(scene.player.sprite, this.sprite, () => this.collect());
    }

    collect() {
        if (this.collected) return;
        const player = this.scene.player;
        if (!player || player.hp <= 0) return;
        if (player.hp >= PlayerConfig.maxHp) return;

        this.collected = true;
        player.heal(this.amount);
        Effects.hitFlash(this.scene, this.x, this.y - 8);
        this._destroy();
    }

    _destroy() {
        this.sprite?.destroy();
        this.sprite = null;
        this.label?.destroy();
        this.label = null;
    }
}

class EnergyPickup {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y ?? (scene.levelHeight - 68);
        this.amount = Math.max(1, cfg.amount ?? 25);
        this.collected = false;
        const size = 24;

        this.sprite = scene.add.circle(this.x, this.y, size / 2, 0x44aaff, 0.88)
            .setStrokeStyle(2, 0xaaddff, 0.95)
            .setDepth(12);
        this.label = scene.add.text(this.x, this.y, '⚡', {
            font: '14px Arial',
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(13);

        this._bindOverlap(scene, size);
    }

    _bindOverlap(scene, size) {
        scene.physics.add.existing(this.sprite, false);
        const body = this.sprite.body;
        body.setAllowGravity(false);
        body.setImmovable(true);
        body.setCircle(size / 2);
        scene.physics.add.overlap(scene.player.sprite, this.sprite, () => this.collect());
    }

    collect() {
        if (this.collected) return;
        const player = this.scene.player;
        if (!player || player.hp <= 0) return;
        if (player.energy >= PlayerConfig.maxEnergy) return;

        this.collected = true;
        player.gainEnergy(this.amount);
        Effects.hitFlash(this.scene, this.x, this.y - 8);
        this._destroy();
    }

    _destroy() {
        this.sprite?.destroy();
        this.sprite = null;
        this.label?.destroy();
        this.label = null;
    }
}
