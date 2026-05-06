const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const dotenv = require('dotenv');
const admin = require('firebase-admin');

dotenv.config();

console.log('Starting Electric Satellite Server...');

// ─── Firebase Admin Initialization ───
// Supports 3 methods (in priority order):
//   1. FIREBASE_SERVICE_ACCOUNT env var (full JSON string)
//   2. FB_PROJECT_ID + FB_CLIENT_EMAIL + FB_PRIVATE_KEY (separate env vars)
//   3. Local serviceAccountKey.json file (dev only)

function initFirebase() {
    // Method 1: Full JSON string
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            // Fix private key newlines — env vars often escape \n as literal \\n
            if (sa.private_key) {
                sa.private_key = sa.private_key.replace(/\\n/g, '\n');
            }
            admin.initializeApp({ credential: admin.credential.cert(sa) });
            console.log('✅ Firebase initialized from FIREBASE_SERVICE_ACCOUNT');
            return true;
        } catch (e) {
            console.error('❌ FIREBASE_SERVICE_ACCOUNT parse failed:', e.message);
        }
    }

    // Method 2: Separate env vars (most reliable for Render)
    if (process.env.FB_PROJECT_ID && process.env.FB_CLIENT_EMAIL && process.env.FB_PRIVATE_KEY) {
        try {
            // Fix private key — Render often stores \n as literal \\n
            let privateKey = process.env.FB_PRIVATE_KEY;
            privateKey = privateKey.replace(/\\n/g, '\n');
            // Remove any wrapping quotes that Render might add
            privateKey = privateKey.replace(/^["']|["']$/g, '');

            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FB_PROJECT_ID,
                    clientEmail: process.env.FB_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
            console.log('✅ Firebase initialized from separate env vars');
            return true;
        } catch (e) {
            console.error('❌ Firebase init from separate env vars failed:', e.message);
        }
    }

    // Method 3: Local file (dev only)
    try {
        const sa = require('./serviceAccountKey.json');
        admin.initializeApp({ credential: admin.credential.cert(sa) });
        console.log('✅ Firebase initialized from local serviceAccountKey.json');
        return true;
    } catch (e) {
        console.error('❌ No serviceAccountKey.json found:', e.message);
    }

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

const allowedOrigins = [
    'http://localhost:5173',
    'https://trialboostbeyondlimits.shop',
    'https://website-1e50e.web.app'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
app.use(express.json());

// ─── Config ───
const ADMIN_SETUP_SECRET = process.env.ADMIN_SECRET || 'es-admin-setup-2026';
const RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

// In-memory caches
const otpCache = new Map();
const ipRateLimit = new Map();
const phoneRateLimit = new Map();

// ─── WhatsApp Bot Setup ───
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED. Scan this with your WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Bot is ready!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp auth failure:', msg);
});

client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp disconnected:', reason);
});

client.initialize();

// ─── Health Check (Render needs this) ───
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth Middleware ───
async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided.' });
    }
    try {
        const token = authHeader.split('Bearer ')[1];
        req.user = await admin.auth().verifyIdToken(token);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
    }
}

async function verifyAdmin(req, res, next) {
    await verifyAuth(req, res, () => {
        if (!req.user || req.user.admin !== true) {
            return res.status(403).json({ error: 'Forbidden: Admin access required.' });
        }
        next();
    });
}

