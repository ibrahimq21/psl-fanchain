/**
 * PSL FanChain Backend - Extended Campaign System
 *
 * Features:
 * - Campaign Management (create, join, track)
 * - Multi-layer Anti-Spoof Validation
 * - Wallet Integration
 * - NFT Minting
 * - Analytics Dashboard
 */

require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// Load shared venues
const { getVenues, getVenueOptions, isValidVenue, getCoordinates } = require('../shared/venues');

// Load services
const fanProfile = require('./services/fanProfile');
const campaignTasks = require('./services/campaignTasks');
const rewardRedemption = require('./services/rewardRedemption');
const moderation = require('./services/moderation');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ==================== WEB3 BLOCKCHAIN INTEGRATION ====================

let web3;
let fanChainContract;
let FAN_CHAIN_ABI;

async function initWeb3() {
  try {
    const fs = require('fs');
    const path = require('path');

    // Try to load contract ABI
    const artifactPath = path.join(__dirname, '../build/contracts/FanChain.json');
    if (!fs.existsSync(artifactPath)) {
      console.log('⚠️ Contract ABI not found - blockchain features disabled');
      return;
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    FAN_CHAIN_ABI = artifact.abi;

    const Web3 = require('web3');
    web3 = new Web3(process.env.WIREFLUID_RPC || 'https://evm.wirefluid.com');

    const contractAddress = process.env.CONTRACT_ADDRESS;
    fanChainContract = new web3.eth.Contract(FAN_CHAIN_ABI, contractAddress);

    console.log('🔗 Web3 connected to WireFluid');
    console.log('📄 Contract:', contractAddress);

    // Test connection
    const blockNumber = await web3.eth.getBlockNumber();
    console.log('📊 Current block:', blockNumber);
  } catch (err) {
    console.log('⚠️ Web3 init failed:', err.message);
  }
}

initWeb3();

// ==================== BLOCKCHAIN NFT MINTING ====================

/**
 * Mint NFT on WireFluid blockchain after successful check-in
 */
async function mintNFTOnChain(walletAddress, campaignId, stadiumId, stadiumName, lat, lng) {
  const privateKey = process.env.PRIVATE_KEY;

  // If no private key, throw error (no more mock)
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not configured - NFT minting unavailable');
  }

  // Use child process to call external mint script (avoids web3 compatibility issues)
  const { exec } = require('child_process');
  const scriptPath = path.join(__dirname, 'scripts', 'mint-nft.js');

  console.log('🔄 Attempting blockchain mint...');

  // Run the mint script - throw error on failure (no fallback)
  const mintPromise = new Promise((resolve, reject) => {
    exec(`node "${scriptPath}" "${process.env.PRIVATE_KEY}" "${walletAddress}" 4`,
      { cwd: path.join(__dirname) },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        if (stdout.includes('SUCCESS')) {
          const txHash = stdout.match(/SUCCESS! (0x[a-f0-9]+)/)?.[1] || stdout.match(/Tx: (0x[a-f0-9]+)/)?.[1];
          resolve(txHash);
        } else {
          reject(new Error(stderr || stdout));
        }
      }
    );
  });

  const txHash = await mintPromise;
  console.log('✅ REAL NFT Minted:', txHash);

  return {
    success: true,
    transactionHash: txHash,
    simulated: false
  };
}

// ==================== VENUES (using shared module) ====================

// Venues are now loaded from shared/venues.js
// The shared module loads venues.json directly

// ==================== CONFIGURATION ====================

const CONFIG = {
  secretKey: process.env.SECRET_KEY || 'psl-fanchain-secret-key-2026',

  // WireFluid blockchain config
  blockchain: {
    rpc: process.env.WIREFLUID_RPC || 'https://evm.wirefluid.com',
    chainId: parseInt(process.env.WIREFLUID_CHAIN_ID) || 92533,
    networkName: process.env.WIREFLUID_NETWORK_NAME || 'WireFluid Testnet',
    currency: process.env.WIREFLUID_CURRENCY || 'WIRE',
    contractAddress: process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000001'
  },

  // Rewards config
  rewards: {
    basePoints: parseInt(process.env.REWARDS_BASE_POINTS) || 10,
    streakBonus: parseInt(process.env.REWARDS_STREAK_BONUS) || 5,
    stadiumBonus: parseInt(process.env.REWARDS_STADIUM_BONUS) || 20,
    nftMintThreshold: parseInt(process.env.REWARDS_NFT_MINT_THRESHOLD) || 50
  },

  // Load stadiums from shared venues module
  stadiums: getVenues(),

  geo: {
    maxAgeSeconds: 60,
    maxFutureSeconds: 10,
    maxSpeedKmh: parseInt(process.env.MAX_SPEED_KMH) || 80,
    defaultRadius: parseInt(process.env.DEFAULT_RADIUS) || 500,
    selfieRequired: true,
    challengeRequired: false
  },

  risk: {
    mockLocationPenalty: 50,
    emulatorPenalty: 40,
    impossibleSpeedPenalty: 60,
    sensorMismatchPenalty: 30,
    replayPenalty: 100,
    timestampPenalty: 20,
    signaturePenalty: 80,
    geoBoundaryPenalty: 40,
    networkPenalty: 25,
    attestationPenalty: 35,
    rejectThreshold: parseInt(process.env.REJECT_THRESHOLD) || 70
  }
};

// ==================== IN-MEMORY STORAGE ====================

