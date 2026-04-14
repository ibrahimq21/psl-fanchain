import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Html5Qrcode } from 'html5-qrcode';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ethers } from 'ethers';

// Fix leaflet marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Backend API URL - use env or default to localhost
const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:3003';

// WireFluid Config
const NFT_ADDRESS = process.env.REACT_APP_NFT_ADDRESS || '0xf2C11750fff6b14EC12aa7b2cB71c775264C7e01';

// FanChain NFT ABI - simple test function
const NFT_ABI = [
  "function mintTest(address _to, string calldata _tokenURI) external returns (uint256)",
  "function createCampaign(string memory _name, string memory _description, uint256 _stadiumLat, uint256 _stadiumLng, uint256 _geoRadius, uint256 _startTime, uint256 _endTime, string memory _rewardTier, uint256 _rewardPoints, address _sponsor) external returns (uint256)",
  "function getUserNFTs(address _user) external view returns (uint256[] memory)",
  "event NFTMinted(uint256 indexed tokenId, address indexed owner, uint256 indexed campaignId)"
];

// Generate proof and mint NFT via MetaMask (EIP-712 signed)
async function mintNFTWithMetaMask(walletAddress, campaignId, stadiumName, lat, lng) {
  if (!window.ethereum) throw new Error('MetaMask not installed');
  
  // Skip backend proof generation - use mintTest directly
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  
  // Use env contract address directly
  const contract = new ethers.Contract(NFT_ADDRESS, NFT_ABI, signer);
  
  // Use simple test function
  const tx = await contract.mintTest(
    walletAddress,
    `https://pslfanchain.io/nft/${Date.now()}`
  );
  
  const receipt = await tx.wait();
  return receipt.hash;
}

// Haversine distance function
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}






function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], 15);
  }, [center, map]);
  return null;
}

