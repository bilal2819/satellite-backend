const express = require('express');
console.log("Starting Professional Cloud Server...");
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const dotenv = require('dotenv');
const admin = require('firebase-admin');

dotenv.config();

// Initialize Firebase Admin (Safe Cloud Loading)
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    // Decode from Base64 if it doesn't start with {
    const decoded = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(decoded);
  } else {
    serviceAccount = require('./serviceAccountKey.json');
  }
} catch (e) {
  console.error("CRITICAL: Failed to parse Firebase Service Account JSON.");
  console.error(e.message);
}

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin initialized successfully.");
} else {
  console.error("ERROR: No service account loaded. Check Render environment variables.");
}

const dbAdmin = admin.firestore();
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

const ADMIN_SETUP_SECRET = process.env.ADMIN_SECRET || 'es-admin-setup-2026';
const RATE_LIMIT_MS = 10 * 60 * 1000;

const otpCache = new Map();
const ipRateLimit = new Map();
const phoneRateLimit = new Map();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED. Scan this with your WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Bot is ready!');
});

client.initialize();

async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const token = authHeader.split('Bearer ')[1];
        req.user = await admin.auth().verifyIdToken(token);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

async function verifyAdmin(req, res, next) {
    await verifyAuth(req, res, () => {
        if (!req.user || req.user.admin !== true) {
            return res.status(403).json({ error: 'Admin only' });
        }
        next();
    });
}

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

app.post('/api/send-otp', async (req, res) => {
    const { phone } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    
    const code = generateCode();
    otpCache.set(phone, { code, expiresAt: Date.now() + RATE_LIMIT_MS });

    try {
        const formattedPhone = phone.replace('+', '') + '@c.us';
        const message = `*Electric Satellite Login*\nCode: *${code}*`;
        await client.sendMessage(formattedPhone, message);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send WhatsApp' });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    const { phone, code } = req.body;
    const record = otpCache.get(phone);
    if (!record || record.code !== code) return res.status(400).json({ error: 'Invalid code' });

    try {
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByPhoneNumber(phone);
        } catch (e) {
            userRecord = await admin.auth().createUser({ phoneNumber: phone });
        }
        const customToken = await admin.auth().createCustomToken(userRecord.uid);
        res.json({ success: true, token: customToken });
    } catch (error) {
        res.status(500).json({ error: 'Auth failed' });
    }
});

app.post('/api/setup-admin', async (req, res) => {
    const { secret, uid } = req.body;
    if (secret !== ADMIN_SETUP_SECRET) return res.status(403).json({ error: 'Invalid secret' });
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    res.json({ success: true });
});

app.post('/api/purchase', verifyAuth, async (req, res) => {
    const userId = req.user.uid;
    const data = req.body;
    try {
        await dbAdmin.runTransaction(async (t) => {
            const userRef = dbAdmin.collection('users').doc(userId);
            const userSnap = await t.get(userRef);
            const balance = userSnap.data().balance || 0;
            if (balance < data.price) throw new Error('Insufficient balance');

            t.update(userRef, { balance: balance - data.price });
            t.set(dbAdmin.collection('transactions').doc(), {
                userId, type: 'PURCHASE', amount: -data.price, item: data.name, date: new Date().toISOString()
            });

            t.set(dbAdmin.collection('subscriptions').doc(), {
                userId, ...data, expiry: new Date(Date.now() + 30*24*60*60*1000).toISOString()
            });
        });
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