const nonceStore = new Set();
const checkInStore = [];
const challengeStore = new Map();
const campaignStore = new Map();
const walletStore = new Map(); // wallet -> { earnings, nfts, checkIns }
const influencerStore = new Map(); // influencerId -> campaigns
const ticketStore = new Map(); // ticketId -> { status, usedAt, userId, eventId }
const usedTicketSignatures = new Set(); // Anti-replay storage

// ==================== TICKET SYSTEM ====================

// Generate a ticket with QR code data
function generateTicketQR(eventId, userId, options = {}) {
  const ticketId = `TKT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const signature = crypto
    .createHmac('sha256', CONFIG.secretKey)
    .update(`${ticketId}:${eventId}:${userId}`)
    .digest('hex');

  const ticket = {
    ticketId,
    eventId,
    userId,
    originalOwner: userId,  // Track original buyer
    currentOwner: userId,   // Current holder
    secret: signature.substring(0, 16),
    createdAt: new Date().toISOString(),
    status: 'valid',
    isGift: false,
    giftHistory: [],
    transferCount: 0,
    maxTransfers: 1,
    qrData: `${ticketId}|${eventId}|${signature.substring(0, 16)}`
  };

  ticketStore.set(ticketId, ticket);
  return ticket;
}

// Verify ticket with anti-spoof validation
function verifyTicket(qrData, userLat, userLng, timestamp) {
  try {
    const [ticketId, eventId, signature] = qrData.split('|');
    const ticket = ticketStore.get(ticketId);

    if (!ticket) {
      return { valid: false, reason: 'Invalid ticket - not found' };
    }

    // Check if already used (one-time use)
    if (ticket.status === 'used') {
      return { valid: false, reason: 'Ticket already used', usedAt: ticket.usedAt };
    }

    // Verify signature using originalOwner (signature is tied to original buyer)
    const expectedSig = crypto
      .createHmac('sha256', CONFIG.secretKey)
      .update(`${ticketId}:${eventId}:${ticket.originalOwner}`)
      .digest('hex')
      .substring(0, 16);

    if (signature !== expectedSig) {
      return { valid: false, reason: 'Invalid ticket signature' };
    }

    // Get event location
    const venue = CONFIG.stadiums[eventId] || CONFIG.stadiums['Gaddafi Stadium'];

    // Validate location
    const distance = haversineDistance(userLat, userLng, venue.lat, venue.lng);
    const inGeoFence = distance <= (venue.radius || 500);

    // Calculate time validation
    const now = new Date();
    const timeValid = true; // For demo, always valid

    // Calculate risk score
    let riskScore = 0;
    if (!inGeoFence) riskScore += 50;
    if (distance > 1000) riskScore += 30;

    return {
      valid: riskScore < 80 && inGeoFence,
      reason: riskScore < 80 && inGeoFence ? 'Verified' :
             !inGeoFence ? 'Not at venue' : 'Risk too high',
      ticket,
      venue,
      distance: Math.round(distance),
      inGeoFence,
      riskScore
    };
  } catch (err) {
    return { valid: false, reason: 'Invalid QR format' };
  }
}

// Generate sample tickets for events from venues.json
function initializeSampleTickets() {
  // Generate sample tickets for all event venues
  Object.values(CONFIG.stadiums)
    .filter(venue => venue.isEvent)
    .forEach(venue => {
      // Generate 5 sample tickets per event
      for (let i = 1; i <= 5; i++) {
        generateTicketQR(venue.id, `user_${i}`);
      }
    });

  console.log(`   Sample tickets initialized for ${Object.values(CONFIG.stadiums).filter(v => v.isEvent).length} events`);
}

// Initialize with sample campaign
campaignStore.set('campaign_rawalpindi_001', {
  id: 'campaign_rawalpindi_001',
  name: 'PSL 2026 - Rawalpindi Match',
  stadiumId: 'rawalpindi',
  description: 'Watch Pakistan vs New Zealand at Rawalpindi Cricket Stadium',
  startTime: '2026-04-15T14:00:00Z',
  endTime: '2026-04-15T22:00:00Z',
  rewards: {
    pointsPerCheckIn: 100,
    bonusPoints: 50,
    nftReward: true
  },
  status: 'active',
  maxParticipants: 1000,
  currentParticipants: 0,
  createdAt: new Date().toISOString()
});

// ==================== UTILITY FUNCTIONS ====================

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

function verifySignature(payload, signature, secret) {
  return generateSignature(payload, secret) === signature;
}

function getTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function getNetworkFingerprint(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    accept: req.headers['accept'] || ''
  };
}

function generateProofHash(checkIn) {
  const data = `${checkIn.wallet}:${checkIn.campaignId}:${checkIn.timestamp}:${checkIn.stadiumId}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// ==================== RISK ENGINE ====================

function evaluateRisk(data) {
  let riskScore = 0;
  const signals = [];

  if (data.isMockLocation) {
    riskScore += CONFIG.risk.mockLocationPenalty;
    signals.push('mock_location');
  }
  if (data.isEmulator) {
    riskScore += CONFIG.risk.emulatorPenalty;
    signals.push('emulator');
  }
  if (data.sensorMismatch) {
    riskScore += CONFIG.risk.sensorMismatchPenalty;
    signals.push('sensor_mismatch');
  }
  if (!data.geoValid) {
    riskScore += CONFIG.risk.geoBoundaryPenalty;
    signals.push('outside_geo_fence');
  }
  if (data.timestampAge > CONFIG.geo.maxAgeSeconds) {
    riskScore += CONFIG.risk.timestampPenalty;
    signals.push('location_too_old');
  }
  if (data.networkRisk) {
    riskScore += CONFIG.risk.networkPenalty;
    signals.push('suspicious_network');
  }
  if (data.attestationFailed) {
    riskScore += CONFIG.risk.attestationPenalty;
    signals.push('attestation_failed');
  }

  return {
    score: riskScore,
    signals,
    allowed: riskScore < CONFIG.risk.rejectThreshold
  };
}

// ==================== WALLET MANAGEMENT ====================

function getOrCreateWallet(walletAddress) {
  if (!walletStore.has(walletAddress)) {
    walletStore.set(walletAddress, {
      address: walletAddress,
      earnings: 0,
      points: 0,
      nfts: [],
      checkIns: [],
      campaigns: [],
      createdAt: new Date().toISOString()
    });
  }
  return walletStore.get(walletAddress);
}

function mintNFT(wallet, campaign) {
  const nft = {
    id: uuidv4(),
    tokenId: crypto.randomBytes(4).toString('hex'),
    campaignId: campaign.id,
    campaignName: campaign.name,
    stadiumId: campaign.stadiumId,
    stadiumName: CONFIG.stadiums[campaign.stadiumId]?.name || 'Unknown',
    proofHash: generateProofHash({
      wallet,
      campaignId: campaign.id,
      timestamp: Date.now(),
      stadiumId: campaign.stadiumId
    }),
    mintedAt: new Date().toISOString(),
    metadata: {
      event: campaign.name,
      location: campaign.stadiumId,
      date: campaign.startTime
    }
  };

  const walletData = getOrCreateWallet(wallet);
  walletData.nfts.push(nft);
  walletData.points += campaign.rewards.pointsPerCheckIn;

  if (campaign.rewards.nftReward) {
    walletData.earnings += 1;
  }

  return nft;
}

// ==================== API ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Server status
app.get('/', (req, res) => {
  res.json({
    name: 'PSL FanChain API',
    version: '2.0.0',
    features: ['campaigns', 'anti-spoof', 'wallet', 'nft', 'analytics'],
    endpoints: ['/health', '/campaigns', '/validate-location', '/wallet', '/nfts', '/analytics', '/leaderboard']
  });
});

// ==================== CAMPAIGN ENDPOINTS ====================

// List campaigns
app.get('/campaigns', (req, res) => {
  const campaigns = Array.from(campaignStore.values()).map(c => ({
    id: c.id,
    name: c.name,
    stadiumId: c.stadiumId,
    stadium: CONFIG.stadiums[c.stadiumId],
    startTime: c.startTime,
    endTime: c.endTime,
    rewards: c.rewards,
    status: c.status,
    participants: c.currentParticipants,
    maxParticipants: c.maxParticipants
  }));
  res.json({ campaigns });
});

// Get campaign details
app.get('/campaigns/:id', (req, res) => {
  const campaign = campaignStore.get(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  res.json({ campaign });
});

// Create campaign (admin)
app.post('/campaigns', (req, res) => {
  const { name, stadiumId, description, startTime, endTime, rewards, maxParticipants } = req.body;

  if (!name || !stadiumId || !CONFIG.stadiums[stadiumId]) {
    return res.status(400).json({ error: 'Invalid name or stadiumId' });
  }

  const id = `campaign_${stadiumId}_${Date.now()}`;
  const campaign = {
    id,
    name,
    stadiumId,
    description: description || '',
    startTime: startTime || new Date().toISOString(),
    endTime: endTime || new Date(Date.now() + 86400000).toISOString(),
    rewards: rewards || { pointsPerCheckIn: 100, bonusPoints: 50, nftReward: true },
    status: 'active',
    maxParticipants: maxParticipants || 1000,
    currentParticipants: 0,
    createdAt: new Date().toISOString()
  };

  campaignStore.set(id, campaign);
  res.json({ campaign, message: 'Campaign created' });
});

// Join campaign
app.post('/campaigns/:id/join', (req, res) => {
  const { wallet, payload, signature } = req.body;
  const campaign = campaignStore.get(req.params.id);

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (campaign.status !== 'active') {
    return res.status(400).json({ error: 'Campaign not active' });
  }

  const now = new Date();
  const start = new Date(campaign.startTime);
  const end = new Date(campaign.endTime);

  if (now < start || now > end) {
    return res.status(400).json({ error: 'Campaign not within valid time window' });
  }

  // Process check-in
  const checkIn = {
    id: uuidv4(),
    campaignId: campaign.id,
    wallet,
    stadiumId: campaign.stadiumId,
    timestamp: Date.now(),
    network: getNetworkFingerprint(req),
    verifiedAt: Date.now()
  };

  checkInStore.push(checkIn);

  const walletData = getOrCreateWallet(wallet);
  walletData.checkIns.push(checkIn);
  walletData.points += campaign.rewards.pointsPerCheckIn;

  if (!walletData.campaigns.includes(campaign.id)) {
    walletData.campaigns.push(campaign.id);
    campaign.currentParticipants++;
  }

  // Mint NFT if eligible
  let nft = null;
  if (campaign.rewards.nftReward) {
    nft = mintNFT(wallet, campaign);
  }

  res.json({
    success: true,
    checkIn: { id: checkIn.id, stadiumId: checkIn.stadiumId, timestamp: checkIn.timestamp },
    points: walletData.points,
    nft,
    message: `Welcome to ${campaign.name}!`
  });
});

// ==================== VALIDATION ENDPOINTS ====================

// Validate location
app.post('/validate-location', (req, res) => {
  const { wallet, lat, lng, stadiumId, isMockLocation, isEmulator, sensorMismatch, deviceAttestation, selfieData } = req.body;

  if (!stadiumId || !CONFIG.stadiums[stadiumId]) {
    return res.status(400).json({ valid: false, error: 'Invalid stadium' });
  }

  const stadium = CONFIG.stadiums[stadiumId];
  const distance = haversineDistance(lat, lng, stadium.lat, stadium.lng);
  const geoValid = distance <= stadium.radius;

  const riskData = {
    lat, lng,
    stadiumId,
    isMockLocation: isMockLocation || false,
    isEmulator: isEmulator || false,
    sensorMismatch: sensorMismatch || false,
    geoValid,
    timestampAge: 0,
    networkRisk: false,
    attestationFailed: !deviceAttestation
  };

  const risk = evaluateRisk(riskData);

  res.json({
    valid: risk.allowed && geoValid,
    risk,
    distance: Math.round(distance),
    stadium: { id: stadiumId, name: stadium.name }
  });
});

// Challenge-response (future)
app.post('/challenge', (req, res) => {
  const { wallet } = req.body;
  const challenge = {
    id: uuidv4(),
    code: Math.random().toString(36).substring(2, 8).toUpperCase(),
    wallet,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000
  };
  challengeStore.set(challenge.id, challenge);
  res.json({ challenge });
});

// ==================== WALLET ENDPOINTS ====================

// Get wallet info
app.get('/wallet/:address', (req, res) => {
  const wallet = getOrCreateWallet(req.params.address);
  res.json({ wallet });
});

// Get wallet NFTs
app.get('/wallet/:address/nfts', (req, res) => {
  const wallet = getOrCreateWallet(req.params.address);
  res.json({ nfts: wallet.nfts, count: wallet.nfts.length });
});

// Get wallet earnings
app.get('/wallet/:address/earnings', (req, res) => {
  const wallet = getOrCreateWallet(req.params.address);
  res.json({
    address: wallet.address,
    totalEarnings: wallet.earnings,
    totalPoints: wallet.points,
    totalCheckIns: wallet.checkIns.length,
    campaignsJoined: wallet.campaigns.length
  });
});

// ==================== ANALYTICS ENDPOINTS ====================

// Dashboard stats
app.get('/analytics', (req, res) => {
  const totalCheckIns = checkInStore.length;
  const totalWallets = walletStore.size;
  const totalNFTs = Array.from(walletStore.values()).reduce((sum, w) => sum + w.nfts.length, 0);
  const totalPoints = Array.from(walletStore.values()).reduce((sum, w) => sum + w.points, 0);

  const campaignStats = Array.from(campaignStore.values()).map(c => ({
    id: c.id,
    name: c.name,
    participants: c.currentParticipants
  }));

  res.json({
    totalCheckIns,
    totalWallets,
    totalNFTs,
    totalPoints,
    campaigns: campaignStats
  });
});

// Leaderboard
app.get('/leaderboard', (req, res) => {
  const leaders = Array.from(walletStore.values())
    .map(w => ({ address: w.address, points: w.points, nfts: w.nfts.length }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 20);
  res.json({ leaderboard: leaders });
});

// ==================== NFT ENDPOINTS ====================

// Get NFT details
app.get('/nfts/:id', (req, res) => {
  for (const wallet of walletStore.values()) {
    const nft = wallet.nfts.find(n => n.id === req.params.id || n.tokenId === req.params.id);
    if (nft) return res.json({ nft });
  }
  res.status(404).json({ error: 'NFT not found' });
});

// Generate share card (metadata)
app.get('/nfts/:id/share', (req, res) => {
  for (const wallet of walletStore.values()) {
    const nft = wallet.nfts.find(n => n.id === req.params.id || n.tokenId === req.params.id);
    if (nft) {
      return res.json({
        card: {
          title: `I attended ${nft.campaignName}`,
          location: nft.stadiumName,
          date: nft.mintedAt,
          proof: nft.proofHash,
          url: `https://pslfanchain.io/verify/${nft.tokenId}`
        }
      });
    }
  }
  res.status(404).json({ error: 'NFT not found' });
});



// ==================== INFLUENCER ENDPOINTS ====================

// Get influencer campaigns
app.get('/influencer/:id/campaigns', (req, res) => {
  const campaigns = Array.from(campaignStore.values()).filter(c => c.createdBy === req.params.id);
  res.json({ campaigns });
});

// Create influencer campaign
app.post('/influencer/:id/campaigns', (req, res) => {
  const { name, stadiumId, description, startTime, endTime, rewards } = req.body;
  const id = `campaign_${stadiumId}_${Date.now()}`;
  const campaign = {
    id,
    name,
    stadiumId,
    description,
    startTime,
    endTime,
    rewards: rewards || { pointsPerCheckIn: 100, bonusPoints: 50, nftReward: true },
    status: 'active',
    createdBy: req.params.id,
    maxParticipants: 1000,
    currentParticipants: 0,
    createdAt: new Date().toISOString()
  };
  campaignStore.set(id, campaign);
  res.json({ campaign, message: 'Campaign created successfully' });
});

// ==================== LEGACY COMPATIBILITY ====================

// Legacy endpoints for backward compatibility
app.get('/stadiums', (req, res) => {
  // Return in format: { "Gaddafi Stadium": { name, lat, lng, radius, city, isEvent } }
  const stadiums = {};
  for (const [key, venue] of Object.entries(CONFIG.stadiums)) {
    stadiums[key] = {
      name: venue.stadiumName || venue.name || key,
      stadiumName: venue.stadiumName || venue.name || key,
      lat: venue.lat || venue.coordinates?.lat,
      lng: venue.lng || venue.coordinates?.lng,
      coordinates: {
        lat: venue.lat || venue.coordinates?.lat,
        lng: venue.lng || venue.coordinates?.lng
      },
      radius: venue.radius,
      city: venue.city,
      isEvent: venue.isEvent || false
    };
  }
  res.json(stadiums);
});

// Get venues from JSON file
app.get('/venues', (req, res) => {
  try {
    const venuesPath = path.join(__dirname, 'venues', 'venues.json');
    const venues = JSON.parse(fs.readFileSync(venuesPath, 'utf8'));
    res.json({ venues });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load venues' });
  }
});

// Reload venues from JSON (admin only)
app.post('/venues/reload', (req, res) => {
  // Reload from shared module
  const { getVenues } = require('../shared/venues');
  CONFIG.stadiums = getVenues();
  res.json({ success: true, message: 'Venues reloaded', count: Object.keys(CONFIG.stadiums).length });
});

app.get('/config', (req, res) => {
  res.json({
    geo: CONFIG.geo,
    risk: CONFIG.risk,
    blockchain: CONFIG.blockchain,
    rewards: CONFIG.rewards,
    version: '2.1.0'
  });
});

app.get('/checkins', (req, res) => {
  res.json({ checkIns: checkInStore.slice(-50) });
});

app.get('/blockchain/nfts/:wallet', (req, res) => {
  const wallet = getOrCreateWallet(req.params.wallet);
  res.json({ nfts: wallet.nfts });
});

app.get('/blockchain/rewards/:wallet', (req, res) => {
  const wallet = getOrCreateWallet(req.params.wallet);
  res.json({ points: wallet.points, earnings: wallet.earnings });
});

app.post('/verify', async (req, res) => {
  const { payload, signature } = req.body;
  const stadium = CONFIG.stadiums[payload?.stadiumId];

  if (!stadium) {
    return res.json({ success: false, message: 'Invalid stadium' });
  }

  const distance = haversineDistance(payload.lat, payload.lng, stadium.lat, stadium.lng);
  const geoValid = distance <= stadium.radius;

  const riskData = {
    ...payload,
    geoValid,
    timestampAge: Date.now() / 1000 - (payload.timestamp || 0),
    networkRisk: false
  };

  const risk = evaluateRisk(riskData);

  if (!risk.allowed) {
    return res.json({ success: false, message: 'Risk check failed', risk });
  }

  const checkIn = {
    id: uuidv4(),
    stadiumId: payload.stadiumId,
    stadiumName: stadium.name,
    timestamp: Date.now(),
    riskScore: risk.score,
    verifiedAt: Date.now()
  };

  checkInStore.push(checkIn);

  // NOTE: NFT minting now happens on frontend via MetaMask
  // See frontend handleCheckIn() -> calls contract directly
  // For now, just return check-in verified

  return res.json({
    success: true,
    checkIn,
    message: 'Check-in verified! Mint NFT via MetaMask to complete.'
  });
});

// ==================== EIP-712 SIGNED MINTING ====================

// EIP-712 domain separator (must match contract)
const EIP712_DOMAIN = {
  name: "PSL FanChain",
  version: "1",
  chainId: parseInt(process.env.WIREFLUID_CHAIN_ID) || 92533,
};

// CheckInProof type hash (must match contract)
const CHECKIN_TYPEHASH = "0x" + Buffer.from(
  "CheckInProof(address user,uint256 campaignId,uint256 lat,uint256 lng,uint256 timestamp,uint256 nonce)"
).toString("hex");

// Generate EIP-712 signature for check-in proof
function signCheckInProof(proofData) {
  const privateKey = process.env.PLATFORM_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PLATFORM_PRIVATE_KEY not configured');
  }
  
  // Create domain separator hash
  const domainHash = ethers.id(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        ethers.id("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        ethers.id(EIP712_DOMAIN.name),
        ethers.id(EIP712_DOMAIN.version),
        EIP712_DOMAIN.chainId,
        process.env.NFT_CONTRACT_ADDRESS || '0x35f385e2Fd110fc069fc6f643EC9ecb887FAD06a'
      ]
    )
  );
  
  // Create proof struct hash
  const proofHash = ethers.id(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [
        CHECKIN_TYPEHASH,
        proofData.user,
        proofData.campaignId,
        proofData.lat,
        proofData.lng,
        proofData.timestamp,
        proofData.nonce
      ]
    )
  );
  
  // Create signed message hash
  const signedMessageHash = ethers.id(
    ethers.solidityPacked(
      ["bytes1", "bytes32", "bytes32"],
      ["0x19", "0x01", ethers.keccak256(ethers.concat([domainHash, proofHash]))]
    )
  );
  
  // Sign the message
  const wallet = new ethers.Wallet(privateKey);
  const signature = wallet.signMessage(ethers.getBytes(signedMessageHash));
  
  return signature;
}

