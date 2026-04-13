/**
 * PSL FanChain Backend API
 * Campaign Management, NFT Minting, Anti-Spoof Validation
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ==================== CONFIGS ====================
const CONFIG = {
    // Testnet wallet (provided by user)
    
    
    // Stadiums
    // stadiums: {
    //     'rawalpindi': { lat: 33.6517, lng: 73.0785, name: 'Rawalpindi Cricket Stadium', radius: 500 },
    //     'lahore': { lat: 31.5080, lng: 74.3333, name: 'Gaddafi Stadium', radius: 500 },
    //     'karachi': { lat: 24.8910, lng: 67.0755, name: 'National Stadium', radius: 500 }
    // },
    
    // Anti-spoof thresholds
    GPS_ACCURACY_THRESHOLD: 100, // meters
    MIN_DURATION_SECONDS: 10,
    
    // Risk scoring weights
    SCORE_WEIGHTS: {
        GPS_VALID: 20,
        INSIDE_GEO: 20,
        DEVICE_PASS: 25,
        CAMERA_PASS: 15,
        NETWORK_MATCH: 10,
        SUSPICIOUS: -30
    },
    PASS_THRESHOLD: 70
};

// ==================== IN-MEMORY DATABASE ====================
const db = {
    campaigns: new Map(),
    nfts: new Map(),
    users: new Map(),
    influencers: new Map(),
    campaignJoins: new Map()
};

// ==================== HELPERS ====================

// Haversine distance
function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Anti-spoof validation
function validateLocation(userLat, userLng, accuracy, deviceInfo, stadiumId) {
    const stadium = CONFIG.stadiums[stadiumId];
    if (!stadium) return { valid: false, score: 0, reason: 'Invalid stadium' };
    
    let score = 0;
    let reasons = [];
    
    // 1. GPS accuracy check
    if (accuracy <= CONFIG.GPS_ACCURACY_THRESHOLD) {
        score += CONFIG.SCORE_WEIGHTS.GPS_VALID;
    } else {
        reasons.push(`GPS accuracy too low: ${accuracy}m`);
    }
    
    // 2. Geo-fence check
    const distance = getDistance(userLat, userLng, stadium.lat, stadium.lng);
    if (distance <= stadium.radius) {
        score += CONFIG.SCORE_WEIGHTS.INSIDE_GEO;
    } else {
        reasons.push(`Outside geo-fence: ${Math.round(distance)}m`);
    }
    
    // 3. Device attestation (simplified)
    if (deviceInfo && !deviceInfo.emulator && !deviceInfo.rooted) {
        score += CONFIG.SCORE_WEIGHTS.DEVICE_PASS;
    } else {
        reasons.push('Device verification failed');
    }
    
    // 4. Camera selfie check
    if (deviceInfo && deviceInfo.selfieVerified) {
        score += CONFIG.SCORE_WEIGHTS.CAMERA_PASS;
    }
    
    // Result
    const valid = score >= CONFIG.PASS_THRESHOLD;
    
    return {
        valid,
        score,
        distance: Math.round(distance),
        reasons: reasons.length > 0 ? reasons : undefined
    };
}

// Generate proof hash
function generateProofHash(data) {
    const str = JSON.stringify(data);
    return '0x' + crypto.createHash('sha256').update(str).digest('hex');
}

// ==================== CAMPAIGN APIS ====================

// Create campaign
app.post('/api/campaigns', (req, res) => {
    const { 
        creator, name, description, stadiumId, startTime, endTime, 
        rewardTier, rewardPoints, sponsor 
    } = req.body;
    
    const stadium = CONFIG.stadiums[stadiumId];
    if (!stadium) {
        return res.status(400).json({ error: 'Invalid stadium' });
    }
    
    const campaignId = 'camp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const campaign = {
        id: campaignId,
        creator,
        name,
        description,
        stadiumId,
        stadiumLat: stadium.lat,
        stadiumLng: stadium.lng,
        geoRadius: stadium.radius,
        startTime: startTime || Date.now(),
        endTime: endTime || (Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        rewardTier: rewardTier || 'bronze',
        rewardPoints: rewardPoints || 100,
        sponsor: sponsor || null,
        sponsorFee: sponsor ? 1000 : 0,
        active: true,
        createdAt: Date.now()
    };
    
    db.campaigns.set(campaignId, campaign);
    
    res.json({ success: true, campaign });
});

// Get campaign
app.get('/api/campaigns/:id', (req, res) => {
    const campaign = db.campaigns.get(req.params.id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(campaign);
});

// List campaigns
app.get('/api/campaigns', (req, res) => {
    const stadiumId = req.query.stadiumId;
    let campaigns = Array.from(db.campaigns.values());
    
    if (stadiumId) {
        campaigns = campaigns.filter(c => c.stadiumId === stadiumId);
    }
    
    res.json({ campaigns });
});

// ==================== VALIDATION APIS ====================

// Validate location (anti-spoof)
app.post('/api/validate-location', (req, res) => {
    const { lat, lng, accuracy, deviceInfo, stadiumId } = req.body;
    
    const validation = validateLocation(lat, lng, accuracy, deviceInfo, stadiumId);
    
    res.json(validation);
});

// Check in to campaign
app.post('/api/checkin', (req, res) => {
    const { wallet, campaignId, lat, lng, accuracy, deviceInfo, influencerId } = req.body;
    
    // Validate location
    const campaign = db.campaigns.get(campaignId);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const validation = validateLocation(lat, lng, accuracy, deviceInfo, campaign.stadiumId);
    
    if (!validation.valid) {
        return res.status(400).json({ 
            success: false, 
            error: 'Location validation failed',
            details: validation
        });
    }
    
    // Generate NFT data
    const nftId = 'nft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const nft = {
        id: nftId,
        owner: wallet,
        campaignId,
        timestamp: Date.now(),
        lat,
        lng,
        influencerId,
        proofHash: generateProofHash({ wallet, campaignId, lat, lng, timestamp: Date.now() })
    };
    
    db.nfts.set(nftId, nft);
    
    // Track join
    if (!db.campaignJoins.has(campaignId)) {
        db.campaignJoins.set(campaignId, []);
    }
    db.campaignJoins.get(campaignId).push({ wallet, nftId, timestamp: Date.now() });
    
    res.json({
        success: true,
        nft,
        validation,
        reward: campaign.rewardPoints
    });
});

// ==================== NFT APIS ====================

// Get NFT details
app.get('/api/nfts/:id', (req, res) => {
    const nft = db.nfts.get(req.params.id);
    if (!nft) {
        return res.status(404).json({ error: 'NFT not found' });
    }
    res.json(nft);
});

// Get user's NFTs
app.get('/api/users/:wallet/nfts', (req, res) => {
    const nfts = Array.from(db.nfts.values()).filter(n => n.owner === req.params.wallet);
    res.json({ nfts });
});

// Get campaign joins
app.get('/api/campaigns/:id/joins', (req, res) => {
    const joins = db.campaignJoins.get(req.params.id) || [];
    res.json({ joins, count: joins.length });
});

// ==================== ANALYTICS ====================

// Dashboard stats
app.get('/api/stats', (req, res) => {
    const campaigns = Array.from(db.campaigns.values());
    const nfts = Array.from(db.nfts.values());
    
    // Calculate earnings per influencer
    const earnings = {};
    nfts.forEach(nft => {
        const campaign = db.campaigns.get(nft.campaignId);
        if (campaign) {
            const creator = campaign.creator;
            earnings[creator] = (earnings[creator] || 0) + campaign.rewardPoints;
        }
    });
    
    res.json({
        totalCampaigns: campaigns.length,
        totalNFTs: nfts.length,
        activeCampaigns: campaigns.filter(c => c.active).length,
        earnings
    });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
    console.log(`\n🏏 PSL FanChain API Running on http://localhost:${PORT}`);
    console.log(`Platform Wallet: ${CONFIG.PLATFORM_WALLET}\n`);
});

module.exports = app;