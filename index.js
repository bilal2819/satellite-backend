const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { execSync } = require('child_process');
const mongoose = require('mongoose');
const qrcodeTerminal = require('qrcode-terminal');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');

dotenv.config();

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

console.log('Starting Electric Satellite Server...');

// ─── Firebase Admin Initialization ───
function initFirebase() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
            admin.initializeApp({ credential: admin.credential.cert(sa) });
            console.log('✅ Firebase initialized from FIREBASE_SERVICE_ACCOUNT');
            return true;
        } catch (e) { console.error('❌ FIREBASE_SERVICE_ACCOUNT parse failed:', e.message); }
    }
    if (process.env.FB_PROJECT_ID && process.env.FB_CLIENT_EMAIL && process.env.FB_PRIVATE_KEY) {
        try {
            let privateKey = process.env.FB_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FB_PROJECT_ID,
                    clientEmail: process.env.FB_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
            console.log('✅ Firebase initialized from separate env vars');
            return true;
        } catch (e) { console.error('❌ Firebase init from separate env vars failed:', e.message); }
    }
    try {
        const sa = require('./serviceAccountKey.json');
        admin.initializeApp({ credential: admin.credential.cert(sa) });
        console.log('✅ Firebase initialized from local serviceAccountKey.json');
        return true;
    } catch (e) { console.error('❌ No serviceAccountKey.json found:', e.message); }
    return false;
}

const firebaseReady = initFirebase();
if (!firebaseReady) {
    console.error('🔴 FATAL: Could not initialize Firebase. Server will exit.');
    process.exit(1);
}

const dbAdmin = admin.firestore();

// ─── Express Setup ───
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ─── Auth Middleware ───
async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const token = authHeader.split('Bearer ')[1];
        req.user = await admin.auth().verifyIdToken(token);
        next();
    } catch (error) { return res.status(401).json({ error: 'Unauthorized' }); }
}

async function verifyAdmin(req, res, next) {
    await verifyAuth(req, res, () => {
        if (!req.user || req.user.admin !== true) return res.status(403).json({ error: 'Forbidden' });
        next();
    });
}

// ─── Priority Routes ───
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/ping', (req, res) => res.json({ success: true, message: 'PONG!' }));