// Generate signed proof endpoint
app.post('/generate-proof', async (req, res) => {
  const { user, campaignId, lat, lng, stadiumId } = req.body;
  
  if (!user || !campaignId) {
    return res.status(400).json({ error: 'user and campaignId required' });
  }
  
  try {
    const proofData = {
      user,
      campaignId: parseInt(campaignId),
      lat: Math.floor(lat * 1000000),  // Convert to contract format
      lng: Math.floor(lng * 1000000),
      timestamp: Math.floor(Date.now() / 1000),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    const signature = signCheckInProof(proofData);
    
    res.json({
      success: true,
      proof: proofData,
      signature,
      contractAddress: process.env.NFT_CONTRACT_ADDRESS || '0x35f385e2Fd110fc069fc6f643EC9ecb887FAD06a'
    });
  } catch (err) {
    console.error('Generate proof error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/demo/generate', (req, res) => {
  res.json({
    payload: {
      lat: 31.5204,
      lng: 74.3587,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: uuidv4(),
      stadiumId: 'lahore',
      deviceId: '0x742d35Cc6453C60f6b1C3d2c2aE2a4f4C9d1d6',
      isMockLocation: false,
      isEmulator: false,
      sensorMismatch: false
    }
  });
});

// ==================== TICKET GIFTING SYSTEM ====================

// Gift a ticket to another user
app.post('/tickets/gift', (req, res) => {
  const { ticketId, fromUserId, toUserId, message } = req.body;

  if (!ticketId || !fromUserId || !toUserId) {
    return res.status(400).json({ error: 'ticketId, fromUserId, and toUserId required' });
  }

  const ticket = ticketStore.get(ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  // Check ownership
  if (ticket.userId !== fromUserId) {
    return res.status(403).json({ error: 'You do not own this ticket' });
  }

  // Check if already used
  if (ticket.status === 'used') {
    return res.status(400).json({ error: 'Ticket already used, cannot gift' });
  }

  // Check transfer limit
  if (ticket.transferCount >= (ticket.maxTransfers || 1)) {
    return res.status(400).json({ error: 'Transfer limit reached (max 1 gift per ticket)' });
  }

  // Create gift record
  const giftRecord = {
    from: fromUserId,
    to: toUserId,
    message: message || 'Enjoy the event! 🎉',
    timestamp: new Date().toISOString(),
    status: 'pending' // Needs recipient verification
  };

  // Initialize gift history if not exists
  if (!ticket.giftHistory) {
    ticket.giftHistory = [];
  }
  ticket.giftHistory.push(giftRecord);

  // Mark as gifted, pending verification
  ticket.isGift = true;
  ticket.giftPending = true;
  ticket.transferCount = (ticket.transferCount || 0) + 1;
  ticket.pendingRecipient = toUserId;

  // Generate gift claim code
  const claimCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  ticket.claimCode = claimCode;

  res.json({
    success: true,
    ticketId,
    from: fromUserId,
    to: toUserId,
    claimCode,
    message: `Gift sent! Recipient must claim with code: ${claimCode}`,
    giftHistory: ticket.giftHistory
  });
});

// Claim a gifted ticket (recipient verifies)
app.post('/tickets/claim', (req, res) => {
  const { ticketId, userId, claimCode } = req.body;

  if (!ticketId || !userId || !claimCode) {
    return res.status(400).json({ error: 'ticketId, userId, and claimCode required' });
  }

  const ticket = ticketStore.get(ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  // Verify claim code
  if (ticket.claimCode !== claimCode) {
    return res.status(403).json({ error: 'Invalid claim code' });
  }

  // Verify recipient matches
  if (ticket.pendingRecipient !== userId) {
    return res.status(403).json({ error: 'This gift is not for you' });
  }

  // Update ownership
  ticket.userId = userId;
  ticket.currentOwner = userId;
  ticket.giftPending = false;
  ticket.giftVerified = true;
  ticket.claimCode = null;

  // Update gift record status
  const lastGift = ticket.giftHistory[ticket.giftHistory.length - 1];
  if (lastGift) {
    lastGift.status = 'claimed';
    lastGift.claimedAt = new Date().toISOString();
  }

  res.json({
    success: true,
    ticketId,
    newOwner: userId,
    message: 'Ticket claimed successfully! 🎁',
    giftHistory: ticket.giftHistory
  });
});

// Get gift history for a ticket
app.get('/tickets/:ticketId/gift-history', (req, res) => {
  const ticket = ticketStore.get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  res.json({
    ticketId: req.params.ticketId,
    originalOwner: ticket.originalOwner || ticket.userId,
    currentOwner: ticket.userId,
    isGift: ticket.isGift || false,
    transferCount: ticket.transferCount || 0,
    maxTransfers: ticket.maxTransfers || 1,
    giftHistory: ticket.giftHistory || []
  });
});

// Get pending gifts for a user
app.get('/tickets/pending/:userId', (req, res) => {
  const pendingGifts = Array.from(ticketStore.values())
    .filter(t => t.pendingRecipient === req.params.userId && t.giftPending)
    .map(t => ({
      ticketId: t.ticketId,
      from: t.userId,
      eventId: t.eventId,
      eventName: CONFIG.stadiums[t.eventId]?.name || t.eventId,
      message: t.giftHistory?.[t.giftHistory.length - 1]?.message || 'You received a gift!',
      giftedAt: t.giftHistory?.[t.giftHistory.length - 1]?.timestamp
    }));

  res.json({ pendingGifts });
});

// ==================== TICKET VERIFICATION API ====================

// Get available events
app.get('/tickets/events', (req, res) => {
  const events = Object.entries(CONFIG.stadiums)
    .filter(([id, venue]) => venue.isEvent || id.includes('band') || id.includes('concert'))
    .map(([id, venue]) => ({
      id,
      name: venue.name,
      city: venue.city,
      radius: venue.radius,
      ticketCount: Array.from(ticketStore.values()).filter(t => t.eventId === id && t.status === 'valid').length
    }));

  res.json({ events });
});

// Get user's tickets
app.get('/tickets/user/:userId', (req, res) => {
  const userTickets = Array.from(ticketStore.values())
    .filter(t => t.userId === req.params.userId)
    .map(t => ({
      ticketId: t.ticketId,
      eventId: t.eventId,
      eventName: CONFIG.stadiums[t.eventId]?.name || t.eventId,
      status: t.status,
      usedAt: t.usedAt,
      qrData: t.qrData
    }));

  res.json({ tickets: userTickets });
});

// Generate new ticket (for demo)
app.post('/tickets/generate', (req, res) => {
  const { eventId, userId } = req.body;

  if (!eventId || !userId) {
    return res.status(400).json({ error: 'eventId and userId required' });
  }

  if (!CONFIG.stadiums[eventId]) {
    return res.status(400).json({ error: 'Invalid event' });
  }

  const ticket = generateTicketQR(eventId, userId);

  res.json({
    ticket,
    event: CONFIG.stadiums[eventId],
    message: 'Ticket generated successfully'
  });
});

// Verify ticket at entry point
app.post('/tickets/verify', (req, res) => {
  const { qrData, lat, lng, deviceId, userId } = req.body;

  if (!qrData || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'qrData, lat, and lng required' });
  }

  const result = verifyTicket(qrData, lat, lng);

  // Check for gifted ticket that needs verification
  if (result.valid) {
    const [ticketId] = qrData.split('|');
    const ticket = ticketStore.get(ticketId);
    if (ticket && ticket.giftPending) {
      return res.json({
        ...result,
        valid: false,
        entryAllowed: false,
        reason: 'Gift must be claimed by recipient first',
        verifiedAt: new Date().toISOString(),
        requiresClaim: true
      });
    }

    if (ticket) {
      // Mark as used
      ticket.status = 'used';
      ticket.usedAt = new Date().toISOString();
      ticket.usedBy = deviceId || 'unknown';
      ticket.usedLocation = { lat, lng };
    }
  }

  res.json({
    ...result,
    verifiedAt: new Date().toISOString(),
    entryAllowed: result.valid && result.inGeoFence && result.riskScore < 80
  });
});

// Get ticket status
app.get('/tickets/:ticketId', (req, res) => {
  const ticket = ticketStore.get(req.params.ticketId);

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  res.json({
    ticketId: ticket.ticketId,
    eventId: ticket.eventId,
    eventName: CONFIG.stadiums[ticket.eventId]?.name,
    status: ticket.status,
    usedAt: ticket.usedAt,
    createdAt: ticket.createdAt,
    nfcData: ticket.qrData // Same data works for NFC
  });
});

// Generate NFC-compatible ticket data
app.get('/tickets/:ticketId/nfc', (req, res) => {
  const ticket = ticketStore.get(req.params.ticketId);

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  // NDEF message format for NFC
  const ndefMessage = {
    records: [
      {
        recordType: 'text',
        data: ticket.qrData
      },
      {
        recordType: 'url',
        data: `https://pslfanchain.io/verify/${ticket.ticketId}`
      }
    ]
  };

  res.json({
    ticketId: ticket.ticketId,
    ndefData: ticket.qrData,
    writeInstructions: 'Write this data to NFC tag using NDEF format',
    qrData: ticket.qrData,
    eventName: CONFIG.stadiums[ticket.eventId]?.name
  });
});

// ==================== FAN PROFILE API ====================

// Get user profile with fan score and tier
app.get('/profile/:wallet', (req, res) => {
  const profile = fanProfile.getProfileWithTier(req.params.wallet);
  res.json(profile);
});

// Add score to user
app.post('/profile/:wallet/score', (req, res) => {
  const { eventType, metadata } = req.body;
  const result = fanProfile.addScore(req.params.wallet, eventType, metadata || {});
  res.json(result);
});

// Get leaderboard
app.get('/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const leaderboard = fanProfile.getLeaderboard(limit);
  res.json({ leaderboard });
});

// ==================== CAMPAIGN TASKS API ====================

// Get task types
app.get('/tasks/types', (req, res) => {
  res.json({ taskTypes: campaignTasks.TASK_TYPES });
});

// Create tasks for campaign
app.post('/campaigns/:campaignId/tasks', (req, res) => {
  const { tasks } = req.body;
  const created = campaignTasks.createCampaignTasks(req.params.campaignId, tasks || campaignTasks.getDefaultTasks());
  res.json({ tasks: created });
});

// Get campaign tasks
app.get('/campaigns/:campaignId/tasks', (req, res) => {
  const tasks = campaignTasks.getCampaignTasks(req.params.campaignId);
  res.json({ tasks });
});

// Submit task proof
app.post('/campaigns/:campaignId/tasks/:taskId/submit', (req, res) => {
  const { wallet, proof } = req.body;
  const result = campaignTasks.submitTaskProof(req.params.campaignId, req.params.taskId, wallet, proof);
  res.json(result);
});

// Get user task status
app.get('/campaigns/:campaignId/tasks/:wallet', (req, res) => {
  const status = campaignTasks.getUserTaskStatus(req.params.campaignId, req.params.wallet);
  res.json(status);
});

// ==================== REWARD REDEMPTION API ====================

// Get reward catalog
app.get('/rewards', (req, res) => {
  res.json(rewardRedemption.getRewardCatalog());
});

// Get rewards by type
app.get('/rewards/:type', (req, res) => {
  const rewards = rewardRedemption.getRewardsByType(req.params.type);
  res.json({ rewards });
});

// Check reward availability
app.get('/rewards/check/:rewardId', (req, res) => {
  const result = rewardRedemption.isRewardAvailable(req.params.rewardId);
  res.json(result);
});

// Redeem reward
app.post('/rewards/redeem', (req, res) => {
  const { wallet, rewardId, fanScore } = req.body;
  const result = rewardRedemption.redeemReward(wallet, rewardId, fanScore);
  res.json(result);
});

// Get user redemptions
app.get('/rewards/user/:wallet', (req, res) => {
  const redemptions = rewardRedemption.getUserRedemptions(req.params.wallet);
  res.json({ redemptions });
});

// Claim voucher
app.post('/rewards/claim', (req, res) => {
  const { wallet, voucherId } = req.body;
  const result = rewardRedemption.claimVoucher(wallet, voucherId);
  res.json(result);
});

// ==================== MODERATION API ====================

// Get user profile with moderation info
app.get('/admin/user/:wallet', async (req, res) => {
  try {
    const user = await moderation.getUser(req.params.wallet);
    const riskScore = await moderation.getRiskScore(req.params.wallet);
    const history = await moderation.getModerationHistory(req.params.wallet);
    const isBanned = await moderation.isBanned(req.params.wallet);
    res.json({ user, riskScore, history, isBanned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if user is admin
app.get('/admin/check/:wallet', async (req, res) => {
  try {
    const isAdmin = await moderation.isAdmin(req.params.wallet);
    const role = await moderation.getUserRole(req.params.wallet);
    res.json({ isAdmin, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Promote user to admin
app.post('/admin/promote', async (req, res) => {
  try {
    const { wallet, promotedBy } = req.body;
    const result = await moderation.promoteToAdmin(wallet, promotedBy);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit report
app.post('/reports', async (req, res) => {
  try {
    const result = await moderation.createReport(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get reports queue
app.get('/admin/reports', async (req, res) => {
  try {
    const { status, minRisk } = req.query;
    const reports = await moderation.getReportsQueue({ status, minRisk: parseInt(minRisk) || 0 });
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single report
app.get('/admin/reports/:id', async (req, res) => {
  try {
    const report = await moderation.getReport(req.params.id);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ban user
app.post('/admin/ban', async (req, res) => {
  try {
    const { adminWallet, targetWallet, banType, reason, durationDays } = req.body;
    const isAdmin = await moderation.isAdmin(adminWallet);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can ban users' });
    }
    const result = await moderation.banUser(adminWallet, targetWallet, banType, reason, durationDays);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unban user
app.post('/admin/unban', async (req, res) => {
  try {
    const { adminWallet, targetWallet, reason } = req.body;
    const isAdmin = await moderation.isAdmin(adminWallet);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can unban users' });
    }
    const result = await moderation.unbanUser(adminWallet, targetWallet, reason);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Flag user
app.post('/admin/flag', async (req, res) => {
  try {
    const { adminWallet, targetWallet, reason } = req.body;
    const isAdmin = await moderation.isAdmin(adminWallet);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can flag users' });
    }
    const result = await moderation.flagUser(adminWallet, targetWallet, reason);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active bans
app.get('/admin/bans', async (req, res) => {
  try {
    const bans = await moderation.getActiveBans();
    res.json({ bans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get risk score
app.get('/admin/risk/:wallet', async (req, res) => {
  try {
    const riskScore = await moderation.getRiskScore(req.params.wallet);
    res.json(riskScore);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit appeal
app.post('/appeal', async (req, res) => {
  try {
    const { bannedEntityId, walletAddress, explanation, evidence } = req.body;
    const result = await moderation.submitAppeal(bannedEntityId, walletAddress, explanation, evidence);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get appeals queue
app.get('/admin/appeals', async (req, res) => {
  try {
    const appeals = await moderation.getAppealsQueue();
    res.json({ appeals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve appeal
app.post('/admin/appeals/:id/resolve', async (req, res) => {
  try {
    const { adminId, approved, reviewNotes } = req.body;
    const result = await moderation.resolveAppeal(parseInt(req.params.id), adminId, approved, reviewNotes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get moderation stats
app.get('/admin/stats', async (req, res) => {
  try {
    const stats = await moderation.getModerationStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== START SERVER ====================

// Initialize sample tickets
initializeSampleTickets();

// Create default campaign on blockchain
async function createDefaultCampaign() {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey || !web3 || !fanChainContract) {
      console.log('⚠️ Skipping default campaign (no Web3)');
      return;
    }

    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);
    const adminWallet = account.address;

    const now = Math.floor(Date.now() / 1000);
    const oneYear = 365 * 24 * 60 * 60;

    // Create default campaign
    const tx = await fanChainContract.methods.createCampaign(
      'PSL FanChain 2026',
      'Official attendance tracking campaign',
      31520400, // lat (Gaddafi Stadium)
      74358700, // lng
      500, // radius
      now, // start time
      now + oneYear, // end time
      'Gold',
      100,
      '0x0000000000000000000000000000000000000000'
    ).send({ from: adminWallet, gas: 1000000 });

    console.log('✅ Default campaign created on blockchain:', tx.transactionHash);
  } catch (err) {
    console.log('⚠️ Default campaign may already exist:', err.message);
  }
}

createDefaultCampaign();

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`
🔥 PSL FanChain Backend v2.1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Server: http://localhost:${PORT}
   Features:
   • Campaign Management
   • Multi-layer Anti-Spoof
   • Wallet Integration
   • NFT Minting
   • Analytics Dashboard
   • Influencer Portal
   • Ticket Verification System ⭐ NEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});