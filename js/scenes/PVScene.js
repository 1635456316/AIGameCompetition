/**
 * 通用 PV 播放场景：通过 scene.start('PVScene', { videoUrl, nextScene, title, pvId }) 启动。
 *
 * pvId：用于跟踪该 PV 是否已看过。首次观看不可跳过，再次观看右上角出现"跳过"按钮。
 *
 * 注意：不用 Phaser 的 Video GameObject，改用 DOM <video> 覆盖在 canvas 上。
 * 这样可以避免部分浏览器/显卡/视频编码组合出现"有声音但画面黑"的问题。
 */
class PVScene extends Phaser.Scene {
    constructor() {
        super('PVScene');
    }

    init(data) {
        this.params = data || {};
    }

    create() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const { videoUrl, title, pvId } = this.params;

        this.cameras.main.setBackgroundColor('#000');
        this._finished = false;
        this.volume = 0.8;
        this._pvId = pvId || null;
        this._skippable = pvId ? SaveSystem.hasPVWatched(pvId) : true;

        this.domVideo = this._createDomVideo(videoUrl);
        document.body.appendChild(this.domVideo);
        this.domOverlay = this._createDomOverlay(title);
        document.body.appendChild(this.domOverlay);
        this._fitDomVideo();
        window.addEventListener('resize', this._boundResize = () => this._fitDomVideo());

        const playPromise = this.domVideo.play();
        if (playPromise && playPromise.catch) {
            playPromise.catch(() => {
                this.domVideo.muted = true;
                this.domVideo.play().catch(() => {});
            });
        }

        const finish = () => this._finish();

        if (this._skippable) {
            this.input.keyboard.once('keydown-SPACE', finish);
            this.input.keyboard.once('keydown-ENTER', finish);
            this.input.keyboard.once('keydown-ESC', finish);
            this._createSkipButton(finish);
        }

        this.domVideo.addEventListener('ended', finish, { once: true });

        // 音量
        this.input.keyboard.on('keydown-UP',   () => this._setVolume(this.volume + 0.1));
        this.input.keyboard.on('keydown-DOWN', () => this._setVolume(this.volume - 0.1));

