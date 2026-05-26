/**
 * 全局 Debug 开关。URL ?debug=1 或游戏中按 F9 切换碰撞盒显示。
 */
const GameDebug = {
    showHitboxes: false,
    toggleKey: 'F9',

    initFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('debug') === '1' || params.get('hitbox') === '1') {
                this.showHitboxes = true;
            }
        } catch (e) {}
    },

    toggleHitboxes() {
        this.showHitboxes = !this.showHitboxes;
        return this.showHitboxes;
    }
};

GameDebug.initFromUrl();
