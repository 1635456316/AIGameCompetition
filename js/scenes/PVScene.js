/**
 * 通用 PV 播放场景：通过 scene.start('PVScene', { videoUrl, nextScene, title, pvId }) 启动。
 *
 * pvId：用于在 SaveSystem 中标记该 PV 已观看过。
 * holdOnEnd：播放自然结束后停留在最后一帧；continueButtonText 按钮从一开始显示，点击后跳转。
 * 跳过：普通 PV 从一开始显示跳过按钮，同时空格 / 回车 / ESC 生效。
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
        PVScene.cleanupDomArtifacts();
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const { videoUrl, title, pvId } = this.params;

        this.cameras.main.setBackgroundColor('#000');
        // 注意：Phaser Scene 实例跨 scene.start() 复用，必须在 create() 里把所有
        // 流程标记位 / DOM 引用复位，否则二次进入时会被上一次残留的状态阻断。
        // 之前漏掉 _waitingForContinue 导致"重玩同一关 PV 时 _showContinueButton
        // 直接 return，开始战斗按钮不显示"的 bug。
        this._finished = false;
        this._waitingForContinue = false;
        this._skipBtn = null;
        this._continueBtn = null;
        this.volume = SaveSystem.getVolume();
        this._pvId = pvId || null;

        this.domVideo = this._createDomVideo(videoUrl);
        document.body.appendChild(this.domVideo);
        this.domOverlay = this._createDomOverlay(title);
        document.body.appendChild(this.domOverlay);
        this._fitDomVideo();
        window.addEventListener('resize', this._boundResize = () => this._fitDomVideo());

        const finish = () => this._finish();
        const handleEnded = () => {
            if (this.params.holdOnEnd) {
                this._showContinueButton();
            } else {
                finish();
            }
        };

        if (this.params.holdOnEnd) {
            this._showContinueButton();
        } else {
            this._createSkipButton(finish);
            this.input.keyboard.once('keydown-SPACE', finish);
            this.input.keyboard.once('keydown-ENTER', finish);
            this.input.keyboard.once('keydown-ESC', finish);
            if (this.domHint) {
                this.domHint.textContent = '空格 / 回车 / ESC：跳过    ↑↓：音量';
            }
        }

        this.domVideo.addEventListener('ended', handleEnded, { once: true });

        // 音量
        this.input.keyboard.on('keydown-UP',   () => this._setVolume(this.volume + 0.1));
        this.input.keyboard.on('keydown-DOWN', () => this._setVolume(this.volume - 0.1));

        const playPromise = this.domVideo.play();
        if (playPromise && playPromise.catch) {
            playPromise.catch(() => {
                this.domVideo.muted = true;
                this.domVideo.play().catch(() => {});
            });
        }
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
        hint.textContent = '↑↓：音量';
        hint.style.position = 'absolute';
        hint.style.right = '22px';
        hint.style.bottom = '18px';
        hint.style.fontSize = '14px';
        hint.style.fontWeight = '700';
        hint.style.textShadow = '0 0 6px #000';
        overlay.appendChild(hint);
        this.domHint = hint;

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
        btn.textContent = '跳过 ▸';
        btn.style.position = 'fixed';
        btn.style.top = '18px';
        btn.style.right = '20px';
        btn.style.zIndex = '10002';
        btn.style.padding = '4px 12px';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = '700';
        btn.style.fontFamily = 'Arial, Microsoft YaHei, sans-serif';
        btn.style.color = 'rgba(255, 255, 255, 0.85)';
        btn.style.background = 'rgba(0, 0, 0, 0.35)';
        btn.style.border = '1px solid rgba(255, 212, 0, 0.45)';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.letterSpacing = '1px';
        btn.style.opacity = '0.7';
        btn.style.pointerEvents = 'auto';
        btn.style.transition = 'opacity 0.35s ease-out, background 0.15s, border-color 0.15s, color 0.15s';
        btn.onmouseenter = () => {
            btn.style.background = 'rgba(255, 212, 0, 0.2)';
            btn.style.borderColor = '#ffd400';
            btn.style.color = '#fff';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'rgba(0, 0, 0, 0.35)';
            btn.style.borderColor = 'rgba(255, 212, 0, 0.45)';
            btn.style.color = 'rgba(255, 255, 255, 0.85)';
        };
        btn.onclick = () => {
            callback();
        };
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
        SaveSystem.setVolume(this.volume);
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

    _showContinueButton() {
        if (this._finished || this._waitingForContinue) return;
        this._waitingForContinue = true;
        if (this._skipBtn) {
            this._skipBtn.style.opacity = '0';
            this._skipBtn.style.pointerEvents = 'none';
        }
        if (this.domHint) {
            this.domHint.textContent = '点击按钮进入关卡    Enter / 空格：开始';
        }

        const btn = document.createElement('button');
        btn.textContent = this.params.continueButtonText || '开始战斗!';
        btn.style.position = 'fixed';
        btn.style.left = '50%';
        btn.style.bottom = '82px';
        btn.style.transform = 'translateX(-50%)';
        btn.style.zIndex = '10003';
        btn.style.padding = '14px 42px';
        btn.style.fontSize = '28px';
        btn.style.fontWeight = '900';
        btn.style.fontFamily = 'Arial, Microsoft YaHei, sans-serif';
        btn.style.color = '#ffffff';
        btn.style.background = '#d71920';
        btn.style.border = '3px solid #ffffff';
        btn.style.borderRadius = '10px';
        btn.style.cursor = 'pointer';
        btn.style.letterSpacing = '2px';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.textAlign = 'center';
        btn.style.lineHeight = '1';
        btn.style.boxShadow = '0 0 18px rgba(215, 25, 32, 0.9), 0 0 34px rgba(255, 78, 46, 0.65)';
        btn.style.textShadow = '0 2px 4px rgba(0, 0, 0, 0.55)';
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        btn.style.transition = 'opacity 0.24s ease-out, transform 0.14s ease-out, background 0.14s ease-out';
        btn.onmouseenter = () => {
            btn.style.background = '#ff2b2b';
            btn.style.transform = 'translateX(-50%) scale(1.05)';
        };
        btn.onmouseleave = () => {
            btn.style.background = '#d71920';
            btn.style.transform = 'translateX(-50%) scale(1)';
        };
        btn.onclick = () => this._finish();
        this._continueBtn = btn;
        document.body.appendChild(btn);

        this.input.keyboard.once('keydown-SPACE', () => this._finish());
        this.input.keyboard.once('keydown-ENTER', () => this._finish());
    }

    /** 防止 PV 的 DOM 按钮残留在 canvas 上方挡住游戏内鼠标点击 */
    static cleanupDomArtifacts() {
        document.querySelectorAll('body > button').forEach((btn) => {
            const z = parseInt(btn.style.zIndex, 10);
            if (z >= 10002) btn.remove();
        });
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
            this.domHint = null;
        }
        if (this._skipBtn) {
            this._skipBtn.remove();
            this._skipBtn = null;
        }
        if (this._continueBtn) {
            this._continueBtn.remove();
            this._continueBtn = null;
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
