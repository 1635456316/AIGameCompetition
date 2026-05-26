/**
 * 敌人：逻辑体负责碰撞与 AI，表现层负责贴图与受击反馈。
 */
class Enemy {
    constructor(scene, x, y, type) {
        this.scene = scene;
        this.type = type;
        const cfg = EnemyConfigs.get(type);
        this.config = cfg;

        this.logic = new EntityLogic(scene, x, y, cfg.logic);
        this.view = new EntityView(scene, x, y, cfg.visual);
        this.logic.sprite.owner = this;
        this.sprite = this.logic.sprite;
        this.viewSprite = this.view.sprite;

        const logic = cfg.logic;
        this.maxHp = logic.maxHp;
        this.hp = this.maxHp;
        this.alive = true;
        this.facing = -1;
        this.state = 'patrol';
        this.lastAttackAt = -99999;
        this.attackCooldown = logic.attackCooldown;
        this.detectRange = logic.detectRange;
        this.attackRange = logic.attackRange;
        this.moveSpeed = logic.moveSpeed;
        this.contactDamage = logic.contactDamage;
        this.patrolOriginX = x;
        this.patrolRange = logic.patrolRange;

        const barCfg = cfg.visual.hpBar || {};
        this._hpBarW = barCfg.width || 40;
        this._hpBarFillW = barCfg.fillWidth || 36;
        this._hpBarOffsetY = barCfg.offsetY || 72;
        const barDepth = (this.viewSprite.depth || 0) + 1;
        this.hpBarBg = scene.add.rectangle(x, y - this._hpBarOffsetY, this._hpBarW, 4, 0x000000, 0.65)
            .setOrigin(0.5, 0.5).setDepth(barDepth);
        this.hpBarFill = scene.add.rectangle(x - this._hpBarW / 2 + 2, y - this._hpBarOffsetY, this._hpBarFillW, 3, Palette.enemy)
            .setOrigin(0, 0.5).setDepth(barDepth);
        this.syncView();
    }

    get x() { return this.logic.x; }
    get y() { return this.logic.y; }
    get body() { return this.logic.body; }

    syncView() {
        this.view.syncFromLogic(this.logic);
    }

    update(time, delta, player) {
        if (!this.alive) return;

        const dx = player.x - this.x;
        const dist = Math.abs(dx);
        const dir = dx >= 0 ? 1 : -1;
        const logic = this.config.logic;

        if (dist < this.detectRange) {
            this.facing = dir;
            if (this.type === 'ranged') {
                if (dist < this.attackRange * 0.6) {
                    this.logic.setVelocityX(-dir * this.moveSpeed);
                } else if (dist > this.attackRange) {
                    this.logic.setVelocityX(dir * this.moveSpeed);
                } else {
                    this.logic.setVelocityX(0);
                }
                if (dist < this.attackRange && time - this.lastAttackAt > this.attackCooldown) {
                    this.lastAttackAt = time;
                    this.scene.spawnEnemyBullet(
                        this.x + dir * (logic.bulletSpawnOffsetX || 24),
                        this.y - (logic.bulletSpawnOffsetY || 28),
                        dir * (logic.bulletSpeed || 380)
                    );
                }
            } else {
                this.logic.setVelocityX(dir * this.moveSpeed);
            }
        } else {
            const offset = this.x - this.patrolOriginX;
            if (offset > this.patrolRange) this.facing = -1;
            else if (offset < -this.patrolRange) this.facing = 1;
            this.logic.setVelocityX(this.facing * this.moveSpeed * 0.5);
        }

        this.view.setFlipX(this.facing < 0);
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
        this.logic.setVelocity(knock, -200);
        this.view.setTint(0xffffff);
        this.scene.time.delayedCall(70, () => this.viewSprite && this.view.clearTint());
        this._syncHpBar();
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.alive = false;
        const deathX = this.x;
        const deathY = this.y;
        if (this.hpBarBg) { this.hpBarBg.destroy(); this.hpBarBg = null; }
        if (this.hpBarFill) { this.hpBarFill.destroy(); this.hpBarFill = null; }
        if (this.sprite) {
            this.sprite.owner = null;
        }
        Effects.explosion(this.scene, deathX, deathY - 24, 0.8);
        this.view.destroy();
        this.logic.destroy();
        this.sprite = null;
        this.viewSprite = null;
        this.scene.onEnemyKilled && this.scene.onEnemyKilled(this);
    }
}
