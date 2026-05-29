/**
 * 敌人：逻辑体负责碰撞与 AI，表现层负责贴图与受击反馈。
 */
class Enemy {
    constructor(scene, x, y, type, spawnCfg = {}) {
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
        this.maxHp = spawnCfg.hp ?? logic.maxHp;
        this.hp = this.maxHp;
        this.killEnergy = spawnCfg.killEnergy ?? scene.levelConfig?.enemyKillEnergy ?? 10;
        this.enemyId = spawnCfg.id != null && spawnCfg.id !== ''
            ? String(spawnCfg.id)
            : null;
        this.alive = true;
        this.facing = -1;
        this.lastAttackAt = -99999;
        this.attackCooldown = logic.attackCooldown || 0;
        this.moveSpeed = logic.moveSpeed;
        this.contactDamage = logic.contactDamage;
        this.contactDamageInterval = logic.contactDamageInterval || 0;
        this.lastContactDamageAt = 0;
        this.patrolOriginX = x;
        this.patrolRange = logic.patrolRange ?? 120;
        this.samePlaneThreshold = logic.samePlaneThreshold ?? 72;
        this.detectRangeX = spawnCfg.detectRangeX ?? logic.detectRangeX ?? 360;
        this.detectRangeY = spawnCfg.detectRangeY ?? logic.detectRangeY ?? null;
        this.shootRangeX = logic.shootRangeX ?? 380;

        this._platformBounds = null;
        this._initPlatformBounds(x, y);

        this.anchorY = y;
        if (type === 'flying') {
            this.logic.sprite.body.setAllowGravity(false);
        }

        this._rayPhase = null;
        this._rayAngle = 0;
        this._rayWarningGfx = null;

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

    _initPlatformBounds(x, y) {
        const platforms = this.scene.levelConfig?.platforms || [];
        const tolerance = 28;
        for (const plat of platforms) {
            const px = plat[0];
            const py = plat[1];
            const count = plat[2] || 1;
            if (Math.abs(y - py) > tolerance) continue;
            const halfSeg = 48;
            const left = px - halfSeg + 10;
            const right = px + (count - 1) * 96 + halfSeg - 10;
            if (x >= left - 40 && x <= right + 40) {
                this._platformBounds = { left, right, y: py };
                return;
            }
        }
        this._platformBounds = null;
    }

    _patrolLimits() {
        let left = this.patrolOriginX - this.patrolRange;
        let right = this.patrolOriginX + this.patrolRange;
        if (this._platformBounds) {
            left = Math.max(left, this._platformBounds.left);
            right = Math.min(right, this._platformBounds.right);
        }
        return { left, right };
    }

    _isSamePlaneAs(target) {
        return Math.abs(this.y - target.y) <= this.samePlaneThreshold;
    }

    _isInDetectRangeY(target) {
        if (this.detectRangeY == null) return true;
        return Math.abs(this.y - target.y) <= this.detectRangeY;
    }

    _edgeTurnDir(dir) {
        if (!this._platformBounds || this.type === 'flying') return dir;
        const margin = 14;
        const body = this.body;
        const halfW = body ? body.width * 0.5 : 16;
        const nextFront = this.x + dir * (halfW + margin);
        if (nextFront <= this._platformBounds.left || nextFront >= this._platformBounds.right) {
            return -dir;
        }
        return dir;
    }

    _updatePatrol() {
        const { left, right } = this._patrolLimits();
        // 平台过窄时避免 left+4 与 right-4 同时成立导致 facing 每帧翻转
        if (right - left < 16) {
            this.logic.setVelocityX(0);
            return;
        }
        if (this.x >= right - 4) {
            this.facing = -1;
        } else if (this.x <= left + 4) {
            this.facing = 1;
        }
        let dir = this.facing;
        dir = this._edgeTurnDir(dir);
        this.facing = dir;
        const speed = this.type === 'flying' ? this.moveSpeed : this.moveSpeed * 0.55;
        this.logic.setVelocityX(dir * speed);
        if (this.type === 'flying') {
            this.logic.setVelocityY(0);
        }
    }

    _isInAimedShootRange(player, logic) {
        const spawnY = this.y - (logic.bulletSpawnOffsetY || 36);
        const tx = player?.x ?? this.x;
        const ty = (player?.y ?? this.y) - 40;
        const maxRange = logic.shootRange2D ?? Math.max(this.shootRangeX, 460);
        return Math.hypot(tx - this.x, ty - spawnY) <= maxRange;
    }

    _fireRangedBullet(player, logic, samePlane) {
        const dir = samePlane ? this.facing : (player.x >= this.x ? 1 : -1);
        const spawnX = this.x + dir * (logic.bulletSpawnOffsetX || 28);
        const spawnY = this.y - (logic.bulletSpawnOffsetY || 36);
        const speed = logic.bulletSpeed || 400;
        if (samePlane) {
            this.scene.spawnEnemyBullet(spawnX, spawnY, this.facing * speed, 0);
            return;
        }
        const tx = player.x;
        const ty = player.y - 40;
        const dx = tx - spawnX;
        const dy = ty - spawnY;
        const len = Math.hypot(dx, dy) || 1;
        this.scene.spawnEnemyBullet(spawnX, spawnY, (dx / len) * speed, (dy / len) * speed);
    }

    _updateGroundCombat(time, player) {
        const dx = player.x - this.x;
        const distX = Math.abs(dx);
        const dir = dx >= 0 ? 1 : -1;
        const samePlane = this._isSamePlaneAs(player);
        const logic = this.config.logic;

        if (this.type === 'melee' && samePlane && distX < this.detectRangeX && this._isInDetectRangeY(player)) {
            this.facing = this._edgeTurnDir(dir);
            this.logic.setVelocityX(this.facing * this.moveSpeed);
        } else if (this.type === 'ranged' && distX < this.detectRangeX && this._isInDetectRangeY(player)) {
            this.facing = dir;
            const inShootRange = samePlane
                ? distX < this.shootRangeX
                : this._isInAimedShootRange(player, logic);
            if (inShootRange) {
                this.logic.setVelocityX(0);
                if (time - this.lastAttackAt > this.attackCooldown) {
                    this.lastAttackAt = time;
                    this._fireRangedBullet(player, logic, samePlane);
                }
            } else if (samePlane) {
                this.logic.setVelocityX(0);
            } else {
                this._updatePatrol();
            }
        } else {
            this._updatePatrol();
        }
    }

    _updateFlying(time, player) {
        if (this._rayPhase === 'warn') {
            this.logic.setVelocity(0, 0);
            this._drawRayWarning();
            if (time >= this._rayFireAt) {
                this._fireRay(player);
            }
            return;
        }

        const dx = player.x - this.x;
        const distX = Math.abs(dx);
        const dir = dx >= 0 ? 1 : -1;
        const logic = this.config.logic;

        if (distX < this.detectRangeX && this._isInDetectRangeY(player) && time - this.lastAttackAt > this.attackCooldown) {
            this.facing = dir;
            this.logic.setVelocity(0, 0);
            this._beginRayAttack(player, time, logic);
        } else {
            this._updatePatrol();
        }
    }

    /** 飞行怪射线固定长度：足够贯穿整屏（与玩家距离无关） */
    _getRayLength(logic) {
        if (logic?.rayLength) return logic.rayLength;
        const w = typeof GAME_WIDTH !== 'undefined' ? GAME_WIDTH : 1280;
        const h = typeof GAME_HEIGHT !== 'undefined' ? GAME_HEIGHT : 720;
        return Math.ceil(Math.hypot(w, h)) + 160;
    }

    _beginRayAttack(player, time, logic) {
        const ox = this.x;
        const oy = this.y - 20;
        const tx = player.x;
        const ty = player.y - 28;
        this._rayAngle = Math.atan2(ty - oy, tx - ox);
        this._rayPhase = 'warn';
        this._rayFireAt = time + (logic.rayWarningMs || 1000);
        this._rayLength = this._getRayLength(logic);
        this.lastAttackAt = time;
        this._ensureRayWarningGfx();
    }

    _ensureRayWarningGfx() {
        if (this._rayWarningGfx?.active) return;
        this._rayWarningGfx = this.scene.add.graphics().setDepth(14);
    }

    _drawRayWarning() {
        if (!this._rayWarningGfx) return;
        const logic = this.config.logic;
        const clipGround = logic.rayClipGround !== false;
        const len = this._clipRayLength(this.x, this.y - 20, this._rayAngle, this._rayLength, clipGround);
        const ox = this.x;
        const oy = this.y - 20;
        const ex = ox + Math.cos(this._rayAngle) * len;
        const ey = oy + Math.sin(this._rayAngle) * len;
        const g = this._rayWarningGfx;
        const blinkOn = Math.floor(this.scene.time.now / 110) % 2 === 0;
        const outerA = blinkOn ? 0.55 : 0.12;
        const innerA = blinkOn ? 0.95 : 0.2;
        g.clear();
        g.lineStyle(10, 0xcc2200, outerA);
        g.beginPath();
        g.moveTo(ox, oy);
        g.lineTo(ex, ey);
        g.strokePath();
        g.lineStyle(5, 0xff6600, innerA);
        g.beginPath();
        g.moveTo(ox, oy);
        g.lineTo(ex, ey);
        g.strokePath();
        g.lineStyle(2, 0xffdd88, innerA * 0.85);
        g.beginPath();
        g.moveTo(ox, oy);
        g.lineTo(ex, ey);
        g.strokePath();
    }

    _clipRayLength(ox, oy, angle, maxLen, clipGround = true) {
        let len = maxLen;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const walls = this.scene.levelConfig?.walls || [];
        for (const w of walls) {
            const wallW = w.w || 32;
            const wallH = w.h || 200;
            const rect = new Phaser.Geom.Rectangle(w.x - wallW / 2, w.y - wallH / 2, wallW, wallH);
            const hit = Enemy._rayRectIntersection(ox, oy, cos, sin, len, rect);
            if (hit != null && hit < len) len = hit;
        }
        if (clipGround) {
            const solids = this.scene.groundSolids;
            if (solids?.children) {
                solids.children.iterate((block) => {
                    if (!block?.body) return;
                    const b = block.body;
                    const rect = new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
                    const hit = Enemy._rayRectIntersection(ox, oy, cos, sin, len, rect);
                    if (hit != null && hit < len) len = hit;
                });
            }
        }
        return Math.max(24, len);
    }

    static _rayRectIntersection(ox, oy, cos, sin, maxLen, rect) {
        const steps = 24;
        for (let i = 1; i <= steps; i++) {
            const t = (maxLen * i) / steps;
            const px = ox + cos * t;
            const py = oy + sin * t;
            if (Phaser.Geom.Rectangle.Contains(rect, px, py)) {
                return t;
            }
        }
        return null;
    }

    _fireRay(player) {
        const logic = this.config.logic;
        const ox = this.x;
        const oy = this.y - 20;
        const clipGround = logic.rayClipGround !== false;
        const maxLen = this._rayLength || this._getRayLength(logic);
        const len = this._clipRayLength(ox, oy, this._rayAngle, maxLen, clipGround);
        const ex = ox + Math.cos(this._rayAngle) * len;
        const ey = oy + Math.sin(this._rayAngle) * len;
        this._clearRayWarning();

        const beamKey = this.scene.textures.exists('laser_beam_red') ? 'laser_beam_red' : 'laser_beam';
        const glowW = logic.rayBeamGlowWidth || 40;
        const coreW = logic.rayBeamWidth || 26;
        const beamGlow = this.scene.add.image(ox, oy, beamKey)
            .setOrigin(0, 0.5)
            .setRotation(this._rayAngle)
            .setDisplaySize(len, glowW)
            .setBlendMode(Phaser.BlendModes.NORMAL)
            .setTint(0x660000)
            .setDepth(14)
            .setAlpha(0.75);
        const beam = this.scene.add.image(ox, oy, beamKey)
            .setOrigin(0, 0.5)
            .setRotation(this._rayAngle)
            .setDisplaySize(len, coreW)
            .setBlendMode(Phaser.BlendModes.NORMAL)
            .setTint(0xbb1100)
            .setDepth(15)
            .setAlpha(1);
        this.scene.tweens.add({
            targets: [beam, beamGlow],
            alpha: 0,
            duration: 200,
            delay: 140,
            onComplete: () => {
                beam.destroy();
                beamGlow.destroy();
            }
        });

        if (!this.scene._playerIsPhasing?.() && player?.body) {
            const half = logic.rayHalfThickness || 10;
            const line = new Phaser.Geom.Line(ox, oy, ex, ey);
            const pad = half;
            const rect = new Phaser.Geom.Rectangle(
                player.body.x - pad,
                player.body.y - pad,
                player.body.width + pad * 2,
                player.body.height + pad * 2
            );
            if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) {
                this.scene._damagePlayer(logic.rayDamage || 14, ox);
                Effects.hitFlash(this.scene, player.x, player.y - 24);
            }
        }

        this._rayPhase = null;
    }

