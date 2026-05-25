/* === 视频生成序列帧 - 主逻辑 ===
 * 纯前端，零依赖，全部在浏览器内本地处理，不上传任何数据。
 */
(function () {
    'use strict';

    // ---------- DOM 引用 ----------
    const $ = (id) => document.getElementById(id);
    const fileInput = $('file-input');
    const fileNameEl = $('file-name');
    const dropZone = $('drop-zone');
    const video = $('video');
    const timelineSection = $('timeline-section');
    const marksSection = $('marks-section');
    const exportSection = $('export-section');
    const seekBar = $('seek-bar');
    const timeCurrentEl = $('time-current');
    const timeTotalEl = $('time-total');
    const btnPlay = $('btn-play');
    const btnPrev = $('btn-prev-frame');
    const btnNext = $('btn-next-frame');
    const btnMark = $('btn-mark');
    const btnClearMarks = $('btn-clear-marks');
    const fpsInput = $('fps-input');
    const markCountEl = $('mark-count');
    const marksList = $('marks-list');
    const seekMarksEl = $('seek-marks');
    const bulkCountInput = $('bulk-count');
    const btnBulkMark = $('btn-bulk-mark');
    const bulkStatusEl = $('bulk-status');

    // 动画预览
    const animCanvas = $('anim-canvas');
    const animEmpty = $('anim-empty');
    const btnAnimPlay = $('btn-anim-play');
    const btnAnimStop = $('btn-anim-stop');
    const animIntervalInput = $('anim-interval');
    const animFpsInput = $('anim-fps');
    const animLoopInput = $('anim-loop');
    const animPingPongInput = $('anim-pingpong');
    const animStatusEl = $('anim-status');

    // 背景抠图
    const chromaSection = $('chroma-section');
    const cfgChromaEnable = $('cfg-chroma-enable');
    const cfgChromaColor = $('cfg-chroma-color');
    const btnPickColor = $('btn-pick-color');
    const cfgChromaTol = $('cfg-chroma-tol');
    const cfgChromaTolVal = $('cfg-chroma-tol-val');
    const cfgChromaFeather = $('cfg-chroma-feather');
    const cfgChromaFeatherVal = $('cfg-chroma-feather-val');
    const cfgChromaSpill = $('cfg-chroma-spill');
    const cfgChromaFlood = $('cfg-chroma-flood');
    const chromaPickHint = $('chroma-pick-hint');

    const cfgColumns = $('cfg-columns');
    const cfgUseOrigin = $('cfg-use-origin');
    const cfgWidth = $('cfg-width');
    const cfgHeight = $('cfg-height');
    const cfgFit = $('cfg-fit');
    const cfgPadding = $('cfg-padding');
    const cfgTransparent = $('cfg-transparent');
    const cfgBgColor = $('cfg-bg-color');
    const btnGenerate = $('btn-generate');
    const btnExport = $('btn-export');
    const exportProgress = $('export-progress');
    const progressFill = $('progress-fill');
    const progressText = $('progress-text');
    const previewCanvas = $('preview-canvas');
    const previewMeta = $('preview-meta');

    // ---------- 状态 ----------
    const state = {
        videoFile: null,
        videoURL: null,
        marks: [],            // [{ id, time, snapshot:Canvas }]
        nextId: 1,
        lastPreview: null,    // { sheet, meta }
        isBusy: false,
    };

    // 快照尺寸上限：在画质与内存之间取平衡。
    // 标记时直接从主视频抓全分辨率（但不超过下面这个上限，避免 4K/8K 视频炸内存）。
    // 后续的导出、动画预览、抠图都基于这个快照，所以这个值同时决定了导出画质的上限。
    const SNAPSHOT_MAX_W = 1920;
    const SNAPSHOT_MAX_H = 1080;

    // 抠图缓存版本号：参数任意变化时 +1，触发各 mark 重新计算
    let chromaVersion = 0;

    // ---------- 工具函数 ----------
    function formatTime(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        const ms = Math.floor((sec - Math.floor(sec)) * 1000);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }

    function safeFileName(s) {
        return (s || 'video').replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
    }

    function getFps() {
        const v = parseFloat(fpsInput.value);
        return (isFinite(v) && v > 0) ? v : 30;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // 等待视频 seek 完成 + 解码下一帧（rVFC 优先）
    function awaitFrameReady() {
        return new Promise((resolve) => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                if (typeof video.requestVideoFrameCallback === 'function') {
                    video.requestVideoFrameCallback(() => resolve());
                } else {
                    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                }
            };
            video.addEventListener('seeked', onSeeked, { once: true });
        });
    }

    async function seekTo(time) {
        const dur = video.duration || 0;
        const t = Math.max(0, Math.min(time, Math.max(0, dur - 0.001)));
        if (Math.abs(video.currentTime - t) < 1e-6) {
            video.currentTime = t + 0.0001;
        }
        const p = awaitFrameReady();
        video.currentTime = t;
        await p;
    }

    // 把当前主视频画面截到一张快照 Canvas（用于缩略图与动画预览）
    function captureSnapshotFromVideo() {
        const vw = video.videoWidth || 0;
        const vh = video.videoHeight || 0;
        if (!vw || !vh) return null;
        const scale = Math.min(SNAPSHOT_MAX_W / vw, SNAPSHOT_MAX_H / vh, 1);
        const w = Math.max(1, Math.round(vw * scale));
        const h = Math.max(1, Math.round(vh * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);
        return c;
    }

    // 把快照 contain 绘制到目标 canvas（透明清空，让 CSS 棋盘格底显示）
    function drawSnapshotContain(targetCanvas, snapshot) {
        const ctx = targetCanvas.getContext('2d');
        const cw = targetCanvas.width;
        const ch = targetCanvas.height;
        ctx.clearRect(0, 0, cw, ch);
        if (!snapshot) return;
        const sw = snapshot.width;
        const sh = snapshot.height;
        const scale = Math.min(cw / sw, ch / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(snapshot, dx, dy, dw, dh);
    }

    // ---------- 背景抠图 (Chroma Key) ----------
    function hexToRgb(hex) {
        const m = /^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex || '');
        if (!m) return [255, 255, 255];
        return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    }
    function rgbToHex(r, g, b) {
        const h = (v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0');
        return '#' + h(r) + h(g) + h(b);
    }

    function getChromaParams() {
        if (!cfgChromaEnable.checked) return null;
        return {
            rgb: hexToRgb(cfgChromaColor.value),
            tolerance: Math.max(0, parseInt(cfgChromaTol.value, 10) || 0),
            feather: Math.max(0, parseInt(cfgChromaFeather.value, 10) || 0),
            spill: cfgChromaSpill.checked,
            flood: cfgChromaFlood.checked,
        };
    }

    // 对一个 canvas 原地应用 chroma key
    function applyChromaKey(canvas, params) {
        if (!params) return;
        if (params.flood) return applyChromaKeyFlood(canvas, params);

        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        if (w <= 0 || h <= 0) return;
        const img = ctx.getImageData(0, 0, w, h);
        const data = img.data;
        const [r0, g0, b0] = params.rgb;
        const tol = params.tolerance;
        const fea = params.feather;
        const spill = params.spill;
        const tolSq = tol * tol;
        const upper = tol + fea;
        const upperSq = upper * upper;
        const spillRangeSq = upperSq * 4;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const dr = r - r0, dg = g - g0, db = b - b0;
            const dSq = dr * dr + dg * dg + db * db;
            if (dSq <= tolSq) {
                data[i + 3] = 0;
            } else if (fea > 0 && dSq < upperSq) {
                const d = Math.sqrt(dSq);
                const t = (d - tol) / fea;
                data[i + 3] = Math.round(data[i + 3] * t);
                if (spill) {
                    data[i]     = Math.round(r0 + (r - r0) * (0.5 + 0.5 * t));
                    data[i + 1] = Math.round(g0 + (g - g0) * (0.5 + 0.5 * t));
                    data[i + 2] = Math.round(b0 + (b - b0) * (0.5 + 0.5 * t));
                }
            } else if (spill && dSq < spillRangeSq) {
                const avg = (r + g + b) / 3;
                data[i]     = Math.round(r * 0.85 + avg * 0.15);
                data[i + 1] = Math.round(g * 0.85 + avg * 0.15);
                data[i + 2] = Math.round(b * 0.85 + avg * 0.15);
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    // 从画布边缘开始 BFS 泛洪填充，只抠"和边缘连通"的同色像素
    // 角色内部的同色像素（眼睛白、高光白）因为被非同色像素包围，会被完整保留
    function applyChromaKeyFlood(canvas, params) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        if (w <= 0 || h <= 0) return;
        const img = ctx.getImageData(0, 0, w, h);
        const data = img.data;
        const [r0, g0, b0] = params.rgb;
        const tol = params.tolerance;
        const fea = params.feather;
        const spill = params.spill;
        const tolSq = tol * tol;
        const upper = tol + fea;
        const upperSq = upper * upper;

        const n = w * h;
        const visited = new Uint8Array(n);
        // 用 Int32Array 当 stack，容量 n（每像素最多入栈一次）
        const stack = new Int32Array(n);
        let top = 0;

        const tryPush = (p) => {
            if (visited[p] === 0) {
                visited[p] = 1;
                stack[top++] = p;
            }
        };

        // 把四条边缘像素都种进 stack
        for (let x = 0; x < w; x++) {
            tryPush(x);
            tryPush((h - 1) * w + x);
        }
        for (let y = 1; y < h - 1; y++) {
            tryPush(y * w);
            tryPush(y * w + (w - 1));
        }

        while (top > 0) {
            const p = stack[--top];
            const i = p * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const dr = r - r0, dg = g - g0, db = b - b0;
            const dSq = dr * dr + dg * dg + db * db;
            // 超出 (tol + feather) 范围：当前像素不算"背景"，作为壁不再扩散
            if (dSq > upperSq) continue;

            if (dSq <= tolSq) {
                data[i + 3] = 0;
            } else {
                // 在容差和容差+羽化之间：alpha 线性衰减
                const d = Math.sqrt(dSq);
                const t = (d - tol) / fea;
                data[i + 3] = Math.round(data[i + 3] * t);
                if (spill) {
                    data[i]     = Math.round(r0 + (r - r0) * (0.5 + 0.5 * t));
                    data[i + 1] = Math.round(g0 + (g - g0) * (0.5 + 0.5 * t));
                    data[i + 2] = Math.round(b0 + (b - b0) * (0.5 + 0.5 * t));
                }
            }

            // 向 4 邻居扩散
            const x = p % w;
            if (x > 0) tryPush(p - 1);
            if (x < w - 1) tryPush(p + 1);
            if (p >= w) tryPush(p - w);
            if (p < n - w) tryPush(p + w);
        }

        ctx.putImageData(img, 0, 0);
    }

    // 取得用于显示的快照（启用抠图时返回 per-mark 缓存的抠图版本）
    function getDisplaySnapshot(mark) {
        if (!mark || !mark.snapshot) return null;
        const params = getChromaParams();
        if (!params) return mark.snapshot;
        if (mark._keyedVersion === chromaVersion && mark._keyed) return mark._keyed;
        const src = mark.snapshot;
        const c = document.createElement('canvas');
        c.width = src.width;
        c.height = src.height;
        c.getContext('2d').drawImage(src, 0, 0);
        applyChromaKey(c, params);
        mark._keyed = c;
        mark._keyedVersion = chromaVersion;
        return c;
    }

    // 重新绘制所有依赖快照的视觉元素
    function refreshSnapshotVisuals() {
        document.querySelectorAll('.mark-item').forEach((item, idx) => {
            const mark = state.marks[idx];
            const canvas = item.querySelector('canvas');
            if (canvas && mark) drawSnapshotContain(canvas, getDisplaySnapshot(mark));
        });
        if (state.marks.length > 0 && animTimerId === null) {
            drawAnimFrame(animPlaybackIndex);
        }
    }

    function onChromaParamChanged() {
        chromaVersion++;
        cfgChromaTolVal.textContent = cfgChromaTol.value;
        cfgChromaFeatherVal.textContent = cfgChromaFeather.value;
        refreshSnapshotVisuals();
    }

    // ---------- 视频加载 ----------
    function loadVideoFile(file) {
        if (!file || !file.type.startsWith('video/')) {
            alert('请选择视频文件。');
            return;
        }
        stopAnimPlayback();
        if (state.videoURL) URL.revokeObjectURL(state.videoURL);
        state.videoFile = file;
        state.videoURL = URL.createObjectURL(file);
        state.marks = [];
        state.lastPreview = null;
        state.nextId = 1;
        renderMarks();
        btnExport.disabled = true;
        previewCanvas.width = 0;
        previewCanvas.height = 0;
        previewMeta.textContent = '';

        fileNameEl.textContent = file.name;
        video.src = state.videoURL;
        video.load();
    }

    video.addEventListener('loadedmetadata', () => {
        dropZone.classList.add('has-video');
        timelineSection.hidden = false;
        marksSection.hidden = false;
        chromaSection.hidden = false;
        exportSection.hidden = false;
        seekBar.max = String(video.duration || 0);
        seekBar.value = '0';
        timeTotalEl.textContent = formatTime(video.duration || 0);
        timeCurrentEl.textContent = formatTime(0);
        resizeAnimCanvasToVideo();
        renderSeekMarks();
    });

    video.addEventListener('timeupdate', () => {
        if (!seekBarSeeking) {
            seekBar.value = String(video.currentTime);
            timeCurrentEl.textContent = formatTime(video.currentTime);
        }
    });

    video.addEventListener('play', () => { btnPlay.textContent = '暂停'; });
    video.addEventListener('pause', () => { btnPlay.textContent = '播放'; });
    video.addEventListener('ended', () => { btnPlay.textContent = '播放'; });

    fileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) loadVideoFile(f);
    });

    ['dragenter', 'dragover'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });
    });
    ['dragleave', 'drop'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });
    });
    dropZone.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadVideoFile(f);
    });

    // ---------- 控制按钮 ----------
    btnPlay.addEventListener('click', () => {
        if (!video.src) return;
        if (video.paused) video.play(); else video.pause();
    });

    btnPrev.addEventListener('click', async () => {
        if (!video.src) return;
        video.pause();
        const step = 1 / getFps();
        await seekTo(video.currentTime - step);
    });
    btnNext.addEventListener('click', async () => {
        if (!video.src) return;
        video.pause();
        const step = 1 / getFps();
        await seekTo(video.currentTime + step);
    });

    let seekBarSeeking = false;
    seekBar.addEventListener('input', () => {
        if (!video.src) return;
        seekBarSeeking = true;
        const t = parseFloat(seekBar.value);
        timeCurrentEl.textContent = formatTime(t);
        video.currentTime = t;
    });
    seekBar.addEventListener('change', () => { seekBarSeeking = false; });
    video.addEventListener('seeked', () => { seekBarSeeking = false; });

    // ---------- 标记 ----------
    function markCurrentFrame() {
        if (!video.src) return;
        if (!video.videoWidth) return; // metadata 未就绪
        const t = video.currentTime;
        const tol = 0.001;
        if (state.marks.some(m => Math.abs(m.time - t) < tol)) return;
        const snapshot = captureSnapshotFromVideo();
        state.marks.push({ id: state.nextId++, time: t, snapshot });
        state.marks.sort((a, b) => a.time - b.time);
        onMarksChanged();
    }

    function removeMark(id) {
        state.marks = state.marks.filter(m => m.id !== id);
        onMarksChanged();
    }

    function clearMarks() {
        if (state.marks.length === 0) return;
        if (!confirm(`确认清空所有 ${state.marks.length} 个标记？`)) return;
        state.marks = [];
        onMarksChanged();
    }

    function onMarksChanged() {
        renderMarks();
        renderSeekMarks();
        // 标记变化时停止动画并刷新预览状态
        stopAnimPlayback();
        updateAnimAvailability();
        if (state.marks.length > 0) {
            // 用第一帧填充预览画布作为静态预览
            animPlaybackIndex = 0;
            drawAnimFrame(0);
        } else {
            clearAnimCanvas();
        }
    }

    // 渲染进度条上的标记 tick
    function renderSeekMarks() {
        if (!seekMarksEl) return;
        seekMarksEl.innerHTML = '';
        const dur = video.duration || 0;
        if (!dur) return;
        state.marks.forEach((mark, idx) => {
            const tick = document.createElement('div');
            tick.className = 'seek-tick';
            tick.style.left = (mark.time / dur * 100) + '%';
            tick.title = `第 ${idx + 1} 帧 · ${formatTime(mark.time)}（点击跳转 + 预览）`;
            tick.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (state.isBusy) return;
                jumpToMark(idx);
            });
            seekMarksEl.appendChild(tick);
        });
    }

    // 跳转到第 idx 个标记：主视频 seek + 动画预览区切到该帧（可看到抠图效果）
    function jumpToMark(idx) {
        const mark = state.marks[idx];
        if (!mark) return;
        video.pause();
        video.currentTime = mark.time;
        stopAnimPlayback();
        animPlaybackIndex = idx;
        drawAnimFrame(idx);
    }

    btnMark.addEventListener('click', markCurrentFrame);
    btnClearMarks.addEventListener('click', clearMarks);

    // ---------- 一键均匀标记 ----------
    function setBulkStatus(text, cls) {
        bulkStatusEl.textContent = text || '';
        bulkStatusEl.classList.remove('busy', 'done');
        if (cls) bulkStatusEl.classList.add(cls);
    }

    async function bulkMark() {
        if (!video.src || !video.duration) {
            alert('请先加载视频。');
            return;
        }
        if (state.isBusy) return;
        const n = parseInt(bulkCountInput.value, 10);
        if (!isFinite(n) || n < 1) {
            alert('请输入有效的帧数（≥ 1）。');
            return;
        }
        if (n > 500) {
            if (!confirm(`要标记 ${n} 帧吗？数量较大可能占用较多内存。`)) return;
        }
        if (state.marks.length > 0) {
            if (!confirm(`将清空已有 ${state.marks.length} 个标记，再均匀标记 ${n} 帧。继续？`)) return;
            state.marks = [];
            onMarksChanged();
        }

        const dur = video.duration;
        const targets = [];
        for (let i = 0; i < n; i++) targets.push((i + 0.5) / n * dur);

        setBusy(true, { skipExportProgress: true });
        setBulkStatus(`准备中…`, 'busy');
        await new Promise(r => setTimeout(r, 0));

        try {
            try { video.pause(); } catch (e) {}
            for (let i = 0; i < n; i++) {
                const t = targets[i];
                setBulkStatus(`采样 ${i + 1} / ${n} · ${formatTime(t)}`, 'busy');
                await scrubTo(t);
                const snap = captureSnapshotFromVideo();
                if (snap) {
                    // 用 actualTime (video.currentTime) 因为 fastSeek 可能跳到最近关键帧
                    state.marks.push({ id: state.nextId++, time: video.currentTime, snapshot: snap });
                    if (i % 2 === 1 || i === n - 1) { renderMarks(); renderSeekMarks(); }
                }
            }
            state.marks.sort((a, b) => a.time - b.time);
            setBulkStatus(`完成，已标记 ${state.marks.length} 帧`, 'done');
        } catch (err) {
            console.error(err);
            setBulkStatus('一键标记失败：' + (err && err.message ? err.message : err));
            alert('一键标记失败：' + (err && err.message ? err.message : err));
        } finally {
            setBusy(false, { skipExportProgress: true });
            onMarksChanged();
        }
    }

    // 模拟人手动拖拽进度条：fastSeek 跳到最近关键帧（比 currentTime 还快），
    // 只等"下一帧渲染"（rVFC），不等 seeked 事件。
    // 200ms 兜底超时，避免某些视频/浏览器组合下不触发新帧。
    function scrubTo(time) {
        return new Promise((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };

            if (typeof video.requestVideoFrameCallback === 'function') {
                video.requestVideoFrameCallback(finish);
            } else {
                requestAnimationFrame(() => requestAnimationFrame(finish));
            }

            if (typeof video.fastSeek === 'function') {
                video.fastSeek(time);
            } else {
                video.currentTime = time;
            }

            setTimeout(finish, 200);
        });
    }

    btnBulkMark.addEventListener('click', bulkMark);

    // ---------- 标记列表渲染（缩略图来自 mark.snapshot，无 seek） ----------
    function renderMarks() {
        markCountEl.textContent = String(state.marks.length);
        marksList.innerHTML = '';
        state.marks.forEach((mark, idx) => {
            const item = document.createElement('div');
            item.className = 'mark-item';
            item.title = `点击跳转到 ${formatTime(mark.time)}`;

            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 80;
            item.appendChild(canvas);
            drawSnapshotContain(canvas, getDisplaySnapshot(mark));

            const info = document.createElement('div');
            info.className = 'mark-info';
            info.innerHTML = `<span class="mark-index">#${idx + 1}</span><span class="mark-time">${formatTime(mark.time)}</span>`;
            item.appendChild(info);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'mark-remove';
            removeBtn.textContent = '×';
            removeBtn.title = '删除该标记';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeMark(mark.id);
            });
            item.appendChild(removeBtn);

            item.addEventListener('click', () => jumpToMark(idx));

            marksList.appendChild(item);
        });
    }

    // ---------- 快捷键 ----------
    document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (!video.src) return;

        if (e.code === 'Space') {
            e.preventDefault();
            if (video.paused) video.play(); else video.pause();
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            video.pause();
            seekTo(video.currentTime - 1 / getFps());
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            video.pause();
            seekTo(video.currentTime + 1 / getFps());
        } else if (e.code === 'KeyM') {
            e.preventDefault();
            markCurrentFrame();
        }
    });

    // ---------- 动画预览 ----------
    let animTimerId = null;
    let animPlaybackIndex = 0;
    let animPingPongDir = 1;

    function resizeAnimCanvasToVideo() {
        const box = animCanvas.parentElement;
        if (!box) return;
        const vw = video.videoWidth || 16;
        const vh = video.videoHeight || 9;
        const boxW = box.clientWidth;
        const boxH = box.clientHeight;
        const scale = Math.min(boxW / vw, boxH / vh, 1);
        // 设置 backing buffer 大小为快照分辨率级别，保证清晰度
        const targetW = Math.max(1, Math.round(Math.min(SNAPSHOT_MAX_W, vw)));
        const targetH = Math.max(1, Math.round(Math.min(SNAPSHOT_MAX_H, vh)));
        animCanvas.width = targetW;
        animCanvas.height = targetH;
        // 用 CSS 控制实际显示尺寸，contain 到 box 内
        const displayScale = Math.min(boxW / targetW, boxH / targetH, 1);
        animCanvas.style.width = (targetW * displayScale) + 'px';
        animCanvas.style.height = (targetH * displayScale) + 'px';
    }

    window.addEventListener('resize', () => {
        if (video.videoWidth) resizeAnimCanvasToVideo();
    });

    function clearAnimCanvas() {
        const ctx = animCanvas.getContext('2d');
        ctx.clearRect(0, 0, animCanvas.width, animCanvas.height);
        animStatusEl.textContent = `第 0 / 0 帧`;
        animEmpty.style.display = '';
    }

    function drawAnimFrame(idx) {
        if (state.marks.length === 0) { clearAnimCanvas(); return; }
        const i = ((idx % state.marks.length) + state.marks.length) % state.marks.length;
        const mark = state.marks[i];
        drawSnapshotContain(animCanvas, getDisplaySnapshot(mark));
        animStatusEl.textContent = `第 ${i + 1} / ${state.marks.length} 帧 · ${formatTime(mark.time)}`;
        animEmpty.style.display = 'none';
    }

    function updateAnimAvailability() {
        const has = state.marks.length > 0;
        btnAnimPlay.disabled = !has;
        if (!has) {
            btnAnimStop.disabled = true;
            animEmpty.style.display = '';
        } else {
            animEmpty.style.display = 'none';
        }
    }

    function getAnimIntervalMs() {
        let v = parseFloat(animIntervalInput.value);
        if (!isFinite(v) || v < 10) v = 10;
        return v;
    }

    function startAnimPlayback() {
        if (state.marks.length === 0) return;
        if (animTimerId !== null) return;
        if (animPlaybackIndex >= state.marks.length) animPlaybackIndex = 0;
        animPingPongDir = 1;
        btnAnimPlay.disabled = true;
        btnAnimStop.disabled = false;

        const tick = () => {
            drawAnimFrame(animPlaybackIndex);
            const total = state.marks.length;
            const loop = animLoopInput.checked;
            const pingpong = animPingPongInput.checked;

            let nextIdx;
            if (pingpong) {
                nextIdx = animPlaybackIndex + animPingPongDir;
                if (nextIdx >= total) {
                    if (loop) {
                        animPingPongDir = -1;
                        nextIdx = total - 2;
                        if (nextIdx < 0) nextIdx = 0;
                    } else {
                        stopAnimPlayback();
                        return;
                    }
                } else if (nextIdx < 0) {
                    if (loop) {
                        animPingPongDir = 1;
                        nextIdx = 1;
                        if (nextIdx >= total) nextIdx = total - 1;
                    } else {
                        stopAnimPlayback();
                        return;
                    }
                }
            } else {
                nextIdx = animPlaybackIndex + 1;
                if (nextIdx >= total) {
                    if (loop) {
                        nextIdx = 0;
                    } else {
                        stopAnimPlayback();
                        return;
                    }
                }
            }
            animPlaybackIndex = nextIdx;
            animTimerId = setTimeout(tick, getAnimIntervalMs());
        };
        animTimerId = setTimeout(tick, 0);
    }

    function stopAnimPlayback() {
        if (animTimerId !== null) {
            clearTimeout(animTimerId);
            animTimerId = null;
        }
        btnAnimPlay.disabled = state.marks.length === 0;
        btnAnimStop.disabled = true;
    }

    btnAnimPlay.addEventListener('click', startAnimPlayback);
    btnAnimStop.addEventListener('click', stopAnimPlayback);

    // 间隔 / FPS 双向联动
    let syncingAnimRate = false;
    animIntervalInput.addEventListener('input', () => {
        if (syncingAnimRate) return;
        const ms = getAnimIntervalMs();
        syncingAnimRate = true;
        animFpsInput.value = (1000 / ms).toFixed(2);
        syncingAnimRate = false;
    });
    animFpsInput.addEventListener('input', () => {
        if (syncingAnimRate) return;
        let fps = parseFloat(animFpsInput.value);
        if (!isFinite(fps) || fps <= 0) fps = 1;
        syncingAnimRate = true;
        animIntervalInput.value = Math.max(10, Math.round(1000 / fps));
        syncingAnimRate = false;
    });

    // ---------- 导出配置联动 ----------
    function syncConfigEnabled() {
        const useOrigin = cfgUseOrigin.checked;
        cfgWidth.disabled = useOrigin;
        cfgHeight.disabled = useOrigin;
        cfgFit.disabled = useOrigin;
        cfgBgColor.disabled = cfgTransparent.checked;
    }
    cfgUseOrigin.addEventListener('change', syncConfigEnabled);
    cfgTransparent.addEventListener('change', syncConfigEnabled);
    syncConfigEnabled();

    // ---------- 生成 sprite sheet ----------
    function getExportConfig() {
        const cols = Math.max(1, parseInt(cfgColumns.value, 10) || 1);
        const useOrigin = cfgUseOrigin.checked;
        const cellW = useOrigin ? (video.videoWidth || 1) : Math.max(1, parseInt(cfgWidth.value, 10) || 1);
        const cellH = useOrigin ? (video.videoHeight || 1) : Math.max(1, parseInt(cfgHeight.value, 10) || 1);
        const fit = cfgFit.value;
        const padding = Math.max(0, parseInt(cfgPadding.value, 10) || 0);
        const transparent = cfgTransparent.checked;
        const bgColor = cfgBgColor.value || '#000000';
        return { cols, cellW, cellH, fit, padding, transparent, bgColor, useOrigin };
    }

    function computeDrawRect(cfg, srcW, srcH) {
        const { cellW, cellH, fit, useOrigin } = cfg;
        if (useOrigin) return { dx: 0, dy: 0, dw: cellW, dh: cellH };
        if (fit === 'stretch') return { dx: 0, dy: 0, dw: cellW, dh: cellH };
        const scale = (fit === 'cover')
            ? Math.max(cellW / srcW, cellH / srcH)
            : Math.min(cellW / srcW, cellH / srcH);
        const dw = srcW * scale;
        const dh = srcH * scale;
        const dx = (cellW - dw) / 2;
        const dy = (cellH - dh) / 2;
        return { dx, dy, dw, dh };
    }

    function setBusy(busy, opts) {
        state.isBusy = busy;
        btnGenerate.disabled = busy;
        btnExport.disabled = busy || !state.lastPreview;
        btnMark.disabled = busy;
        btnPrev.disabled = busy;
        btnNext.disabled = busy;
        btnClearMarks.disabled = busy;
        btnBulkMark.disabled = busy;
        seekBar.disabled = busy;
        fileInput.disabled = busy;
        btnAnimPlay.disabled = busy || state.marks.length === 0;
        if (!(opts && opts.skipExportProgress)) {
            exportProgress.hidden = !busy;
        }
    }

    function updateProgress(done, total, label) {
        const pct = total > 0 ? (done / total) * 100 : 0;
        progressFill.style.width = pct.toFixed(1) + '%';
        progressText.textContent = label || `正在导出 ${done}/${total}…`;
    }

    async function generate() {
        if (state.marks.length === 0) {
            alert('请先标记至少一帧。');
            return;
        }
        if (state.isBusy) return;
        stopAnimPlayback();

        const cfg = getExportConfig();
        const { cols, cellW, cellH, padding, transparent, bgColor } = cfg;
        const total = state.marks.length;
        const rows = Math.ceil(total / cols);
        const sheetW = cols * cellW + (cols + 1) * padding;
        const sheetH = rows * cellH + (rows + 1) * padding;

        if (sheetW > 16384 || sheetH > 16384) {
            if (!confirm(`输出尺寸 ${sheetW}×${sheetH} 可能超出浏览器 Canvas 上限（约 16384px），可能导致失败。继续？`)) return;
        }

        setBusy(true);
        updateProgress(0, total, '准备中…');
        video.pause();
        // 让 UI 先更新一次再开始
        await new Promise(r => setTimeout(r, 0));

        const sheet = document.createElement('canvas');
        sheet.width = sheetW;
        sheet.height = sheetH;
        const ctx = sheet.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (!transparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, sheetW, sheetH);
        }

        const frames = [];
        const chromaParams = getChromaParams();
        const useOrigin = cfg.useOrigin;
        const fit = cfg.fit;

        try {
            for (let i = 0; i < total; i++) {
                const mark = state.marks[i];
                updateProgress(i, total, `处理 ${i + 1}/${total} · ${formatTime(mark.time)}`);

                // 直接取已缓存的快照（按需做过 chroma key），无需 seek 视频
                const source = getDisplaySnapshot(mark);
                if (!source) continue;

                const srcW = source.width;
                const srcH = source.height;

                const col = i % cols;
                const row = Math.floor(i / cols);
                const cellX = padding + col * (cellW + padding);
                const cellY = padding + row * (cellH + padding);

                // 计算绘制矩形
                let dx, dy, dw, dh;
                if (useOrigin || fit === 'stretch') {
                    dx = 0; dy = 0; dw = cellW; dh = cellH;
                } else {
                    const scale = (fit === 'cover')
                        ? Math.max(cellW / srcW, cellH / srcH)
                        : Math.min(cellW / srcW, cellH / srcH);
                    dw = srcW * scale;
                    dh = srcH * scale;
                    dx = (cellW - dw) / 2;
                    dy = (cellH - dh) / 2;
                }

                ctx.save();
                ctx.beginPath();
                ctx.rect(cellX, cellY, cellW, cellH);
                ctx.clip();
                ctx.drawImage(source, cellX + dx, cellY + dy, dw, dh);
                ctx.restore();

                frames.push({
                    index: i,
                    time: Number(mark.time.toFixed(6)),
                    x: cellX,
                    y: cellY,
                    w: cellW,
                    h: cellH,
                });

                // 每隔几帧让出主线程，进度条能动
                if (i % 16 === 15) await new Promise(r => setTimeout(r, 0));
            }

            const previewCtx = previewCanvas.getContext('2d');
            const boxMax = 1200;
            const previewScale = Math.min(1, boxMax / sheetW);
            previewCanvas.width = Math.round(sheetW * previewScale);
            previewCanvas.height = Math.round(sheetH * previewScale);
            previewCtx.imageSmoothingEnabled = true;
            previewCtx.imageSmoothingQuality = 'high';
            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            previewCtx.drawImage(sheet, 0, 0, previewCanvas.width, previewCanvas.height);

            const meta = {
                source: state.videoFile ? state.videoFile.name : 'video',
                videoSize: { width: video.videoWidth, height: video.videoHeight },
                frameWidth: cellW,
                frameHeight: cellH,
                columns: cols,
                rows: rows,
                padding: padding,
                sheetWidth: sheetW,
                sheetHeight: sheetH,
                transparent: transparent,
                background: transparent ? null : bgColor,
                fit: cfg.useOrigin ? 'origin' : cfg.fit,
                chromaKey: chromaParams ? {
                    color: cfgChromaColor.value,
                    tolerance: chromaParams.tolerance,
                    feather: chromaParams.feather,
                    spill: chromaParams.spill,
                    flood: chromaParams.flood,
                } : null,
                count: total,
                frames: frames,
            };

            state.lastPreview = { sheet, meta };
            previewMeta.textContent = `尺寸 ${sheetW}×${sheetH} · ${cols}×${rows} 网格 · 每帧 ${cellW}×${cellH} · 共 ${total} 帧`;
            updateProgress(total, total, '完成。点击导出按钮下载。');
        } catch (err) {
            console.error(err);
            alert('生成失败：' + (err && err.message ? err.message : err));
        } finally {
            setBusy(false);
            btnExport.disabled = !state.lastPreview;
        }
    }

    async function exportFiles() {
        if (!state.lastPreview) {
            alert('请先生成预览。');
            return;
        }
        const { sheet, meta } = state.lastPreview;
        const baseName = `sprites_${safeFileName(state.videoFile && state.videoFile.name)}_${Date.now()}`;

        await new Promise((resolve) => {
            sheet.toBlob((blob) => {
                if (blob) downloadBlob(blob, baseName + '.png');
                resolve();
            }, 'image/png');
        });

        const jsonBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
        downloadBlob(jsonBlob, baseName + '.json');
    }

    btnGenerate.addEventListener('click', generate);
    btnExport.addEventListener('click', exportFiles);

    // ---------- Chroma Key 事件 ----------
    [cfgChromaEnable, cfgChromaColor, cfgChromaTol, cfgChromaFeather, cfgChromaSpill, cfgChromaFlood].forEach(el => {
        el.addEventListener('input', onChromaParamChanged);
        el.addEventListener('change', onChromaParamChanged);
    });

    // 从视频画面点击取色
    let pickingColor = false;
    let pickSampleCanvas = null;

    function enterPickMode() {
        if (!video.src || !video.videoWidth) return;
        pickingColor = true;
        document.body.classList.add('picking-color');
        chromaPickHint.hidden = false;
    }
    function exitPickMode() {
        pickingColor = false;
        document.body.classList.remove('picking-color');
        chromaPickHint.hidden = true;
    }

    btnPickColor.addEventListener('click', () => {
        if (pickingColor) { exitPickMode(); return; }
        enterPickMode();
    });

    video.addEventListener('click', (e) => {
        if (!pickingColor) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = video.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) { exitPickMode(); return; }
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const vx = Math.max(0, Math.min(video.videoWidth - 1, Math.floor(px * video.videoWidth)));
        const vy = Math.max(0, Math.min(video.videoHeight - 1, Math.floor(py * video.videoHeight)));
        if (!pickSampleCanvas) pickSampleCanvas = document.createElement('canvas');
        pickSampleCanvas.width = video.videoWidth;
        pickSampleCanvas.height = video.videoHeight;
        const sctx = pickSampleCanvas.getContext('2d');
        try {
            sctx.drawImage(video, 0, 0);
            const d = sctx.getImageData(vx, vy, 1, 1).data;
            cfgChromaColor.value = rgbToHex(d[0], d[1], d[2]);
            if (!cfgChromaEnable.checked) cfgChromaEnable.checked = true;
            onChromaParamChanged();
        } catch (err) {
            console.error('取色失败：', err);
            alert('取色失败：' + (err && err.message ? err.message : err));
        }
        exitPickMode();
    });

    animCanvas.addEventListener('click', (e) => {
        if (!pickingColor) return;
        e.preventDefault();
        e.stopPropagation();
        const mark = state.marks[animPlaybackIndex] || state.marks[0];
        if (!mark || !mark.snapshot) { exitPickMode(); return; }
        const rect = animCanvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) { exitPickMode(); return; }
        const cx = (e.clientX - rect.left) / rect.width * animCanvas.width;
        const cy = (e.clientY - rect.top) / rect.height * animCanvas.height;
        const sw = mark.snapshot.width;
        const sh = mark.snapshot.height;
        const scale = Math.min(animCanvas.width / sw, animCanvas.height / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const dx = (animCanvas.width - dw) / 2;
        const dy = (animCanvas.height - dh) / 2;
        if (cx < dx || cx >= dx + dw || cy < dy || cy >= dy + dh) {
            exitPickMode();
            return;
        }
        const sx = Math.max(0, Math.min(sw - 1, Math.floor((cx - dx) / scale)));
        const sy = Math.max(0, Math.min(sh - 1, Math.floor((cy - dy) / scale)));
        const tmp = document.createElement('canvas');
        tmp.width = sw; tmp.height = sh;
        const tctx = tmp.getContext('2d');
        try {
            tctx.drawImage(mark.snapshot, 0, 0);
            const d = tctx.getImageData(sx, sy, 1, 1).data;
            cfgChromaColor.value = rgbToHex(d[0], d[1], d[2]);
            if (!cfgChromaEnable.checked) cfgChromaEnable.checked = true;
            onChromaParamChanged();
        } catch (err) {
            console.error('取色失败：', err);
            alert('取色失败：' + (err && err.message ? err.message : err));
        }
        exitPickMode();
    });

    document.addEventListener('keydown', (e) => {
        if (pickingColor && e.code === 'Escape') {
            e.preventDefault();
            exitPickMode();
        }
    });

    // 初始化 chroma 数值标签
    cfgChromaTolVal.textContent = cfgChromaTol.value;
    cfgChromaFeatherVal.textContent = cfgChromaFeather.value;

    // 初始化动画 UI 状态
    updateAnimAvailability();
    clearAnimCanvas();

    // 防止误关
    window.addEventListener('beforeunload', (e) => {
        if (state.marks.length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
})();
