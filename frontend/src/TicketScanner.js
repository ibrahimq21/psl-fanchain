import React, { useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import './TicketScanner.css';

const API_URL = 'http://localhost:3003';

function TicketScanner() {
  const [scanResult, setScanResult] = useState(null);
  const [verification, setVerification] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const scannerRef = React.useRef(null);

  // WireFluid network config
  const WIREFLUID_CHAIN = {
    chainId: '0x169D9', // 92533 in hex
    chainName: 'WireFluid Testnet',
    nativeCurrency: { name: 'WIRE', symbol: 'WIRE', decimals: 18 },
    rpcUrls: ['https://evm.wirefluid.com'],
    blockExplorerUrls: []
  };

  // Connect wallet & add network
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask not installed!');
      return;
    }
    try {
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWalletConnected(accounts.length > 0);

      // Try to add WireFluid network
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [WIREFLUID_CHAIN]
        });
      } catch (addErr) {
        // Network may already exist or user rejected
        console.log('Add network:', addErr.message);
      }
    } catch (err) {
      alert('Wallet connection failed: ' + err.message);
    }
  };

  // Get user location
  React.useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 31.5204, lng: 74.3587 }) // Default Lahore
      );
    }
  }, []);

  const startScanner = async () => {
    setScannerActive(true);
    try {
      const element = document.getElementById('ticket-reader');
      if (!element) return;
      
      element.innerHTML = '<div id="ticket-video" style="width:100%;height:250px;background:#000;border-radius:10px;"></div>';
      
      const qrCode = new Html5Qrcode('ticket-video');
      scannerRef.current = qrCode;
      
      await qrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          qrCode.stop();
          setScanResult(decodedText);
          setScannerActive(false);
          verifyTicket(decodedText);
        },
        () => {}
      );
    } catch (err) {
      setScannerActive(false);
      alert('Camera error: ' + err.message);
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }
    } catch (e) {}
    setScannerActive(false);
  };

  const verifyTicket = async (qrData) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/tickets/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrData,
          lat: userLocation?.lat || 31.5204,
          lng: userLocation?.lng || 74.3587,
          deviceId: 'verifier-001'
        })
      });
      const data = await res.json();
      setVerification(data);
    } catch (err) {
      setVerification({ valid: false, reason: 'Network error' });
    }
    setLoading(false);
  };

  const manualVerify = () => {
    const testTicket = prompt('Enter ticket QR data (or use demo):', scanResult || 'TKT-123|band_concert_lhr|abc123');
    if (testTicket) {
      setScanResult(testTicket);
      verifyTicket(testTicket);
    }
  };

  return (
    <div className="ticket-scanner">
      <div className="header-row">
        <h2>🎫 Ticket Verification</h2>
        <button className="wallet-btn" onClick={connectWallet}>
          {walletConnected ? '✅ Wallet Connected' : '🔗 Connect Wallet'}
        </button>
      </div>
      
      <div className="location-info">
        <span>📍 Your Location:</span>
        <span className="coords">
          {userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : 'Getting...'}
        </span>
      </div>

      <div className="scanner-area">
        <div id="ticket-reader" className="reader-box">
          {!scannerActive && !scanResult && (
            <div className="placeholder">
              <span className="icon">🎫</span>
              <p>Camera inactive</p>
            </div>
          )}
        </div>
        
        <div className="scanner-controls">
          {!scannerActive ? (
            <button className="scan-btn" onClick={startScanner}>
              📷 Start Camera
            </button>
          ) : (
            <button className="stop-btn" onClick={stopScanner}>
              ⏹️ Stop
            </button>
          )}
          <button className="manual-btn" onClick={manualVerify}>
            ⌨️ Manual Entry
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Verifying ticket...</p>
        </div>
      )}

      {verification && !loading && (
        <div className={`result ${verification.valid && verification.entryAllowed ? 'success' : 'failed'}`}>
          <div className="result-header">
            {verification.valid && verification.entryAllowed ? (
              <>
                <span className="icon">✅</span>
                <h3>ENTRY ALLOWED</h3>
              </>
            ) : (
              <>
                <span className="icon">❌</span>
                <h3>ENTRY DENIED</h3>
              </>
            )}
          </div>
          
          <div className="result-details">
            <p><strong>Reason:</strong> {verification.reason}</p>
            {verification.venue && (
              <>
                <p><strong>Venue:</strong> {verification.venue.name}</p>
                <p><strong>Distance:</strong> {verification.distance}m {verification.inGeoFence ? '✓' : '✗'}</p>
              </>
            )}
            <p><strong>Risk Score:</strong> {verification.riskScore || 0}/100</p>
            <p><strong>Verified:</strong> {new Date().toLocaleTimeString()}</p>
          </div>

          {verification.ticket && (
            <div className="ticket-info">
              <p><strong>Ticket ID:</strong> {verification.ticket.ticketId}</p>
              <p><strong>Event:</strong> {verification.ticket.eventId}</p>
              <p><strong>Status:</strong> {verification.ticket.status}</p>
            </div>
          )}

          <button className="reset-btn" onClick={() => { setScanResult(null); setVerification(null); }}>
            🔄 Scan Another
          </button>
        </div>
      )}

      <div className="instructions">
        <h4>How it works:</h4>
        <ol>
          <li>📷 Scan ticket QR code with camera</li>
          <li>📍 System validates your location vs venue</li>
          <li>🔒 Ticket signature is verified</li>
          <li>✅ One-time use prevents sharing</li>
        </ol>
      </div>
    </div>
  );
}

export default TicketScanner;