    _clearRayWarning() {
        if (this._rayWarningGfx) {
            this._rayWarningGfx.destroy();
            this._rayWarningGfx = null;
        }
    }

    update(time, delta, player) {
        if (!this.alive) return;

        if (this.type === 'flying') {
            this._updateFlying(time, player);
        } else {
            this._updateGroundCombat(time, player);
        }

        if (this.type === 'flying') {
            this.logic.setPosition(this.x, this.anchorY);
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
        if (this.type === 'flying') {
            this.logic.setVelocity(knock * 0.35, 0);
        } else {
            this.logic.setVelocity(knock, -200);
        }
        this.view.setTint(0xffffff);
        this.scene.time.delayedCall(70, () => this.viewSprite && this.view.clearTint());
        this._syncHpBar();
        if (this.hp <= 0) {
            this.die();
            return;
        }
        Effects.playMonsterHitSfx(this.scene);
    }

    die() {
        this.alive = false;
        const deathX = this.x;
        const deathY = this.y;
        this._clearRayWarning();
        this._rayPhase = null;
        if (this.hpBarBg) { this.hpBarBg.destroy(); this.hpBarBg = null; }
        if (this.hpBarFill) { this.hpBarFill.destroy(); this.hpBarFill = null; }
        if (this.sprite) {
            this.sprite.owner = null;
        }
        Effects.playExplosionSfx(this.scene, 1);
        Effects.explosion(this.scene, deathX, deathY - 24, 0.8, false);
        this.view.destroy();
        this.logic.destroy();
        this.sprite = null;
        this.viewSprite = null;
        this.scene.onEnemyKilled && this.scene.onEnemyKilled(this);
    }
}
