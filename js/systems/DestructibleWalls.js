/**
 * 可破坏竖墙：受玩家攻击后扣耐久，归零后移除碰撞。
 */
class DestructibleWalls {
    static spawn(scene, levelConfig) {
        return (levelConfig.destructibleWalls || [])
            .map(cfg => new DestructibleWall(scene, cfg))
            .filter(w => !w.broken);
    }
}

class DestructibleWall {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 32;
        this.h = cfg.h || 200;
        this.maxHp = Math.max(1, cfg.hp ?? 3);
        this.hp = this.maxHp;
        this.broken = false;

        this.sprite = scene.groundSolids.create(this.x, this.y, 'tile_destructible');
        this.sprite.setOrigin(0.5, 0.5);
        this.sprite.setDisplaySize(this.w, this.h);
        this.sprite.clearTint();
        this.sprite.refreshBody();
        this.sprite.setData('isDestructibleWall', true);
        this.sprite.setData('isWall', true);
        this.sprite.setData('destructibleOwner', this);
        this._crackSeed = Math.abs(Math.floor(this.x * 7 + this.y * 13)) % 10000;
        this.crackGfx = scene.add.graphics().setDepth(1);
        this._syncVisuals();
    }

    getCollisionRect() {
        if (this.broken) return null;
        return {
            x: this.x,
            y: this.y,
            w: this.w,
            h: this.h
        };
    }

    _syncVisuals() {
        this._syncTint();
        this._syncCracks();
    }

    _syncTint() {
        if (!this.sprite || this.broken) return;
        const ratio = this.hp / this.maxHp;
        if (ratio > 0.66) this.sprite.clearTint();
        else if (ratio > 0.33) this.sprite.setTint(0xffe0b8);
        else this.sprite.setTint(0xffc878);
    }

    _syncCracks() {
        if (!this.crackGfx || this.broken) return;
        const ratio = this.hp / this.maxHp;
        const damage = 1 - ratio;
        this.crackGfx.clear();
        if (damage <= 0.001) return;
        this.crackGfx.setPosition(this.x - this.w / 2, this.y - this.h / 2);
        TextureFactory.drawWallCracks(
            this.crackGfx,
            this.w,
            this.h,
            this._crackSeed + Math.round(damage * 100),
            0.25 + damage * 0.75
        );
    }

    takeHit(damage = 1) {
        if (this.broken || !this.sprite?.active) return;
        this.hp = Math.max(0, this.hp - damage);
        this._syncVisuals();
        Effects.hitFlash(this.scene, this.x, this.y);
        if (this.hp <= 0) {
            this.breakApart();
            return;
        }
        Effects.playMonsterHitSfx(this.scene);
    }

    breakApart() {
        if (this.broken) return;
        this.broken = true;
        Effects.explosion(this.scene, this.x, this.y, 0.65);
        Effects.shake(this.scene, 60, 0.005);
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
        if (this.crackGfx) {
            this.crackGfx.destroy();
            this.crackGfx = null;
        }
    }

    /** 与普攻第三段冲刺判定矩形相交时扣血 */
    hitByRect(hitRect, damage = 1) {
        if (this.broken) return false;
        const r = this.getCollisionRect();
        if (!r) return false;
        const wallRect = new Phaser.Geom.Rectangle(
            r.x - r.w / 2,
            r.y - r.h / 2,
            r.w,
            r.h
        );
        if (!Phaser.Geom.Intersects.RectangleToRectangle(hitRect, wallRect)) return false;
        this.takeHit(damage);
        return true;
    }
}