// ─── Helper ───
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OTP ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/send-otp', async (req, res) => {
    const { phone } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    if (!phone.startsWith('+961') && !phone.startsWith('961')) {
        return res.status(400).json({ error: 'Only Lebanese numbers (+961) are allowed.' });
    }

    const now = Date.now();
    if (ipRateLimit.has(ip) && now - ipRateLimit.get(ip) < RATE_LIMIT_MS) {
        return res.status(429).json({ error: 'Too many requests from this IP. Please wait 10 minutes.' });
    }
    if (phoneRateLimit.has(phone) && now - phoneRateLimit.get(phone) < RATE_LIMIT_MS) {
        return res.status(429).json({ error: 'A code was recently sent to this number. Please wait 10 minutes.' });
    }

    const code = generateCode();
    otpCache.set(phone, { code, expiresAt: now + RATE_LIMIT_MS });
    ipRateLimit.set(ip, now);
    phoneRateLimit.set(phone, now);

    try {
        const formattedPhone = phone.replace('+', '') + '@c.us';
        const message = `*Electric Satellite Login*\n\nYour verification code is: *${code}*\n\nThis code will expire in 10 minutes. Do not share this code with anyone.`;
        await client.sendMessage(formattedPhone, message);
        console.log(`Code sent to ${phone}`);
        res.json({ success: true, message: 'Code sent successfully via WhatsApp.' });
    } catch (error) {
        console.error('Failed to send WhatsApp message:', error);
        ipRateLimit.delete(ip);
        phoneRateLimit.delete(phone);
        res.status(500).json({ error: 'Failed to send WhatsApp message.' });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'Phone and code are required' });

    const record = otpCache.get(phone);
    if (!record) return res.status(400).json({ error: 'No code requested for this number or it expired.' });
    if (Date.now() > record.expiresAt) {
        otpCache.delete(phone);
        return res.status(400).json({ error: 'Code expired.' });
    }

    if (record.code === code) {
        otpCache.delete(phone);
        try {
            let userRecord;
            try {
                userRecord = await admin.auth().getUserByPhoneNumber(phone);
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    userRecord = await admin.auth().createUser({ phoneNumber: phone });
                } else {
                    throw error;
                }
            }
            const customToken = await admin.auth().createCustomToken(userRecord.uid);
            res.json({ success: true, token: customToken, message: 'Phone verified successfully.' });
        } catch (error) {
            console.error('Error generating custom token:', error);
            res.status(500).json({ error: 'Authentication failed.' });
        }
    } else {
        res.status(400).json({ error: 'Invalid code.' });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN SETUP (one-time)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/setup-admin', async (req, res) => {
    const { secret, uid } = req.body;
    if (secret !== ADMIN_SETUP_SECRET) {
        return res.status(403).json({ error: 'Invalid secret.' });
    }
    if (!uid) return res.status(400).json({ error: 'UID is required.' });

    try {
        await admin.auth().setCustomUserClaims(uid, { admin: true });
        console.log(`Admin claim set for UID: ${uid}`);
        res.json({ success: true, message: `Admin claim set for ${uid}. User must re-login.` });
    } catch (error) {
        console.error('Error setting admin claim:', error);
        res.status(500).json({ error: 'Failed to set admin claim.' });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PURCHASE ENDPOINT (authenticated user)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/purchase', verifyAuth, async (req, res) => {
    const userId = req.user.uid;
    const { name, plan, duration, price, color, rgb, logo, logoFill, logoContain, logoBg, type,
            link, targetEmail, profileName, services } = req.body;

    if (!name || !price || price <= 0) {
        return res.status(400).json({ error: 'Invalid purchase data.' });
    }

    try {
        await dbAdmin.runTransaction(async (t) => {
            const userRef = dbAdmin.collection('users').doc(userId);
            const userSnap = await t.get(userRef);

            if (!userSnap.exists) throw new Error('User not found.');
            const userData = userSnap.data();
            const currentBalance = userData.balance || 0;

            if (currentBalance < price) {
                throw new Error('Insufficient balance.');
            }

            // Deduct balance
            t.update(userRef, { balance: currentBalance - price });

            // Create transaction record
            const txnRef = dbAdmin.collection('transactions').doc();
            t.set(txnRef, {
                userId, type: 'PURCHASE', amount: -price,
                item: name, plan: plan || duration,
                date: new Date().toISOString(), status: 'COMPLETED'
            });

            // SMM Order
            if (type === 'SMM') {
                const qtyMatch = duration ? duration.match(/(\d+)/) : null;
                const quantity = qtyMatch ? parseInt(qtyMatch[0].replace(/,/g, '')) : 1000;
                const smmRef = dbAdmin.collection('smmOrders').doc();
                t.set(smmRef, {
                    userId, date: new Date().toISOString(), link: link || '',
                    charge: price, startCount: Math.floor(Math.random() * 500),
                    quantity,
                    service: `${name} ${(duration || '').replace(/^\d+\s*/, '')} — HQ | Non Drop`,
                    serviceType: (duration || '').replace(/^\d+\s*/, ''),
                    platform: name, color, rgb, logo,
                    status: 'in_progress', remains: quantity
                });
                return; // Done for SMM
            }

            // Subscription — handle inventory for physical accounts
            const isInviteBased = name === 'Spotify' || name === 'Anghami Plus';
            const isEmailBased = name === 'Canva Pro';

            let credentials = {};
            if (!isInviteBased && !isEmailBased) {
                // Find available inventory
                const invQuery = await dbAdmin.collection('inventory')
                    .where('service', '==', name)
                    .where('status', '==', 'available')
                    .limit(1).get();

                if (invQuery.empty) {
                    throw new Error(`Out of stock for ${name}.`);
                }

                const invDoc = invQuery.docs[0];
                const invData = invDoc.data();
                credentials = {
                    email: invData.email,
                    password: invData.password,
                    ...(invData.profileName ? { profileName: invData.profileName, profilePin: invData.profilePin } : {})
                };

                // Mark inventory as sold
                t.update(invDoc.ref, {
                    status: 'sold', soldTo: userId,
                    soldAt: new Date().toISOString()
                });
            } else if (isEmailBased) {
                credentials = { email: targetEmail };
            } else if (isInviteBased) {
                credentials = { pending: true, inviteLink: null };
            }

            // Calculate expiry
            let monthsToAdd = 1;
            const match = duration ? duration.match(/(\d+)/) : null;
            if (match) monthsToAdd = parseInt(match[1]);
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + monthsToAdd);

            const subRef = dbAdmin.collection('subscriptions').doc();
            t.set(subRef, {
                userId, name, plan: `${duration} - ${plan || 'Premium'}`,
                color, rgb, logo, type,
                ...(logoFill !== undefined ? { logoFill } : {}),
                ...(logoContain !== undefined ? { logoContain } : {}),
                ...(logoBg !== undefined ? { logoBg } : {}),
                expiry: expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                credentials, autoRenew: false
            });
        });

        res.json({ success: true, message: 'Purchase completed.' });
    } catch (error) {
        console.error('Purchase error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Admin: Update user balance
app.post('/api/admin/update-balance', verifyAdmin, async (req, res) => {
    const { userId, newBalance } = req.body;
    if (!userId || newBalance === undefined) {
        return res.status(400).json({ error: 'userId and newBalance are required.' });
    }
    try {
        await dbAdmin.collection('users').doc(userId).update({ balance: parseFloat(newBalance) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Add funds to user
app.post('/api/admin/add-funds', verifyAdmin, async (req, res) => {
    const { userId, amount, method } = req.body;
    if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid userId and amount are required.' });
    }
    try {
        await dbAdmin.runTransaction(async (t) => {
            const userRef = dbAdmin.collection('users').doc(userId);
            const userSnap = await t.get(userRef);
            if (!userSnap.exists) throw new Error('User not found.');
            const currentBalance = userSnap.data().balance || 0;
            t.update(userRef, { balance: currentBalance + amount });
            const txnRef = dbAdmin.collection('transactions').doc();
            t.set(txnRef, {
                userId, type: 'TOP_UP', amount, method: method || 'ADMIN',
                date: new Date().toISOString(), status: 'COMPLETED'
            });
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Add inventory
app.post('/api/admin/add-inventory', verifyAdmin, async (req, res) => {
    const { service, email, password, profileName, profilePin } = req.body;
    if (!service || !email || !password) {
        return res.status(400).json({ error: 'service, email, and password are required.' });
    }
    try {
        await dbAdmin.collection('inventory').add({
            service, email, password,
            profileName: profileName || null,
            profilePin: profilePin || null,
            status: 'available',
            addedAt: new Date().toISOString()
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Delete inventory
app.delete('/api/admin/inventory/:itemId', verifyAdmin, async (req, res) => {
    try {
        await dbAdmin.collection('inventory').doc(req.params.itemId).delete();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Add subscription manually
app.post('/api/admin/add-subscription', verifyAdmin, async (req, res) => {
    const subData = req.body;
    if (!subData.userId || !subData.name) {
        return res.status(400).json({ error: 'userId and name are required.' });
    }
    try {
        await dbAdmin.collection('subscriptions').add({
            userId: subData.userId, name: subData.name,
            plan: subData.plan || 'Premium',
            color: subData.color, rgb: subData.rgb, logo: subData.logo,
            logoFill: subData.logoFill || false,
            logoContain: subData.logoContain || false,
            logoBg: subData.logoBg || null,
            type: subData.type, expiry: subData.expiry,
            autoRenew: false,
            credentials: subData.credentials || {}
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Edit subscription
app.patch('/api/admin/subscription/:subId', verifyAdmin, async (req, res) => {
    try {
        await dbAdmin.collection('subscriptions').doc(req.params.subId).update(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Delete subscription
app.delete('/api/admin/subscription/:subId', verifyAdmin, async (req, res) => {
    try {
        await dbAdmin.collection('subscriptions').doc(req.params.subId).delete();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USER ENDPOINTS (authenticated)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Renew subscription
app.post('/api/renew', verifyAuth, async (req, res) => {
    const userId = req.user.uid;
    const { subId, duration, price } = req.body;
    if (!subId || !duration || !price) {
        return res.status(400).json({ error: 'subId, duration, and price are required.' });
    }
    try {
        await dbAdmin.runTransaction(async (t) => {
            const userRef = dbAdmin.collection('users').doc(userId);
            const subRef = dbAdmin.collection('subscriptions').doc(subId);
            const [userSnap, subSnap] = await Promise.all([t.get(userRef), t.get(subRef)]);

            if (!userSnap.exists) throw new Error('User not found.');
            if (!subSnap.exists) throw new Error('Subscription not found.');
            if (subSnap.data().userId !== userId) throw new Error('Not your subscription.');

            const currentBalance = userSnap.data().balance || 0;
            if (currentBalance < price) throw new Error('Insufficient balance.');

            t.update(userRef, { balance: currentBalance - price });

            const txnRef = dbAdmin.collection('transactions').doc();
            t.set(txnRef, {
                userId, type: 'PURCHASE', amount: -price,
                item: subSnap.data().name + ' (Renewal)',
                plan: duration, date: new Date().toISOString(), status: 'COMPLETED'
            });

            const months = duration.match(/(\d+)/) ? parseInt(duration.match(/(\d+)/)[1]) : 1;
            const currentExpiry = new Date(subSnap.data().expiry);
            const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
            baseDate.setMonth(baseDate.getMonth() + months);

            t.update(subRef, {
                expiry: baseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            });
        });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Toggle auto-renew
app.post('/api/toggle-autorenew', verifyAuth, async (req, res) => {
    const userId = req.user.uid;
    const { subId } = req.body;
    try {
        const subRef = dbAdmin.collection('subscriptions').doc(subId);
        const subSnap = await subRef.get();
        if (!subSnap.exists || subSnap.data().userId !== userId) {
            return res.status(403).json({ error: 'Not your subscription.' });
        }
        await subRef.update({ autoRenew: !subSnap.data().autoRenew });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Start Server ───
app.listen(PORT, () => {
    console.log(`⚡ Electric Satellite Server running on port ${PORT}`);
});