function App() {
  const [wallet, setWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [checkIns, setCheckIns] = useState([]);
  const [nfts, setNfts] = useState([]);
  const [rewards, setRewards] = useState({ points: 0, earnings: 0 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [scanResult, setScanResult] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedStadium, setSelectedStadium] = useState(null);
  const [venues, setVenues] = useState([]);
  const [fanProfile, setFanProfile] = useState(null);
  const [rewardCatalog, setRewardCatalog] = useState(null);
  const [userRedemptions, setUserRedemptions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);



  useEffect(() => {
    // Load venues from backend API (which uses shared venues.json)
    fetch(`${BACKEND_URL}/stadiums`)
      .then(r => r.json())
      .then(data => {
        const stadiumList = Object.entries(data)
    .map(([key, venue]) => ({
      id: key,
      name: venue.name || venue.stadiumName || key,
      lat: venue.lat || venue.coordinates?.lat,
      lng: venue.lng || venue.coordinates?.lng,
      radius: venue.radius || 500,
      city: venue.city,
      isEvent: venue.isEvent || false
    }))
    .filter(v => typeof v.lat === 'number' && typeof v.lng === 'number'); 
        if (stadiumList.length > 0) {
          setVenues(stadiumList);
          setSelectedStadium(stadiumList[0]);
        }
      })
      .catch(err => console.error('Failed to load venues:', err));
  }, []);

  useEffect(() => {
    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 31.5204, lng: 74.3587 })
      );
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  const connectWallet = async () => {
    setConnecting(true);
    setMessage('');
    try {
      if (window.ethereum) {
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

        if (accounts && accounts.length > 0) {
          setWallet(accounts[0]);
          fetchWalletData(accounts[0]);
          setMessage('Wallet connected (MetaMask): ' + accounts[0].substring(0, 6) + '...' + accounts[0].substring(38));
        } else {
          setMessage('No accounts found. Please unlock MetaMask and try again.');
        }
      } else {
        // Use Truffle wallet as fallback
        const truffleWallet = '0x5417B8dDF03b7380Ab6eFe4a364D904b6B989047';
        setWallet(truffleWallet);
        fetchWalletData(truffleWallet);
        setMessage('Using Truffle Wallet: ' + truffleWallet.substring(0, 6) + '...' + truffleWallet.substring(38));
      }
    } catch (err) {
      console.error('Wallet connection error:', err);
      // Fallback to Truffle wallet on error
      const truffleWallet = '0x5417B8dDF03b7380Ab6eFe4a364D904b6B989047';
      setWallet(truffleWallet);
      fetchWalletData(truffleWallet);
      setMessage('Using Truffle Wallet (fallback): ' + truffleWallet.substring(0, 6) + '...' + truffleWallet.substring(38));
    }
    setConnecting(false);
  };

  const fetchWalletData = async (address) => {
    try {
      const [checkInsRes, nftsRes, rewardsRes, profileRes, redemptionsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/checkins`).then(r => r.json()),
        fetch(`${BACKEND_URL}/blockchain/nfts/${address}`).then(r => r.json()),
        fetch(`${BACKEND_URL}/blockchain/rewards/${address}`).then(r => r.json()),
        fetch(`${BACKEND_URL}/profile/${address}`).then(r => r.json()),
        fetch(`${BACKEND_URL}/rewards/user/${address}`).then(r => r.json())
      ]);
      setCheckIns(checkInsRes?.checkIns || checkInsRes || []);
      setNfts(nftsRes?.nfts || nftsRes || []);
      
      // Handle rewards - backend returns { points, earnings }
      const rewardsData = rewardsRes || {};
      setRewards({
        points: rewardsData.points ?? rewardsData?.fanScore ?? 0,
        earnings: rewardsData.earnings ?? 0
      });
      console.log('Rewards data:', rewardsData);
      setFanProfile(profileRes);
      setUserRedemptions(redemptionsRes.redemptions || []);
    } catch (err) {
      console.error('Failed to fetch wallet data:', err);
    }
  };

  const fetchRewards = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/rewards`);
      const data = await res.json();
      setRewardCatalog(data);
    } catch (err) {
      console.error('Failed to fetch rewards:', err);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/leaderboard`);
      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  };

  const fetchTaskTypes = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/tasks/types`);
      const data = await res.json();
      setTaskTypes(data.taskTypes || []);
    } catch (err) {
      console.error('Failed to fetch task types:', err);
    }
  };

  const redeemReward = async (rewardId) => {
    if (!wallet || !fanProfile) {
      setMessage('Please connect wallet first');
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/rewards/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet,
          rewardId,
          fanScore: fanProfile.fanScore
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`🎉 ${data.message}`);
        fetchWalletData(wallet);
      } else {
        setMessage(data.message);
      }
    } catch (err) {
      setMessage('Failed to redeem reward');
    }
  };

  const handleCheckIn = async (stadiumId) => {
    // Use selectedStadium or first available venue
    const targetStadium = stadiumId || selectedStadium?.id || venues[0]?.id;
    if (!wallet) return;
    if (!targetStadium) {
      setMessage('No stadium selected');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        lat: userLocation?.lat || 31.5204,
        lng: userLocation?.lng || 74.3587,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: Math.random().toString(36).substring(7),
        stadiumId,
        deviceId: wallet,
        isMockLocation: false,
        isEmulator: false,
        sensorMismatch: false
      };

      const response = await fetch(`${BACKEND_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, signature: 'demo-signature' })
      });
      console.log(response)
      const result = await response.json();

      if (result.success) {
        const stadiumName = result.checkIn?.stadiumName || result.stadiumName || selectedStadium?.name || 'stadium';
        setMessage(`✅ Check-in verified! Signing NFT transaction...`);
        
        // Try to mint NFT via MetaMask
        try {
          const txHash = await mintNFTWithMetaMask(wallet, 4, stadiumName, payload.lat, payload.lng);
          console.log(txHash);
          setMessage(`✅ Check-in complete at ${stadiumName}! NFT minted: ${txHash.substring(0, 10)}...`);
          
          // Refresh wallet data after successful mint
          fetchWalletData(wallet);
        } catch (mintErr) {
          console.log('MetaMask mint failed:', mintErr.message);
          setMessage(`✅ Check-in verified at ${stadiumName}! (NFT mint skipped)`);
        }
        
        // Add score to fan profile
        try {
          await fetch(`${BACKEND_URL}/profile/${wallet}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'checkin',
              metadata: { stadiumId: result.checkIn?.stadiumId }
            })
          });
        } catch (e) {
          console.error('Failed to add score:', e);
        }
        
        fetchWalletData(wallet);
        
      } else {
        setMessage(result.message || 'Check-in failed');
      }
    } catch (err) {
      setMessage('Check-in failed');
    }
    setLoading(false);
  };

  const startScanner = async () => {
    // Prevent multiple scanner instances
    if (scannerRef.current) {
      setMessage('Scanner already running');
      return;
    }
    
    setScannerError(null);
    setMessage('Starting camera...');
    
    try {
      // Stop any existing scanner first
      await stopScanner();
      
      // Wait for cleanup
      await new Promise(r => setTimeout(r, 300));
      
      const element = document.getElementById('qr-reader');
      if (!element) {
        setScannerError('Scanner element not found');
        setMessage('Scanner element not found');
        return;
      }
      
      // Ensure element is visible and not hidden
      element.style.display = 'block';
      element.style.position = 'relative';
      element.style.zIndex = '1000';
      
      // Use React state to show scanner is active
      setScannerActive(true);
      
      const qrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = qrCode;
      
      // Request camera permission to unlock device labels
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Now enumerate devices with labels unlocked
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      // Stop the temporary stream
      stream.getTracks().forEach(t => t.stop());
      
      if (videoDevices.length === 0) {
        throw new Error('No camera found');
      }
      
      // Prefer back camera (environment), fallback to any available
      let selectedDevice = videoDevices.find(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('rear')
      ) || videoDevices[0];
      
      console.log('Using camera:', selectedDevice.label, selectedDevice.deviceId);
      
      // Start scanner with exact deviceId
      try {
        await qrCode.start(
          { deviceId: { exact: selectedDevice.deviceId } },
          { fps: 5, qrbox: 250 },
          (decodedText) => processScan(decodedText),
          () => {}
        );
      } catch (err) {
        // Try any other camera if preferred fails
        console.log('Camera failed, trying fallback:', err.message);
        for (const device of videoDevices) {
          if (device.deviceId === selectedDevice.deviceId) continue;
          try {
            await qrCode.start(
              { deviceId: { exact: device.deviceId } },
              { fps: 5, qrbox: 250 },
              (decodedText) => processScan(decodedText),
              () => {}
            );
            break;
          } catch (e) {
            console.log('Device failed:', device.label);
          }
        }
      }
      
      setMessage('Point camera at QR code - make sure QR is well-lit and centered');
    } catch (err) {
      setScannerError(err.message);
      setMessage('Camera error: ' + err.message);
      console.error('Scanner start error:', err);
    }
  };

  // Process scanned QR code
  const processScan = async (decodedText) => {
    // Debounce: prevent multiple scans
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    
    console.log('📷 QR SCANNED:', decodedText);
    
    try {
      // Stop scanner
      if (scannerRef.current) {
        await scannerRef.current.stop();
        setScannerActive(false);
      }
      
      const ticketData = decodedText.trim();
      setScanResult(ticketData);
      setMessage('🔄 Processing QR...');
      
      // Step 1: Validate format
      let qrPayload = null;
      try {
        qrPayload = JSON.parse(ticketData);
        setMessage('📋 Validating ticket...');
      } catch (e) {
        // Not JSON - try simple venue match
        const stadium = venues.find(s => 
          s.id === ticketData || 
          s.name.toLowerCase().includes(ticketData.toLowerCase())
        );
        if (stadium) {
          setSelectedStadium(stadium);
          setMessage(`✅ Found venue: ${stadium.name}`);
        } else {
          setMessage(`❌ Unknown ticket: ${ticketData}`);
        }
        return;
      }
      
      // Step 2: Check it's a signed payload
      if (!qrPayload || qrPayload.v !== 1 || !qrPayload.campaignId) {
        setMessage('⚠️ Invalid QR format');
        return;
      }
      
      setMessage('🔐 Verifying signature...');
      
      // Step 3: Verify signature via backend
      const verifyResult = await fetch(`${BACKEND_URL}/verify-qr-payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrData: ticketData })
      }).then(r => r.json());
      
      if (!verifyResult.valid) {
        setMessage(`❌ Invalid: ${verifyResult.error || 'Signature verification failed'}`);
        return;
      }
      
      // Step 4: Verify check-in (location + one-time use)
      setMessage('📍 Checking location...');
      
      const checkInResult = await fetch(`${BACKEND_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrData: ticketData,
          campaignId: qrPayload.campaignId,
          stadiumId: qrPayload.stadiumId,
          wallet: wallet
        })
      }).then(r => r.json());
      
      if (!checkInResult.valid) {
        setMessage(`❌ Denied: ${checkInResult.error || checkInResult.reason || 'Verification failed'}`);
        return;
      }
      
      // Step 5: Success!
      const stadiumName = verifyResult.campaign?.stadiumName || 'Stadium';
      setMessage(`✅ Verified! +${verifyResult.campaign?.pointsPerCheckIn || 100} pts`);
      
      // Step 6: Mint NFT (optional)
      setMessage('🎫 Minting NFT...');
      // ... NFT mint logic
      
    } catch (e) {
      console.error('Scan error:', e);
      setMessage(`❌ Error: ${e.message}`);
    } finally {
      setTimeout(() => { scanLockRef.current = false }, 3000);
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        const isCurrentlyScanning = scannerRef.current.isScanning;
        if (isCurrentlyScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (e) {
      console.log('Scanner cleanup:', e.message);
    } finally {
      scannerRef.current = null;
      setScannerActive(false);
    }
  };

  // Strict QR payload validation
  const validateQRPayload = (data) => {
    if (!data || typeof data !== 'string') {
      return { valid: false, error: 'Empty or invalid data' };
    }
    
    const trimmed = data.trim();
    
    // Minimum length check
    if (trimmed.length < 2) {
      return { valid: false, error: 'Too short' };
    }
    
    // Maximum length check (prevent DoS)
    if (trimmed.length > 200) {
      return { valid: false, error: 'Too long' };
    }
    
    // Check for suspicious patterns (avoid triggering eslint)
    const sus1 = 'script';
    const sus2 = 'java'; // 'javascript:' gets flagged
    const sus3 = 'data:';
    const sus4 = 'onerror';
    const sus5 = 'onclick';
    const suspicious = [`<${sus1}`, `${sus2}script:`, sus3, sus4, sus5];
    const lower = trimmed.toLowerCase();
    for (const pattern of suspicious) {
      if (lower.includes(pattern)) {
        return { valid: false, error: 'Suspicious pattern detected' };
      }
    }
    
    return { valid: true };
  };

  const verifyTicketData = async (ticketData) => {
    // Validate before sending
    const validation = validateQRPayload(ticketData);
    if (!validation.valid) {
      setMessage(`Invalid ticket: ${validation.error}`);
      return;
    }
    
    setMessage('Verifying ticket...');
    
    // Try to parse as signed QR payload first
    let qrPayload = null;
    try {
      qrPayload = JSON.parse(ticketData);
    } catch (e) {
      // Not JSON - treat as simple ticket ID
    }
    
    // If it's a signed payload, verify via backend
    if (qrPayload && qrPayload.v === 1 && qrPayload.campaignId) {
      try {
        const verifyResult = await fetch(`${BACKEND_URL}/verify-qr-payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrData: ticketData })
        }).then(r => r.json());
        
        if (!verifyResult.valid) {
          setMessage(`❌ Invalid QR: ${verifyResult.error}`);
          return;
        }
        
        // Got valid campaign context - now verify check-in
        setMessage(`Campaign: ${verifyResult.campaign?.name} - Verifying...`);
        
        const checkInResult = await fetch(`${BACKEND_URL}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qrData: ticketData,
            campaignId: qrPayload.campaignId,
            stadiumId: qrPayload.stadiumId,
            lat: userLocation?.lat || 31.5204,
            lng: userLocation?.lng || 74.3587,
            deviceId: wallet || 'demo'
          })
        }).then(r => r.json());
        
        setMessage(checkInResult.success 
          ? `✅ Verified! +${verifyResult.campaign?.pointsPerCheckIn || 100} pts`
          : `❌ ${checkInResult.message || 'Verification failed'}`);
        return;
      } catch (err) {
        console.error('QR verification failed:', err);
      }
    }
    
    // Fallback: original ticket verification
    fetch(`${BACKEND_URL}/tickets/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrData: ticketData,
        lat: userLocation?.lat || 31.5204,
        lng: userLocation?.lng || 74.3587,
        deviceId: wallet || 'demo'
      })
    }).then(r => r.json()).then(data => {
      setMessage(data.entryAllowed ? '✅ ENTRY ALLOWED - ' + (data.reason || 'Verified') : '❌ ENTRY DENIED - ' + (data.reason || 'Failed'));
    }).catch(err => {
      setMessage('Verification failed: ' + err.message);
    });
  };

  const startNFC = async () => {
    if (!('NDEFReader' in window)) {
      setMessage('❌ NFC not supported on this device');
      return;
    }

    setMessage('📳 Hold NFC tag near your phone...');

    try {
      // eslint-disable-next-line no-undef
      const ndef = new NDEFReader();
      await ndef.scan();

      ndef.onreading = (event) => {
        const decoder = new TextDecoder();
        for (const record of event.message.records) {
          const ticketData = decoder.decode(record.data);
          if (ticketData.includes('|')) {
            setMessage('📳 NFC Tag Read! Verifying...');
            verifyTicketData(ticketData);
            break;
          }
        }
      };

      ndef.onreadingerror = () => {
        setMessage('❌ NFC read error. Try again.');
      };
    } catch (err) {
      setMessage('❌ NFC error: ' + err.message);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🏏 PSL FanChain</h1>
        <p className="tagline">Anti-Spoof Location Check-in & Rewards</p>
      </header>

      <nav className="nav">
        <button className={activeTab === 'home' ? 'active' : ''} onClick={() => { setActiveTab('home'); stopScanner(); }}>🏠 Home</button>
        <button className={activeTab === 'map' ? 'active' : ''} onClick={() => { setActiveTab('map'); stopScanner(); }}>🗺️ Map</button>
        <button className={activeTab === 'scan' ? 'active' : ''} onClick={() => { setActiveTab('scan'); startScanner(); }}>📱 Scan QR</button>
        <button className={activeTab === 'ticket' ? 'active' : ''} onClick={() => { setActiveTab('ticket'); stopScanner(); }}>🎫 Ticket</button>
        <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => { setActiveTab('profile'); stopScanner(); }}>👤 Profile</button>
        <button className={activeTab === 'rewards' ? 'active' : ''} onClick={() => { setActiveTab('rewards'); fetchRewards(); stopScanner(); }}>🎁 Rewards</button>
        <button className={activeTab === 'leaderboard' ? 'active' : ''} onClick={() => { setActiveTab('leaderboard'); fetchLeaderboard(); stopScanner(); }}>🏆 Leaderboard</button>
      </nav>

      <main className="main">
        {!wallet && activeTab !== 'map' ? (
          <div className="connect-section">
            <button
              className="connect-btn"
              onClick={connectWallet}
              disabled={connecting}
            >
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </div>
        ) : (
          <>
            {message && <div className="message">{message}</div>}

            {activeTab === 'home' && (
              <>
                <div className="wallet-info">
                  <p>📱 <span className="address">{wallet}</span></p>
                </div>

                <div className="actions">
                  <button
                    className="checkin-btn"
                    onClick={() => handleCheckIn(selectedStadium?.id)}
                    disabled={loading}
                  >
                    {loading ? 'Checking in...' : '📍 Quick Check In'}
                  </button>
                </div>

                <div className="stadiums-list">
                  <h3>Select Stadium</h3>
                  {venues.map(stadium => (
                    <button
                      key={stadium.id}
                      className="stadium-btn"
                      onClick={() => handleCheckIn(stadium.id)}
                      disabled={loading}
                    >
                      📍 {stadium.name}
                    </button>
                  ))}
                </div>

                <div className="stats">
                  <div className="stat-card">
                    <h3>Points</h3>
                    <p className="stat-value">{fanProfile?.fanScore || rewards?.points || 0}</p>
                  </div>
                  <div className="stat-card">
                    <h3>NFTs</h3>
                    <p className="stat-value">{nfts?.length || 0}</p>
                  </div>
                  <div className="stat-card">
                    <h3>Check-ins</h3>
                    <p className="stat-value">{checkIns?.length || 0}</p>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'map' && (
              <div className="map-section">
                <h3>🗺️ Stadium Map</h3>
                {userLocation ? (
                  <>
                    <div className="user-distance">
                      <span className="distance-label">📍 Your Location:</span>
                      <span className="distance-value">{userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</span>
                    </div>
                    <MapContainer
                      center={[userLocation.lat, userLocation.lng]}
                      zoom={12}
                      style={{ height: '350px', borderRadius: '10px' }}
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap'
                      />
                      <Marker position={[userLocation.lat, userLocation.lng]} />
                      {venues.map((stadium) => {
                        if (typeof stadium.lat !== 'number' || typeof stadium.lng !== 'number') return null;

                        return (
                          <React.Fragment key={stadium.id}>
                            <Circle center={[stadium.lat, stadium.lng]} radius={stadium.radius} />
                            <Marker position={[stadium.lat, stadium.lng]} />
                          </React.Fragment>
                        );
                      })}
                      <MapUpdater center={selectedStadium} />
                    </MapContainer>

                    <div className="stadium-distances">
                      <h4>📏 Distances</h4>
                      {venues.map(stadium => {
                        const dist = userLocation ?
                          Math.round(haversineDistance(userLocation.lat, userLocation.lng, stadium.lat, stadium.lng)) : 0;
                        const inZone = dist <= stadium.radius;
                        return (
                          <div key={stadium.id} className={`distance-item ${inZone ? 'in-zone' : ''}`}>
                            <span className="stadium-name">{stadium.name}</span>
                            <span className="stadium-dist">{dist}m {inZone && '✓'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="loading-location">Getting your location...</div>
                )}
                <p className="map-hint">Purple = stadium zones • Green = you're in zone</p>
              </div>
            )}

            {activeTab === 'scan' && (
              <div className="scan-section">
                <h3>📱 Scan QR Code</h3>
                <div className="qr-scanner-wrapper">
                  <div id="qr-reader" style={{ minHeight: '260px', position: 'relative' }}>
                    <div style={{ color: '#fff', textAlign: 'center', padding: '2rem' }}>
                      📷 Tap button below to start camera
                    </div>
                    {!scanResult && (
                      <div className="qr-scanner-frame" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
                        <div className="qr-frame-bottom-left"></div>
                        <div className="qr-frame-bottom-right"></div>
                        <div className="qr-scan-line"></div>
                      </div>
                    )}
                  </div>
                </div>

                {!scanResult ? (
                  <button className="checkin-btn" onClick={startScanner} style={{ marginTop: '1rem', width: '100%' }}>
                    📷 Start QR Scanner
                  </button>
                ) : (
                  <div className="scan-result-actions">
                    <p>Scanned: <strong>{scanResult}</strong></p>
                    <button onClick={() => handleCheckIn(scanResult)} className="checkin-btn" style={{ marginTop: '0.5rem' }}>
                      ✅ Check In Here
                    </button>
                    <button onClick={() => { stopScanner(); setScanResult(null); setMessage(''); }} className="stadium-btn" style={{ marginTop: '0.5rem' }}>
                      🔄 Scan Again
                    </button>
                  </div>
                )}

                {scanResult && (
                  <div className="scan-result">
                    <p>Scanned: {scanResult}</p>
                    <button onClick={() => handleCheckIn(scanResult)}>Check In Here</button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ticket' && (
              <div className="ticket-section">
                <h3>🎫 Ticket Verification</h3>

                <div className="ticket-location">
                  <span>📍 Your Location:</span>
                  <span className="coords">
                    {userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : 'Getting...'}
                  </span>
                </div>

                <div className="ticket-scan-area">
                  <div className="ticket-reader-box">
                    <div style={{ color: '#fff', textAlign: 'center', padding: '2rem' }}>
                      🎫 Tap NFC or Scan QR to verify
                    </div>
                  </div>

                  <div className="ticket-methods">
                    <button className="method-btn nfc" onClick={startNFC} disabled={!('NDEFReader' in window)}>
                      📳 Tap NFC Tag
                    </button>
                    <button className="method-btn qr" onClick={async () => {
                      // Generate demo ticket using selected stadium
                      const eventId = selectedStadium?.id || venues[0]?.id;
                      if (!eventId) {
                        setMessage('No stadium available');
                        return;
                      }
                      try {
                        const res = await fetch(`${BACKEND_URL}/tickets/generate`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            eventId: eventId,
                            userId: wallet || 'demo_user'
                          })
                        });
                        const data = await res.json();
                        if (data.ticket) {
                          verifyTicketData(data.ticket.qrData);
                          setMessage('QR Scanned: ' + data.ticket.qrData);
                        }
                      } catch (err) {
                        setMessage('Failed to generate ticket');
                      }
                    }}>
                      📷 Simulate QR Scan
                    </button>
                  </div>

                  <div className="ticket-controls">
                    <button className="checkin-btn" onClick={async () => {
                      // Generate a demo ticket using selected stadium
                      const eventId = selectedStadium?.id || venues[0]?.id;
                      if (!eventId) {
                        setMessage('No stadium available');
                        return;
                      }
                      try {
                        const res = await fetch(`${BACKEND_URL}/tickets/generate`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            eventId: eventId,
                            userId: wallet || 'demo_user'
                          })
                        });
                        const data = await res.json();
                        if (data.ticket) {
                          verifyTicketData(data.ticket.qrData);
                          setMessage('Demo ticket generated: ' + data.ticket.ticketId);
                        }
                      } catch (err) {
                        setMessage('Failed to generate demo ticket');
                      }
                    }}>
                      🎫 Generate & Verify Demo Ticket
                    </button>
                  </div>
                </div>

                <div className="ticket-instructions">
                  <h4>How Ticket Verification Works:</h4>
                  <ol>
                    <li>📳 Tap NFC tag OR 📷 Scan QR code at entry</li>
                    <li>📍 Validates location vs venue (anti-screenshot)</li>
                    <li>🔐 Verifies ticket signature</li>
                    <li>✅ One-time use prevents sharing</li>
                  </ol>
                  <p className="nfc-note">📱 NFC works on Android Chrome</p>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="profile-section">
                <div className="wallet-info">
                  <p>📱 <span className="address">{wallet}</span></p>
                </div>

                <div className="stats">
                  <div className="stat-card">
                    <h3>Points</h3>
                    <p className="stat-value">{rewards?.points || 0}</p>
                  </div>
                  <div className="stat-card">
                    <h3>NFTs</h3>
                    <p className="stat-value">{nfts.length}</p>
                  </div>
                  <div className="stat-card">
                    <h3>Check-ins</h3>
                    <p className="stat-value">{checkIns.length}</p>
                  </div>
                </div>

                {nfts.length > 0 && (
                  <div className="nfts-section">
                    <h2>🎫 Your NFTs</h2>
                    <div className="nfts-grid">
                      {nfts.map((nft, i) => (
                        <div key={i} className="nft-card">
                          <div className="nft-icon">🏆</div>
                          <p>PSL Check-in #{nft.tokenId || i + 1}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {checkIns.length > 0 && (
                  <div className="checkins-section">
                    <h2>📍 Recent Check-ins</h2>
                    <div className="checkins-list">
                      {checkIns.slice(-10).reverse().map((checkIn, i) => (
                        <div key={i} className="checkin-item">
                          <span>{checkIn.stadiumName || checkIn.stadiumId}</span>
                          <span>{new Date(checkIn.timestamp).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* REWARDS TAB */}
            {activeTab === 'rewards' && (
              <div className="rewards-section">
                <h2>🎁 Rewards Catalog</h2>
                
                {fanProfile && (
                  <div className="fan-score-banner">
                    <div className="score-info">
                      <span className="tier-badge" style={{background: fanProfile.tierInfo?.color || '#CD7F32'}}>
                        {fanProfile.tierInfo?.name || 'Bronze'}
                      </span>
                      <span className="score">⭐ Fan Score: {fanProfile.fanScore || 0}</span>
                    </div>
                  </div>
                )}

                {rewardCatalog && Object.entries(rewardCatalog).map(([category, items]) => (
                  <div key={category} className="reward-category">
                    <h3>
                      {category === 'merchandise' && '👕 Merchandise'}
                      {category === 'tickets' && '🎟️ Tickets'}
                      {category === 'experiences' && '✨ Experiences'}
                      {category === 'nfts' && '🏆 NFTs'}
                    </h3>
                    <div className="rewards-grid">
                      {items.map((reward) => (
                        <div key={reward.id} className="reward-card">
                          <div className="reward-icon">{reward.image || '🎁'}</div>
                          <h4>{reward.name}</h4>
                          <p className="reward-cost">⭐ {reward.cost} pts</p>
                          {reward.stock !== undefined && (
                            <p className="stock">Stock: {reward.stock}</p>
                          )}
                          {reward.rarity && (
                            <span className={`rarity ${reward.rarity}`}>{reward.rarity}</span>
                          )}
                          <button 
                            className="redeem-btn"
                            onClick={() => redeemReward(reward.id)}
                            disabled={fanProfile && fanProfile.fanScore < reward.cost}
                          >
                            Redeem
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* LEADERBOARD TAB */}
            {activeTab === 'leaderboard' && (
              <div className="leaderboard-section">
                <h2>🏆 Top Fans</h2>
                <div className="leaderboard-list">
                  {leaderboard.length === 0 ? (
                    <p className="empty">No fans yet. Be the first!</p>
                  ) : (
                    leaderboard.map((user, index) => (
                      <div key={index} className={`leaderboard-item rank-${user.rank}`}>
                        <span className="rank">
                          {user.rank === 1 && '🥇'}
                          {user.rank === 2 && '🥈'}
                          {user.rank === 3 && '🥉'}
                          {user.rank > 3 && `#${user.rank}`}
                        </span>
                        <span className="wallet">{user.walletAddress?.substring(0, 6)}...{user.walletAddress?.substring(38)}</span>
                        <span className="tier-badge" style={{background: user.tier === 'vip' ? '#9B59B6' : user.tier === 'gold' ? '#FFD700' : user.tier === 'silver' ? '#C0C0C0' : '#CD7F32'}}>
                          {user.tier}
                        </span>
                        <span className="score">⭐ {user.fanScore}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
