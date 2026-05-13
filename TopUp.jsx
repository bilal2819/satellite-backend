import { useState } from 'react';
import { Wallet, Smartphone, Building2, MessageCircle, ArrowRight, ShieldCheck, Clock, CheckCircle2, Bitcoin, FileDigit, ChevronDown, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TopUp = () => {
    const { balance, user, showToast } = useAuth();
    const [amount, setAmount] = useState(10);
    const [method, setMethod] = useState('WHISH');
    const [submitted, setSubmitted] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    
    // New States for Verification
    const [transactionId, setTransactionId] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [verificationSuccess, setVerificationSuccess] = useState(false);
    const [binanceStep, setBinanceStep] = useState(1); // 1: Pay, 2: Verify

    const ADMIN_NUMBER_DEFAULT = "81 123 343";
    const ADMIN_NUMBER_MTC = "78 808 509";
    const BINANCE_PAY_ID = "349 271 068";

    const displayNumber = method === 'MTC' ? ADMIN_NUMBER_MTC : method === 'BINANCE' ? BINANCE_PAY_ID : ADMIN_NUMBER_DEFAULT;
    const waNumber = method === 'MTC' ? "96178808509" : "96181123343";

    const GATEWAYS = [
        { id: 'BINANCE_AUTO', name: 'Binance Pay | Auto | Min 1$ | Only USDT', icon: '/logos/binance.png', color: '#F0B90B', desc: 'Automatic instant verification', min: 1 },
        { id: 'WHISH', name: 'Whish Money | Auto | USD Only', icon: '/logos/whish.png', color: '#ef4444', desc: 'Automatic instant verification', min: 1, scale: 1.1 },
        { id: 'OMT', name: 'OMT Pay', icon: '/logos/omt.png', color: '#f59e0b', desc: 'Send via OMT Pay app', min: 1 },
        { id: 'ALFA', name: 'Alfa Dollars', icon: '/logos/alfa.jpg', color: '#10b981', desc: 'Send via Alfa credit transfer', min: 3, scale: 1.2, clipPath: 'inset(26%)', bgColor: '#DA1E28' },
        { id: 'MTC', name: 'Touch / MTC Dollars', icon: '/logos/touch.png', color: '#3b82f6', desc: 'Send via Touch credit transfer', min: 3, scale: 1.15 },
        { id: 'BINANCE', name: 'Binance (Manual)', icon: '/logos/binance.png', color: '#F0B90B', desc: 'Send via Binance ID (manual)', min: 1 },
    ];

    const selectedGateway = GATEWAYS.find(g => g.id === method);
    const MIN_AMOUNT = selectedGateway?.min ?? 5;
    
    // Whish and Dollar methods don't need an amount input - they are direct
    const isDirectMethod = ['WHISH', 'OMT', 'ALFA', 'MTC', 'BINANCE'].includes(method);

    const handleSubmit = () => {
        if (!isDirectMethod && amount < MIN_AMOUNT) return;
        setSubmitted(true);
    };

    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text);
        showToast(`${label} copied!`);
    };

    const submitVerification = () => {
        if (!transactionId.trim()) return;
        setVerifying(true);
        setTimeout(() => {
            setVerifying(false);
            setVerificationSuccess(true);
            setTimeout(() => {
                setVerificationSuccess(false);
                setSubmitted(false);
                setTransactionId('');
                setAmount(10);
            }, 3000);
        }, 1500);
    };

    return (
        <div className="container" style={{ paddingBottom: '64px' }}>
            <header style={{ padding: '48px 0 24px 0', marginBottom: '32px', borderBottom: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '6px' }}>Add Funds</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Load up your balance to buy or renew any plan.</p>
                    </div>
                    <div className="glass-panel" style={{ padding: '10px 20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Balance</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>${balance.toFixed(2)}</span>
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '28px' }}>
                {/* Left: Form */}
                <div className="glass-panel" style={{ padding: '28px' }}>
                    {!submitted ? (
                        <>
                            {!isDirectMethod && (
                                <div style={{ marginBottom: '28px' }}>
                                    <h2 style={{ fontSize: '1.1rem', marginBottom: '14px', fontWeight: 700 }}>1. Enter Amount</h2>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Amount (USD)</label>
                                        <input
                                            type="number"
                                            min={MIN_AMOUNT}
                                            value={amount}
                                            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                                            placeholder={`Min. $${MIN_AMOUNT}`}
                                            style={{
                                                width: '100%', padding: '14px', background: 'var(--bg-input)',
                                                border: '1px solid var(--glass-border)', borderRadius: '10px',
                                                color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box'
                                            }}
                                        />
                                        {(method === 'ALFA' || method === 'MTC') && (
                                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                                                💡 1 Alfa/Touch Dollar = <strong style={{ color: 'var(--text-primary)' }}>$0.75</strong>. Min: <strong style={{ color: 'var(--text-primary)' }}>$3</strong>.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div>
                                <h2 style={{ fontSize: '1.1rem', marginBottom: '14px', fontWeight: 700 }}>{isDirectMethod ? '1. Select Payment method' : '2. Select Payment method'}</h2>
                                <div style={{ position: 'relative', marginBottom: '28px' }}>
                                    {/* Dropdown Header */}
                                    <button
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '14px', padding: '14px',
                                            borderRadius: '10px', width: '100%',
                                            border: `1px solid ${selectedGateway.color}`,
                                            background: `${selectedGateway.color}12`,
                                            color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, boxShadow: `0 4px 12px ${selectedGateway.color}40`, background: selectedGateway.bgColor || 'transparent' }}>
                                            <img src={selectedGateway.icon} alt={selectedGateway.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: selectedGateway.scale ? `scale(${selectedGateway.scale})` : 'none', clipPath: selectedGateway.clipPath || 'none' }} />
                                        </div>
                                        <div style={{ textAlign: 'left', flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedGateway.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1px' }}>{selectedGateway.desc}</div>
                                        </div>
                                        <ChevronDown size={20} color="var(--text-secondary)" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </button>

                                    {/* Dropdown Options */}
                                    {isDropdownOpen && (
                                        <>
                                            <div 
                                                style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
                                                onClick={() => setIsDropdownOpen(false)} 
                                            />
                                            <div style={{ 
                                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                                marginTop: '8px', background: 'var(--bg-elevated)', 
                                                border: '1px solid var(--glass-border)', borderRadius: '12px',
                                                boxShadow: '0 10px 25px rgba(0,0,0,0.5)', overflow: 'hidden'
                                            }}>
                                                {GATEWAYS.map((gateway, index) => {
                                                    const isSelected = method === gateway.id;
                                                    const isLast = index === GATEWAYS.length - 1;
                                                    return (
                                                        <button
                                                            key={gateway.id}
                                                            onClick={() => { setMethod(gateway.id); setIsDropdownOpen(false); }}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', width: '100%',
                                                                background: isSelected ? 'var(--bg-input)' : 'transparent',
                                                                border: 'none', borderBottom: isLast ? 'none' : '1px solid var(--glass-border)',
                                                                color: 'var(--text-primary)', cursor: 'pointer', transition: 'background 0.15s',
                                                                textAlign: 'left'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-input)'}
                                                            onMouseLeave={(e) => e.currentTarget.style.background = isSelected ? 'var(--bg-input)' : 'transparent'}
                                                        >
                                                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: gateway.bgColor || 'transparent' }}>
                                                                <img src={gateway.icon} alt={gateway.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: gateway.scale ? `scale(${gateway.scale})` : 'none', clipPath: gateway.clipPath || 'none' }} />
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{gateway.name}</div>
                                                            </div>
                                                            {isSelected && <CheckCircle2 size={16} color={gateway.color} />}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleSubmit}
                                className="btn-primary"
                                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '14px', fontSize: '1rem' }}
                            >
                                {isDirectMethod ? 'View Payment Instructions' : `Get Instructions for $${amount.toFixed(2)}`}
                                <ArrowRight size={16} />
                            </button>
                        </>
                    ) : (
                        <div style={{ padding: '0' }}>
                            {verificationSuccess ? (
                                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                    <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
                                    <h2 style={{ color: '#10b981', fontSize: '1.4rem', marginBottom: '8px' }}>Payment Verified!</h2>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                                        ${amount.toFixed(2)} has been added to your balance.
                                    </p>
                                </div>
                            ) : method === 'BINANCE_AUTO' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
                                    {/* Header & Close */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '12px 0', borderBottom: '1px solid var(--glass-border)' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Binance internal transfer</h3>
                                        <button onClick={() => setSubmitted(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={20} /></button>
                                    </div>

                                    {/* Progress Bar */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '32px', padding: '0 40px' }}>
                                        <div style={{ position: 'absolute', top: '15px', left: '40px', right: '40px', height: '2px', background: 'var(--glass-border)', zIndex: 1 }} />
                                        <div style={{ position: 'absolute', top: '15px', left: '40px', width: binanceStep === 2 ? '100%' : '50%', height: '2px', background: 'var(--accent-primary)', zIndex: 2, transition: 'width 0.3s ease' }} />
                                        
                                        <div style={{ zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: binanceStep >= 1 ? 'var(--accent-primary)' : 'var(--bg-input)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}>1</div>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: binanceStep >= 1 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>Make payment</span>
                                        </div>
                                        <div style={{ flex: 1 }} />
                                        <div style={{ zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: binanceStep >= 2 ? 'var(--accent-primary)' : 'var(--bg-input)', border: binanceStep < 2 ? '2px solid var(--glass-border)' : 'none', color: binanceStep >= 2 ? '#fff' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}>2</div>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: binanceStep >= 2 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>Verify payment</span>
                                        </div>
                                    </div>

                                    {/* Step 1 Content */}
                                    {binanceStep === 1 ? (
                                        <div style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease' }}>
                                            <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '24px' }}>
                                                {amount} <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>USDT</span>
                                            </div>

                                            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Send to Binance ID</label>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <div style={{ flex: 1, padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--glass-border)', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, letterSpacing: '0.02em' }}>
                                                        {BINANCE_PAY_ID}
                                                    </div>
                                                    <button 
                                                        onClick={() => { navigator.clipboard.writeText(BINANCE_PAY_ID); showToast('ID Copied!'); }}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem' }}
                                                    >
                                                        <FileDigit size={14} /> Copy
                                                    </button>
                                                </div>
                                            </div>

                                            <div style={{ background: 'var(--bg-input)', padding: '24px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '32px' }}>
                                                <div style={{ width: '160px', height: '160px', background: '#fff', margin: '0 auto 20px auto', padding: '10px', borderRadius: '8px' }}>
                                                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${BINANCE_PAY_ID}`} alt="Binance QR" style={{ width: '100%', height: '100%' }} />
                                                </div>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                                    1. Scan the QR using the Binance app or send funds using the Binance ID.<br/>
                                                    2. After completing the payment tap "Confirm payment".
                                                </p>
                                            </div>

                                            <button 
                                                onClick={() => setBinanceStep(2)} 
                                                className="btn-primary" 
                                                style={{ width: '100%', padding: '16px', fontSize: '1rem' }}
                                            >
                                                Confirm payment
                                            </button>
                                        </div>
                                    ) : (
                                        /* Step 2 Content */
                                        <div style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginBottom: '24px', padding: '16px', background: 'var(--bg-input)', borderRadius: '10px' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Amount</div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{amount} USDT</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Send to Binance ID</div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {BINANCE_PAY_ID} <FileDigit size={12} color="var(--accent-primary)" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>Enter you Binance Order ID</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Enter Order ID" 
                                                    value={transactionId}
                                                    onChange={(e) => setTransactionId(e.target.value)}
                                                    style={{ width: '100%', padding: '14px', background: 'var(--bg-input)', border: '2px solid var(--accent-primary)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none' }}
                                                />
                                            </div>

                                            <div style={{ background: 'var(--bg-input)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '32px' }}>
                                                <div style={{ width: '100%', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                                                    {/* Screenshot guidance placeholder */}
                                                    <img src="https://placehold.co/400x200/181a20/ffffff?text=Binance+Success+Screen+Guide" alt="Guide" style={{ width: '100%', opacity: 0.8 }} />
                                                </div>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, textAlign: 'left', margin: 0 }}>
                                                    1. Copy the <strong>Order ID</strong> from the successful payment details in your Binance account.<br/>
                                                    2. Paste it into the field above and tap "Verify payment".
                                                </p>
                                            </div>

                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button onClick={() => setBinanceStep(1)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
                                                <button 
                                                    disabled={!transactionId || verifying}
                                                    onClick={submitVerification}
                                                    className="btn-primary" 
                                                    style={{ flex: 2, padding: '14px' }}
                                                >
                                                    {verifying ? 'Verifying...' : 'Verify payment'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Payment Details</h2>
                                        <button onClick={() => setSubmitted(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={20} /></button>
                                    </div>

                                    <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '24px', border: '1px solid var(--glass-border)', marginBottom: '24px', textAlign: 'center' }}>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
                                            Send the amount you want to top up to:
                                        </p>
                                        
                                        <div style={{ marginBottom: '24px' }}>
                                            <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Recipient Phone</label>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '4px' }}>
                                                <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.04em', color: selectedGateway.color }}>{displayNumber}</div>
                                                <button onClick={() => copyToClipboard(displayNumber, 'Number')} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}><FileDigit size={18} /></button>
                                            </div>
                                        </div>
                                        
                                        {method === 'WHISH' && (
                                            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                                                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Payment Note (REQUIRED)</label>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 10px 0' }}>Enter this number in the "Note" field to credit your account automatically.</p>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                                    <div style={{ 
                                                        fontSize: '1.6rem', fontWeight: 800, color: '#fff', 
                                                        background: `${selectedGateway.color}20`, padding: '10px 20px', 
                                                        borderRadius: '8px', border: `1px dashed ${selectedGateway.color}`,
                                                    }}>
                                                        {user?.phone?.replace('+961', '') || 'Your Number'}
                                                    </div>
                                                    <button onClick={() => copyToClipboard(user?.phone?.replace('+961', '') || '', 'Note')} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '10px', cursor: 'pointer', color: 'var(--text-primary)' }}><FileDigit size={18} /></button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ marginBottom: '28px' }}>
                                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Clock size={16} color="var(--accent-primary)" /> What happens next?
                                        </h3>
                                        <ul style={{ padding: 0, margin: 0, listStyle: 'none', color: 'var(--text-secondary)', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <li style={{ display: 'flex', gap: '8px' }}><CheckCircle2 size={14} color="#10b981" style={{ marginTop: '2px', flexShrink: 0 }} /> For Whish: Your balance will update <strong>instantly</strong> after you send.</li>
                                            <li style={{ display: 'flex', gap: '8px' }}><CheckCircle2 size={14} color="#10b981" style={{ marginTop: '2px', flexShrink: 0 }} /> For Dollars: Send a screenshot on WhatsApp for faster verification.</li>
                                        </ul>
                                    </div>

                                    <a
                                        href={`https://wa.me/${waNumber}?text=Hello! I just transferred via ${method} for my account (${user?.phone}). Please check it.`}
                                        target="_blank" rel="noopener noreferrer" className="btn-primary"
                                        style={{ width: '100%', background: '#22c55e', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 600, padding: '14px', fontSize: '1rem' }}
                                    >
                                        <MessageCircle size={20} /> I have paid - Chat with Support
                                    </a>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Right: Info */}
                {!submitted && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="glass-panel" style={{ padding: '24px' }}>
                            <Wallet size={20} color="var(--accent-primary)" style={{ marginBottom: '12px' }} />
                            <h3 style={{ fontSize: '1.05rem', marginBottom: '8px', fontWeight: 700 }}>Tracking Your Payment</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                                We track payments using the <strong>Phone Number</strong> you provided during Sign Up. Please ensure the transfer is sent from the same number or maintain the receipt of transfer.
                            </p>
                        </div>
                        <div className="glass-panel" style={{ padding: '24px', background: 'rgba(59,130,246,0.03)', borderColor: 'rgba(59,130,246,0.1)' }}>
                            <ShieldCheck size={20} color="#3b82f6" style={{ marginBottom: '12px' }} />
                            <h3 style={{ fontSize: '1.05rem', marginBottom: '8px', fontWeight: 700 }}>Secure Transactions</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                                All transactions are securely monitored. Fake receipts or invalid transaction IDs may lead to account suspension.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TopUp;
