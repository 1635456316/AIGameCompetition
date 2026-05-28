import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { exportLevel, validateLevel, hashLevelData } from '../validators/levelValidator.js';

const META_FILE = 'meta.json';
const LEVEL_FILE = 'level.json';
const TEST_PASS_TTL_MS = 30 * 60 * 1000;

async function ensureUgcRoot() {
    await fs.mkdir(config.ugcRoot, { recursive: true });
}

function isUuidLike(id) {
    return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
}

async function readJson(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
}

export async function listLevels() {
    await ensureUgcRoot();
    const entries = await fs.readdir(config.ugcRoot, { withFileTypes: true });
    const levels = [];

    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.endsWith('.tmp')) continue;
        const metaPath = path.join(config.ugcRoot, entry.name, META_FILE);
        try {
            const meta = await readJson(metaPath);
            levels.push({
                id: meta.id || entry.name,
                title: meta.title || '未命名关卡',
                description: meta.description || '',
                authorId: meta.authorId || '',
                authorName: meta.authorName || '未知作者',
                createdAt: meta.createdAt || 0,
                updatedAt: meta.updatedAt || 0
            });
        } catch {
            // skip invalid folders
        }
    }

    return levels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getLevel(levelId) {
    if (!isUuidLike(levelId)) return null;
    const dir = path.join(config.ugcRoot, levelId);
    const metaPath = path.join(dir, META_FILE);
    const levelPath = path.join(dir, LEVEL_FILE);

    try {
        const [meta, level] = await Promise.all([
            readJson(metaPath),
            readJson(levelPath)
        ]);
        return { meta, level };
    } catch {
        return null;
    }
}

export async function getLevelFilePath(levelId, filename) {
    if (!isUuidLike(levelId)) return null;
    const safeName = path.basename(filename);
    if (!safeName || safeName.includes('..')) return null;
    const filePath = path.join(config.ugcRoot, levelId, safeName);
    try {
        await fs.access(filePath);
        return filePath;
    } catch {
        return null;
    }
}

export function verifyTestPass(levelData, testPass) {
    if (!testPass || typeof testPass !== 'object') {
        return { ok: false, error: '缺少试玩通关凭证' };
    }

    const { passedAt } = testPass;
    if (!passedAt) {
        return { ok: false, error: '试玩通关凭证不完整' };
    }

    const age = Date.now() - Number(passedAt);
    if (!Number.isFinite(age) || age < 0 || age > TEST_PASS_TTL_MS) {
        return { ok: false, error: '试玩通关凭证已过期，请重新试玩' };
    }

    const errors = validateLevel(levelData);
    if (errors.length) {
        return { ok: false, error: errors.join('；') };
    }

    return { ok: true };
}

export async function createLevel({ authorId, authorName, title, description, levelData, testPass }) {
    const errors = validateLevel(levelData);
    if (errors.length) {
        return { ok: false, error: errors.join('；') };
    }

    const passCheck = verifyTestPass(levelData, testPass);
    if (!passCheck.ok) {
        return passCheck;
    }

    const cleaned = exportLevel(levelData);
    const now = Date.now();
    const id = crypto.randomUUID();
    const tmpDir = path.join(config.ugcRoot, `${id}.tmp`);
    const finalDir = path.join(config.ugcRoot, id);

    await ensureUgcRoot();
    await fs.mkdir(tmpDir, { recursive: true });

    const meta = {
        id,
        title: String(title || cleaned.title || '未命名关卡').trim(),
        description: String(description || '').trim(),
        authorId,
        authorName,
        createdAt: now,
        updatedAt: now
    };

    if (!meta.title) {
        await fs.rm(tmpDir, { recursive: true, force: true });
        return { ok: false, error: '关卡名称不能为空' };
    }

    cleaned.title = meta.title;
    cleaned.subtitle = meta.description || cleaned.subtitle || '';

    await fs.writeFile(path.join(tmpDir, META_FILE), JSON.stringify(meta, null, 2), 'utf8');
    await fs.writeFile(path.join(tmpDir, LEVEL_FILE), JSON.stringify(cleaned, null, 2), 'utf8');
    await fs.rename(tmpDir, finalDir);

    return { ok: true, level: meta };
}

export async function deleteLevel(levelId, authorId) {
    const data = await getLevel(levelId);
    if (!data) return { ok: false, error: '关卡不存在' };
    if (data.meta.authorId !== authorId) {
        return { ok: false, error: '无权删除此关卡' };
    }

    await fs.rm(path.join(config.ugcRoot, levelId), { recursive: true, force: true });
    return { ok: true };
}