        // 安全网：超过 60s 仍未结束（视频损坏等）则强制跳转
        this.time.delayedCall(60000, () => this._finish());
    }

    _createDomVideo(src) {
        const video = document.createElement('video');
        video.src = src;
        video.preload = 'auto';
        video.playsInline = true;
        video.controls = false;
        video.loop = false;
        video.muted = false;
        video.volume = this.volume;
        video.style.position = 'fixed';
        video.style.left = '50%';
        video.style.top = '50%';
        video.style.transform = 'translate(-50%, -50%)';
        video.style.background = '#000';
        video.style.zIndex = '10000';
        video.style.pointerEvents = 'none';
        return video;
    }

    _createDomOverlay(title) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.zIndex = '10001';
        overlay.style.pointerEvents = 'none';
        overlay.style.fontFamily = 'Arial, Microsoft YaHei, sans-serif';
        overlay.style.color = '#aaa';

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.textContent = title;
            titleEl.style.position = 'absolute';
            titleEl.style.top = '28px';
            titleEl.style.left = '50%';
            titleEl.style.transform = 'translateX(-50%)';
            titleEl.style.fontSize = '22px';
            titleEl.style.fontWeight = '900';
            titleEl.style.color = '#ffd400';
            titleEl.style.textShadow = '0 0 8px #000, 0 0 12px #ff2b2b';
            overlay.appendChild(titleEl);
        }

        const hint = document.createElement('div');
        if (this._skippable) {
            hint.textContent = '空格 / 回车 / ESC：跳过    ↑↓：音量';
        } else {
            hint.textContent = '↑↓：音量';
        }
        hint.style.position = 'absolute';
        hint.style.right = '22px';
        hint.style.bottom = '18px';
        hint.style.fontSize = '14px';
        hint.style.fontWeight = '700';
        hint.style.textShadow = '0 0 6px #000';
        overlay.appendChild(hint);

        this.domVolText = document.createElement('div');
        this.domVolText.textContent = this._volLabel();
        this.domVolText.style.position = 'absolute';
        this.domVolText.style.left = '22px';
        this.domVolText.style.bottom = '18px';
        this.domVolText.style.fontSize = '14px';
        this.domVolText.style.fontWeight = '700';
        this.domVolText.style.textShadow = '0 0 6px #000';
        overlay.appendChild(this.domVolText);

        // 扫描线
        const scan = document.createElement('div');
        scan.style.position = 'absolute';
        scan.style.left = '0';
        scan.style.top = '0';
        scan.style.width = '100%';
        scan.style.height = '100%';
        scan.style.background = 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 2px, transparent 2px, transparent 4px)';
        overlay.appendChild(scan);

        return overlay;
    }

    _createSkipButton(callback) {
        const btn = document.createElement('button');
        btn.textContent = '跳过 ▸▸';
        btn.style.position = 'fixed';
        btn.style.top = '24px';
        btn.style.right = '28px';
        btn.style.zIndex = '10002';
        btn.style.padding = '10px 28px';
        btn.style.fontSize = '18px';
        btn.style.fontWeight = '900';
        btn.style.fontFamily = 'Arial, Microsoft YaHei, sans-serif';
        btn.style.color = '#fff';
        btn.style.background = 'rgba(0, 0, 0, 0.6)';
        btn.style.border = '2px solid rgba(255, 212, 0, 0.7)';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
        btn.style.transition = 'background 0.15s, border-color 0.15s';
        btn.onmouseenter = () => {
            btn.style.background = 'rgba(255, 212, 0, 0.25)';
            btn.style.borderColor = '#ffd400';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'rgba(0, 0, 0, 0.6)';
            btn.style.borderColor = 'rgba(255, 212, 0, 0.7)';
        };
        btn.onclick = callback;
        this._skipBtn = btn;
        document.body.appendChild(btn);
    }

    _fitDomVideo() {
        if (!this.domVideo) return;
        const vw = this.domVideo.videoWidth || 1280;
        const vh = this.domVideo.videoHeight || 720;
        const sw = window.innerWidth;
        const sh = window.innerHeight;
        const scale = Math.min(sw / vw, sh / vh);
        this.domVideo.style.width = `${vw * scale}px`;
        this.domVideo.style.height = `${vh * scale}px`;
    }

    _setVolume(v) {
        this.volume = Phaser.Math.Clamp(v, 0, 1);
        if (this.domVideo) {
            this.domVideo.muted = this.volume <= 0;
            this.domVideo.volume = this.volume;
        }
        if (this.domVolText) this.domVolText.textContent = this._volLabel();
    }

    _volLabel() {
        const blocks = Math.round(this.volume * 10);
        return '音量 ' + '■'.repeat(blocks) + '□'.repeat(10 - blocks);
    }

    _finish() {
        if (this._finished) return;
        this._finished = true;
        if (this._boundResize) {
            window.removeEventListener('resize', this._boundResize);
            this._boundResize = null;
        }
        if (this.domVideo) {
            try { this.domVideo.pause(); } catch (e) {}
            this.domVideo.remove();
            this.domVideo = null;
        }
        if (this.domOverlay) {
            this.domOverlay.remove();
            this.domOverlay = null;
            this.domVolText = null;
        }
        if (this._skipBtn) {
            this._skipBtn.remove();
            this._skipBtn = null;
        }
        const { nextScene, nextSceneData, markIntroWatched } = this.params;
        if (markIntroWatched && typeof SaveSystem !== 'undefined') {
            SaveSystem.markIntroWatched();
        }
        if (this._pvId && typeof SaveSystem !== 'undefined') {
            SaveSystem.markPVWatched(this._pvId);
        }
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(nextScene, nextSceneData || {});
        });
    }
}