// ─── QR Code Page ───
let latestQR = null;
app.get('/qr', (req, res) => {
    if (!latestQR) {
        return res.send('<html><body style="background:#111;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column"><h1>✅ WhatsApp Bot is already connected!</h1><p style="color:#888">No QR code needed.</p><script>setTimeout(() => location.reload(), 10000)</script></body></html>');
    }
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(latestQR)}`;
    res.send(`<html><body style="background:#111;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column"><h1>📱 Scan with WhatsApp</h1><img src="${qrImageUrl}" style="border-radius:12px;background:#fff;padding:8px" /><script>setTimeout(() => location.reload(), 15000)</script></body></html>`);
});

// ─── Whish Webhook ───
app.post('/api/webhook/whish', async (req, res) => {
    const { text, secret } = req.body;
    if (secret !== (process.env.WHISH_WEBHOOK_SECRET || 'whish-secret-2026')) return res.status(403).json({ error: 'Unauthorized' });
    if (!text) return res.status(400).json({ error: 'No text' });

    try {
        const amountMatch = text.match(/(\d+(\.\d+)?)\s*USD/i) || text.match(/\$(\d+(\.\d+)?)/);
        const phoneMatch = text.match(/Note:\s*(\+?961|0)?([378]\d{7})/i);
        if (!amountMatch || !phoneMatch) throw new Error('Invalid notification format');

        const amount = parseFloat(amountMatch[1]);
        const normalizedPhone = "+961" + phoneMatch[2];

        const usersQuery = await dbAdmin.collection('users').where('phone', '==', normalizedPhone).limit(1).get();
        if (usersQuery.empty) throw new Error(`User ${normalizedPhone} not found`);

        const userId = usersQuery.docs[0].id;
        await dbAdmin.runTransaction(async (t) => {
            const userRef = dbAdmin.collection('users').doc(userId);
            const userSnap = await t.get(userRef);
            t.update(userRef, { balance: (userSnap.data().balance || 0) + amount });
            t.set(dbAdmin.collection('transactions').doc(), {
                userId, type: 'TOP_UP', amount, method: 'WHISH_AUTO', date: new Date().toISOString(), status: 'COMPLETED', note: text
            });
        });
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ─── OTP Endpoints ───
const otpCache = new Map();
const RATE_LIMIT_MS = 10 * 60 * 1000;
const ipRateLimit = new Map();
const phoneRateLimit = new Map();

app.post('/api/send-otp', async (req, res) => {
    const { phone } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    
    if (ipRateLimit.get(ip) > Date.now() - RATE_LIMIT_MS) return res.status(429).json({ error: 'Wait 10 min' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache.set(phone, { code, expiresAt: Date.now() + RATE_LIMIT_MS });
    ipRateLimit.set(ip, Date.now());

    try {
        if (!client || !client.info) throw new Error('Bot not ready');
        await client.sendMessage(phone.replace(/\D/g, '') + '@c.us', `*Verification Code:* ${code}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/verify-otp', async (req, res) => {
    const { phone, code } = req.body;
    const record = otpCache.get(phone);
    if (!record || record.code !== code) return res.status(400).json({ error: 'Invalid code' });
    otpCache.delete(phone);

    try {
        let userRecord;
        try { userRecord = await admin.auth().getUserByPhoneNumber(phone); }
        catch (e) { userRecord = await admin.auth().createUser({ phoneNumber: phone }); }

        const userRef = dbAdmin.collection('users').doc(userRecord.uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) await userRef.set({ phone, balance: 15.5, createdAt: new Date().toISOString() });

        const token = await admin.auth().createCustomToken(userRecord.uid);
        if (phone === '+96181123343') await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
        res.json({ token });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Purchase & Admin Endpoints ───
app.post('/api/purchase', verifyAuth, async (req, res) => {
    const { price, name } = req.body;
    try {
        await dbAdmin.runTransaction(async (t) => {
            const userRef = dbAdmin.collection('users').doc(req.user.uid);
            const userSnap = await t.get(userRef);
            if ((userSnap.data().balance || 0) < price) throw new Error('Insufficient balance');
            t.update(userRef, { balance: userSnap.data().balance - price });
            t.set(dbAdmin.collection('transactions').doc(), { userId: req.user.uid, amount: -price, item: name, date: new Date().toISOString() });
        });
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/admin/user/:uid', verifyAdmin, async (req, res) => {
    try {
        await admin.auth().deleteUser(req.params.uid);
        await dbAdmin.collection('users').doc(req.params.uid).delete();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── MongoDB & WhatsApp Manual Sync ───
let client;

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('✅ Connected to MongoDB');

    // 1. PRE-START: Attempt to load session from MongoDB
    const sessionDir = path.join(__dirname, '.wwebjs_auth');
    try {
        const sessionSnap = await mongoose.connection.db.collection('whatsapp_sessions').findOne({ id: 'latest' });
        if (sessionSnap && sessionSnap.zip) {
            console.log('📦 Found WhatsApp session in MongoDB. Restoring...');
            const tempZip = path.join(os.tmpdir(), 'session.tar.gz');
            fs.writeFileSync(tempZip, Buffer.from(sessionSnap.zip, 'base64'));
            
            if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
            fs.mkdirSync(sessionDir, { recursive: true });
            
            execSync(`tar -xzf ${tempZip} -C ${__dirname}`);
            console.log('✅ WhatsApp session restored successfully!');
        }
    } catch (err) {
        console.log('ℹ️ No session restored:', err.message);
    }

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'electric-satellite-bot',
            dataPath: sessionDir
        }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log('QR RECEIVED. Visit /qr to scan it.');
        latestQR = qr;
    });

    client.on('ready', async () => {
        console.log('✅ WhatsApp Bot is ready!');
        latestQR = null;

        // 2. POST-READY: Save session back to MongoDB for persistence
        try {
            console.log('💾 Backing up WhatsApp session to MongoDB...');
            const tempZip = path.join(os.tmpdir(), 'session.tar.gz');
            // --ignore-failed-read allows backup to finish even if WhatsApp is writing to files
            execSync(`tar --ignore-failed-read -czf ${tempZip} --exclude='*Cache*' -C ${__dirname} .wwebjs_auth`);
            const zipBase64 = fs.readFileSync(tempZip, { encoding: 'base64' });
            
            await mongoose.connection.db.collection('whatsapp_sessions').updateOne(
                { id: 'latest' },
                { $set: { zip: zipBase64, updatedAt: new Date() } },
                { upsert: true }
            );
            console.log('💾 SUCCESS: WhatsApp session backed up to MongoDB!');
        } catch (err) {
            console.error('❌ Failed to backup WhatsApp session:', err.message);
        }
    });

    client.initialize();
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
