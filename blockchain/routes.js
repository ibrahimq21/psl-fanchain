/**
 * PSL FanChain - Blockchain Integration Routes
 * 
 * Add to backend/server.js for WireFluid integration
 * 
 * Dependencies:
 * - npm install @wirefluid/sdk
 */

const crypto = require('crypto');

// WireFluid configuration
const BLOCKCHAIN_CONFIG = {
  network: 'testnet', // or 'mainnet'
  rpcUrl: process.env.WIREFLUID_RPC || 'https://rpc.testnet.wirefluid.com',
  chainId: 99999, // WireFluid chain ID
  
  // Contract addresses
  contracts: {
    pslFanCheckIn: '0x...', // Deploy PSLFanCheckIn contract
  },
  
  // Reward configuration
  rewards: {
    basePoints: 10,
    streakBonus: 5,
    stadiumBonus: 20,
    nftMintThreshold: 50
  }
};

// In-memory NFT storage (replace with indexed DB in production)
const nftStore = [];

// Generate check-in hash
function generateCheckInHash(checkInData) {
  const data = JSON.stringify({
    stadiumId: checkInData.stadiumId,
    lat: checkInData.lat,
    lng: checkInData.lng,
    timestamp: checkInData.timestamp,
    deviceId: checkInData.deviceId,
    nonce: checkInData.nonce
  });
  
  return '0x' + crypto.createHash('sha256').update(data).digest('hex');
}

// Add blockchain routes to express app
function addBlockchainRoutes(app) {
  
  /**
   * GET /blockchain/status - Blockchain status
   */
  app.get('/blockchain/status', (req, res) => {
    res.json({
      network: BLOCKCHAIN_CONFIG.network,
      chainId: BLOCKCHAIN_CONFIG.chainId,
      rpcUrl: BLOCKCHAIN_CONFIG.rpcUrl,
      contractAddress: BLOCKCHAIN_CONFIG.contracts.pslFanCheckIn,
      totalNFTs: nftStore.length,
      status: 'connected'
    });
  });
  
  /**
   * POST /blockchain/record - Record verified check-in to blockchain
   * 
   * Request body:
   * {
   *   "checkIn": { ... },  // from /verify endpoint
   *   "walletAddress": "0x..."
   * }
   */
  app.post('/blockchain/record', (req, res) => {
    const { checkIn, walletAddress } = req.body;
    
    if (!checkIn || !walletAddress) {
      return res.status(400).json({
        error: 'Missing checkIn or walletAddress'
      });
    }
    
    // Generate check-in hash
    const checkInHash = generateCheckInHash(checkIn);
    
    // Simulate NFT minting (in production, call WireFluid contract)
    const nft = {
      tokenId: nftStore.length + 1,
      fan: walletAddress,
      stadiumId: checkIn.stadiumId,
      stadiumName: checkIn.stadiumName,
      timestamp: checkIn.timestamp,
      riskScore: checkIn.riskScore,
      checkInHash,
      txHash: '0x' + crypto.randomBytes(32).toString('hex'),
      blockNumber: 12345678,
      createdAt: Date.now()
    };
    
    nftStore.push(nft);
    
    console.log(`[blockchain] NFT #${nft.tokenId} minted for ${walletAddress.slice(0, 6)}...`);
    
    res.json({
      success: true,
      nft: {
        tokenId: nft.tokenId,
        txHash: nft.txHash,
        blockNumber: nft.blockNumber
      },
      message: 'Check-in recorded to WireFluid blockchain'
    });
  });
  
  /**
   * GET /blockchain/nfts/:walletAddress - Get fan's NFTs
   */
  app.get('/blockchain/nfts/:walletAddress', (req, res) => {
    const { walletAddress } = req.params;
    
    const fanNFTs = nftStore.filter(nft => nft.fan === walletAddress);
    
    res.json({
      walletAddress,
      nfts: fanNFTs,
      total: fanNFTs.length
    });
  });
  
  /**
   * GET /blockchain/rewards/:walletAddress - Get reward points
   */
  app.get('/blockchain/rewards/:walletAddress', (req, res) => {
    const { walletAddress } = req.params;
    
    const fanNFTs = nftStore.filter(nft => nft.fan === walletAddress);
    
    // Calculate points
    let points = BLOCKCHAIN_CONFIG.rewards.basePoints * fanNFTs.length;
    
    const uniqueStadiums = [...new Set(fanNFTs.map(n => n.stadiumId))];
    points += uniqueStadiums.length * BLOCKCHAIN_CONFIG.rewards.stadiumBonus;
    
    res.json({
      walletAddress,
      points,
      nftCount: fanNFTs.length,
      uniqueStadiums: uniqueStadiums.length,
      eligibleForNFT: points >= BLOCKCHAIN_CONFIG.rewards.nftMintThreshold,
      threshold: BLOCKCHAIN_CONFIG.rewards.nftMintThreshold
    });
  });
  
  /**
   * GET /blockchain/nfts - Get all NFTs (admin)
   */
  app.get('/blockchain/nfts', (req, res) => {
    res.json({
      nfts: nftStore,
      total: nftStore.length
    });
  });
  
  /**
   * GET /blockchain/contract - Get contract info
   */
  app.get('/blockchain/contract', (req, res) => {
    res.json({
      name: 'PSLFanCheckIn',
      symbol: 'PSLFAN',
      network: BLOCKCHAIN_CONFIG.network,
      chainId: BLOCKCHAIN_CONFIG.chainId,
      contractAddress: BLOCKCHAIN_CONFIG.contracts.pslFanCheckIn,
      features: [
        'ERC721 NFT',
        'Proof of attendance',
        'Points system',
        'Reward tracking'
      ],
      rewards: BLOCKCHAIN_CONFIG.rewards
    });
  });
  
  console.log('[blockchain] Routes added to Express app');
}

module.exports = {
  BLOCKCHAIN_CONFIG,
  addBlockchainRoutes
};