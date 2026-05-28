/**
 * 关卡编辑器 — 玩家模式（创意工坊）
 */
const LevelEditorPlayerMode = (() => {
    const MEDIA_KEYS = [
        'startVideoUrl', 'endVideoUrl', 'normalBgmUrl',
        'bossBgmUrl', 'bgUrl', 'resultBgUrl'
    ];
    const IDB_NAME = 'workshop-editor';
    const IDB_STORE = 'drafts';

    function isEnabled() {
        return new URLSearchParams(location.search).get('mode') === 'player';
    }

    function stripMedia(level) {
        const out = LevelEditorSchema.normalizeLevel(level);
        MEDIA_KEYS.forEach(key => { out[key] = null; });
        return out;
    }

    function openIdb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveDraft(draftId, levelJson) {
        const db = await openIdb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put({
                draftId,
                levelJson,
                updatedAt: Date.now()
            }, draftId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    async function loadDraft(draftId) {
        const db = await openIdb();
        const draft = await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(draftId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return draft;
    }

    function getOrCreateDraftId() {
        let id = sessionStorage.getItem('editor-draft-id');
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID() : `draft_${Date.now()}`;
            sessionStorage.setItem('editor-draft-id', id);
        }
        return id;
    }

    function readTestPass() {
        const raw = sessionStorage.getItem('editor-test-pass');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function hasValidTestPass() {
        const pass = readTestPass();
        if (!pass) return false;
        const age = Date.now() - Number(pass.passedAt || 0);
        return Number.isFinite(age) && age >= 0 && age <= 30 * 60 * 1000;
    }

    function goToWorkshop() {
        sessionStorage.setItem('boot-scene', 'WorkshopScene');
        window.location.href = '/';
    }

    function setupUi(ctx) {
        document.title = '关卡编辑器 · 玩家模式';
        document.querySelector('.top-bar h1').textContent = '关卡编辑器 · 玩家模式';

        const hideIds = [
            'btn-scene-tools', 'btn-clear-scene', 'btn-new', 'btn-open',
            'btn-save', 'level-select'
        ];
        hideIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.tagName === 'LABEL') el.style.display = 'none';
            else el.hidden = true;
        });

        document.querySelectorAll('.divider').forEach((el, i, all) => {
            if (i === 0 || i === all.length - 3) el.style.display = 'none';
        });

        const tools = document.querySelector('.top-tools');
        const sceneToolsBtn = document.getElementById('btn-scene-tools');
        const exitBtn = document.createElement('button');
        exitBtn.className = 'btn danger';
        exitBtn.id = 'btn-player-exit';
        exitBtn.textContent = '退出';
        exitBtn.title = '返回创意工坊';
        exitBtn.addEventListener('click', async () => {
            if (confirm('确定退出关卡编辑器？本地草稿会保留，下次可继续编辑。')) {
                try {
                    await ctx.saveDraftLocal();
                } catch {
                    // 仍允许退出，避免卡在编辑器
                }
                goToWorkshop();
            }
        });
        tools.insertBefore(exitBtn, sceneToolsBtn);

        const userSpan = document.createElement('span');
        userSpan.id = 'player-user-label';
        userSpan.className = 'save-status';
        userSpan.textContent = '未登录';
        tools.appendChild(userSpan);

        const saveDraftBtn = document.createElement('button');
        saveDraftBtn.className = 'btn';
        saveDraftBtn.id = 'btn-save-draft';
        saveDraftBtn.textContent = '保存草稿';
        tools.insertBefore(saveDraftBtn, userSpan);

        const testBtn = document.createElement('button');
        testBtn.className = 'btn';
        testBtn.id = 'btn-test-play';
        testBtn.textContent = '试玩';
        tools.insertBefore(testBtn, userSpan);

        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'btn primary';
        uploadBtn.id = 'btn-upload-level';
        uploadBtn.textContent = '发布关卡';
        tools.insertBefore(uploadBtn, userSpan);

        saveDraftBtn.addEventListener('click', () => ctx.saveDraftLocal());
        testBtn.addEventListener('click', () => ctx.startTestPlay());
        uploadBtn.addEventListener('click', () => {
            if (!hasValidTestPass()) {
                alert('请先试玩并通关后再发布关卡。');
                return;
            }
            showUploadModal(ctx);
        });

        return {
            userSpan,
            uploadBtn,
            refreshAuth: () => refreshAuth(userSpan),
            refreshUploadState: (level) => refreshUploadState(uploadBtn, level)
        };
    }

    async function refreshAuth(userSpan) {
        try {
            const auth = await fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json());
            if (auth.loggedIn) {
                userSpan.textContent = auth.userName || '已登录';
                return auth;
            }
            userSpan.textContent = '未登录';
            return auth;
        } catch {
            userSpan.textContent = '未登录';
            return { loggedIn: false };
        }
    }

    function refreshUploadState(uploadBtn, level) {
        const ready = hasValidTestPass() && !!level;
        uploadBtn.title = ready ? '发布到创意工坊' : '请先试玩并通关后再发布';
        uploadBtn.style.opacity = ready ? '1' : '0.55';
    }

    async function hashLevel(level) {
        const payload = stripMedia(level);
        const finish = payload.finish != null && typeof payload.finish?.x === 'number';
        if (finish) delete payload.boss;
        else delete payload.finish;

        const text = JSON.stringify(payload);
        if (window.crypto && window.crypto.subtle) {
            const data = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        return text.length + '_' + text.slice(0, 32);
    }

    function hideMediaSection() {
        const form = document.getElementById('level-form');
        if (!form) return;
        form.querySelectorAll('.section-title, .field-row').forEach(el => {
            const title = el.classList?.contains('section-title') ? el.textContent : null;
            if (title === '媒体资源') {
                el.dataset.hideMedia = '1';
            }
        });
        let hide = false;
        form.querySelectorAll('.section-title, .field-row').forEach(el => {
            if (el.classList.contains('section-title') && el.textContent === '媒体资源') hide = true;
            else if (el.classList.contains('section-title')) hide = false;
            if (hide) el.style.display = 'none';
        });
        const idRow = form.querySelector('input[data-key="id"]');
        if (idRow) idRow.closest('.field-row').style.display = 'none';
    }

    async function loadTemplate() {
        const res = await fetch('../../assets/levels/level_1.json');
        if (!res.ok) throw new Error('无法加载第一关模板');
        const raw = await res.json();
        return stripMedia(raw);
    }

    function showUploadModal(ctx) {
        let modal = document.getElementById('upload-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'upload-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-panel" role="dialog">
                    <div class="modal-header">
                        <h2>发布关卡</h2>
                        <button type="button" class="btn modal-close" id="upload-modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="field-row">
                            <label for="upload-title">关卡名称</label>
                            <input id="upload-title" type="text" maxlength="40" placeholder="给关卡起个名字">
                        </div>
                        <div class="field-row">
                            <label for="upload-desc">关卡描述</label>
                            <input id="upload-desc" type="text" maxlength="120" placeholder="可选">
                        </div>
                        <p id="upload-status" class="field-hint"></p>
                        <button type="button" class="btn primary" id="upload-submit">确认发布</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelector('#upload-modal-close').addEventListener('click', () => { modal.hidden = true; });
            modal.addEventListener('click', e => {
                if (e.target === modal) modal.hidden = true;
            });
        }

        modal.hidden = false;
        const titleInput = modal.querySelector('#upload-title');
        const descInput = modal.querySelector('#upload-desc');
        const statusEl = modal.querySelector('#upload-status');
        titleInput.value = ctx.getLevel()?.title || '';
        descInput.value = '';
        statusEl.textContent = '';

        const submitBtn = modal.querySelector('#upload-submit');
        const onSubmit = async () => {
            if (!hasValidTestPass()) {
                alert('请先试玩并通关后再发布关卡。');
                return;
            }

            submitBtn.disabled = true;
            statusEl.textContent = '发布中…';
            try {
                const pass = readTestPass();
                const levelData = ctx.getLevel();
                const levelHash = await hashLevel(levelData);
                const res = await fetch('/api/levels', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: titleInput.value.trim(),
                        description: descInput.value.trim(),
                        levelData,
                        testPass: { levelHash, passedAt: pass?.passedAt || Date.now() }
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '发布失败');
                statusEl.textContent = '发布成功！';
                sessionStorage.removeItem('editor-test-pass');
                setTimeout(() => {
                    modal.hidden = true;
                    if (confirm('关卡已发布到创意工坊，是否前往创意工坊？')) {
                        goToWorkshop();
                    }
                }, 500);
            } catch (err) {
                statusEl.textContent = err.message || String(err);
            } finally {
                submitBtn.disabled = false;
            }
        };

        submitBtn.onclick = onSubmit;
    }

    return {
        isEnabled,
        stripMedia,
        saveDraft,
        loadDraft,
        getOrCreateDraftId,
        readTestPass,
        setupUi,
        hideMediaSection,
        loadTemplate,
        hashLevel,
        refreshUploadState
    };
})();
