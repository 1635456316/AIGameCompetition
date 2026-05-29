import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const port = Number(process.env.PORT || 3000);
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');

export const config = {
    port,
    host: process.env.HOST || '0.0.0.0',
    publicBaseUrl,
    feishu: {
        appId: process.env.FEISHU_APP_ID || '',
        appSecret: process.env.FEISHU_APP_SECRET || '',
        redirectUri: process.env.FEISHU_REDIRECT_URI || `${publicBaseUrl}/api/auth/feishu/callback`
    },
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    cookieSecret: process.env.COOKIE_SECRET || 'dev-cookie-secret',
    ugcRoot: path.join(__dirname, '..', 'data', 'ugc'),
    authBindingsPath: path.join(__dirname, '..', 'data', 'auth', 'ip-bindings.json'),
    projectRoot: path.join(__dirname, '..', '..')
};
