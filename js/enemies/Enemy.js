/**
 * 敌人基类。两个具体类型通过 type 区分。
 */
class Enemy {
    constructor(scene, x, y, type) {
        this.scene = scene;
        this.type = type; // 'melee' | 'ranged'
        const texKey = type === 'ranged' ? 'enemy_range' : 'enemy_melee';
        this.sprite = scene.physics.add.sprite(x, y, texKey);
        this.sprite.setOrigin(0.5, 1);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.body.setSize(28, 50);
        this.sprite.body.setOffset(8, 4);
        this.sprite.owner = this;

        this.maxHp = type === 'ranged' ? 30 : 50;
        this.hp = this.maxHp;
        this.alive = true;

        this._hpBarW = 40;
        this._hpBarFillW = 36;
        this._hpBarOffsetY = 72;
        const barDepth = (this.sprite.depth || 0) + 1;
        this.hpBarBg = scene.add.rectangle(x, y - this._hpBarOffsetY, this._hpBarW, 4, 0x000000, 0.65)
            .setOrigin(0.5, 0.5).setDepth(barDepth);
        this.hpBarFill = scene.add.rectangle(x - this._hpBarW / 2 + 2, y - this._hpBarOffsetY, this._hpBarFillW, 3, Palette.enemy)
            .setOrigin(0, 0.5).setDepth(barDepth);
        this.facing = -1;
        this.state = 'patrol';
        this.lastAttackAt = -99999;
        this.attackCooldown = type === 'ranged' ? 1500 : 900;
        this.detectRange = type === 'ranged' ? 480 : 360;
        this.attackRange = type === 'ranged' ? 420 : 50;
        this.moveSpeed = type === 'ranged' ? 80 : 140;
        this.contactDamage = type === 'ranged' ? 6 : 12;

        this.patrolOriginX = x;
        this.patrolRange = 120;
    }

    get x() { return this.sprite.x; }
    get y() { return this.sprite.y; }
    get body() { return this.sprite.body; }

    update(time, delta, player) {
        if (!this.alive) return;

        const dx = player.x - this.x;
        const dist = Math.abs(dx);
        const dir = dx >= 0 ? 1 : -1;

        if (dist < this.detectRange) {
            this.facing = dir;
            if (this.type === 'ranged') {
                // 远程：保持距离 + 周期射击
                if (dist < this.attackRange * 0.6) {
                    this.sprite.setVelocityX(-dir * this.moveSpeed);
                } else if (dist > this.attackRange) {
                    this.sprite.setVelocityX(dir * this.moveSpeed);
                } else {
                    this.sprite.setVelocityX(0);
                }
                if (dist < this.attackRange && time - this.lastAttackAt > this.attackCooldown) {
                    this.lastAttackAt = time;
                    this.scene.spawnEnemyBullet(
                        this.x + dir * 24,
                        this.y - 28,
                        dir * 380
                    );
                }
            } else {
                // 近战：追击 + 接触伤害（在 GameScene overlap 里结算）
                this.sprite.setVelocityX(dir * this.moveSpeed);
            }
        } else {
            // 巡逻
            const offset = this.x - this.patrolOriginX;
            if (offset > this.patrolRange) this.facing = -1;
            else if (offset < -this.patrolRange) this.facing = 1;
            this.sprite.setVelocityX(this.facing * this.moveSpeed * 0.5);
        }

        this.sprite.setFlipX(this.facing < 0);
        this._syncHpBar();
    }

    _syncHpBar() {
        if (!this.hpBarBg || !this.hpBarFill) return;
        const barY = this.y - this._hpBarOffsetY;
        this.hpBarBg.setPosition(this.x, barY);
        const ratio = Math.max(0, this.hp / this.maxHp);
        this.hpBarFill.width = this._hpBarFillW * ratio;
        this.hpBarFill.setPosition(this.x - this._hpBarW / 2 + 2, barY);
    }

    takeDamage(amount, fromX) {
        if (!this.alive) return;
        this.hp -= amount;
        const knock = fromX > this.x ? -260 : 260;
        this.sprite.setVelocity(knock, -200);
        this.sprite.setTint(0xffffff);
        this.scene.time.delayedCall(70, () => this.sprite && this.sprite.clearTint());
        this._syncHpBar();
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.alive = false;
        if (this.hpBarBg) { this.hpBarBg.destroy(); this.hpBarBg = null; }
        if (this.hpBarFill) { this.hpBarFill.destroy(); this.hpBarFill = null; }
        Effects.explosion(this.scene, this.x, this.y - 24, 0.8);
        this.sprite.destroy();
        this.scene.onEnemyKilled && this.scene.onEnemyKilled(this);
    }
}
