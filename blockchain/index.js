/**
 * PSL FanChain - WireFluid Blockchain Integration
 * 
 * This module provides:
 * - Smart contract for proof-of-attendance NFTs
 * - WireFluid SDK integration
 * - Check-in hash recording
 * - NFT minting on verified check-ins
 * 
 * WireFluid: Cosmos-based with EVM compatibility
 * - 2,500 TPS
 * - Sub-3 second finality
 * - $0.01 tx fee
 * - Mobile money withdrawals
 */

const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/.env' });

// ==================== CONFIGURATION ====================

const CONFIG = {
  // WireFluid network (testnet)
  network: {
    rpc: process.env.WIREFLUID_RPC || 'https://evm.wirefluid.com',
    chainId: parseInt(process.env.WIREFLUID_CHAIN_ID) || 92533,
    chainName: process.env.WIREFLUID_NETWORK_NAME || 'WireFluid Testnet',
    currency: process.env.WIREFLUID_CURRENCY || 'WIRE'
  },
  
  // Contract configuration
  contract: {
    // PSL FanChain Check-in NFT Contract
    address: process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000001', // Deploy to obtain real address
    abi: CHECKIN_NFT_ABI
  },
  
  // Reward configuration
  rewards: {
    basePoints: parseInt(process.env.REWARDS_BASE_POINTS) || 10,
    streakBonus: parseInt(process.env.REWARDS_STREAK_BONUS) || 5,
    stadiumBonus: parseInt(process.env.REWARDS_STADIUM_BONUS) || 20,
    nftMintThreshold: parseInt(process.env.REWARDS_NFT_MINT_THRESHOLD) || 50
  }
};

// ==================== SMART CONTRACT ABI ====================

const CHECKIN_NFT_ABI = [
  // Check-in event
  "event CheckIn(uint256 indexed tokenId, address indexed fan, string stadiumId, uint256 timestamp, uint256 riskScore)",
  
  // Functions
  "function recordCheckIn(address fan, string stadiumId, uint256 timestamp, uint256 riskScore, bytes32 checkInHash) returns (uint256)",
  "function getCheckInCount(address fan) view returns (uint256)",
  "function getCheckIn(uint256 tokenId) view returns (address fan, string stadiumId, uint256 timestamp, uint256 riskScore)",
  "function getTotalCheckIns() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)"
];

// ==================== CHECK-IN NFT CONTRACT ====================

/**
 * PSL FanChain Check-In NFT Contract (Solidity)
 * 
 * Deploy to WireFluid EVM:
 * https://docs.wirefluid.com/deploy
 */
const PSL_FANCHECK_NFT_CONTRACT = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title PSLFanCheckIn NFT
 * @notice NFT issued for verified PSL stadium check-ins
 * @dev Records tamper-proof attendance on WireFluid blockchain
 */
contract PSLFanCheckIn is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
    
    // Struct for check-in data
    struct CheckInData {
        address fan;
        string stadiumId;
        uint256 timestamp;
        uint256 riskScore;
        bytes32 checkInHash;
    }
    
    // Mapping token ID to check-in data
    mapping(uint256 => CheckInData) public checkIns;
    
    // Mapping fan address to their check-in count
    mapping(address => uint256) public fanCheckInCount;
    
    // Total verified check-ins
    uint256 public totalCheckIns;
    
    // Events
    event CheckIn(
        uint256 indexed tokenId,
        address indexed fan,
        string stadiumId,
        uint256 timestamp,
        uint256 riskScore,
        bytes32 checkInHash
    );
    
    constructor() ERC721("PSL Fan Check-In", "PSLFAN") Ownable(msg.sender) {}
    
    /**
     * @notice Record a verified check-in and mint NFT
     * @param fan Fan address
     * @param stadiumId Stadium identifier (e.g., "lahore", "karachi")
     * @param timestamp Check-in timestamp
     * @param riskScore Risk score from backend validation
     * @param checkInHash Hash of check-in data for verification
     */
    function recordCheckIn(
        address fan,
        string memory stadiumId,
        uint256 timestamp,
        uint256 riskScore,
        bytes32 checkInHash
    ) public onlyOwner returns (uint256) {
        require(fan != address(0), "Invalid fan address");
        require(bytes(stadiumId).length > 0, "Invalid stadium ID");
        require(riskScore < 70, "Risk score too high");
        
        _tokenIds.increment();
        uint256 tokenId = _tokenIds.current();
        
        _safeMint(fan, tokenId);
        
        // Store check-in data
        checkIns[tokenId] = CheckInData({
            fan: fan,
            stadiumId: stadiumId,
            timestamp: timestamp,
            riskScore: riskScore,
            checkInHash: checkInHash
        });
        
        fanCheckInCount[fan]++;
        totalCheckIns++;
        
        // Set metadata URI
        _setTokenURI(tokenId, _generateTokenURI(tokenId, stadiumId, timestamp));
        
        emit CheckIn(tokenId, fan, stadiumId, timestamp, riskScore, checkInHash);
        
        return tokenId;
    }
    
    /**
     * @notice Get check-in count for a fan
     * @param fan Fan address
     */
    function getCheckInCount(address fan) public view returns (uint256) {
        return fanCheckInCount[fan];
    }
    
    /**
     * @notice Get total check-ins
     */
    function getTotalCheckIns() public view returns (uint256) {
        return totalCheckIns;
    }
    
    /**
     * @notice Generate token URI for NFT metadata
     */
    function _generateTokenURI(
        uint256 tokenId,
        string memory stadiumId,
        uint256 timestamp
    ) internal pure returns (string memory) {
        // Return JSON metadata
        // In production, upload to IPFS and return IPFS hash
        return string(abi.encodePacked(
            "data:application/json,{\"name\":\"PSL Fan Check-In #",
            Strings.toString(tokenId),
            "\",\"description\":\"PSL stadium attendance verification for ",
            stadiumId,
            "\",\"attributes\":[{\"trait_type\":\"Stadium\",\"value\":\"",
            stadiumId,
            "\"},{\"trait_type\":\"Timestamp\",\"value\":",
            Strings.toString(timestamp),
            "}],\"image\":\"ipfs://placeholder\"}"
        ));
    }
    
    // Override required by Solidity
    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
`;

// ==================== BLOCKCHAIN SERVICE ====================

/**
 * Blockchain service for WireFluid integration
 */
class BlockchainService {
  constructor(config) {
    this.config = config;
    this.checkIns = [];
  }
  
  /**
   * Generate check-in hash for blockchain recording
   * @returns SHA-256 hash of check-in data
   */
  generateCheckInHash(checkInData) {
    const data = JSON.stringify({
      stadiumId: checkInData.stadiumId,
      lat: checkInData.lat,
      lng: checkInData.lng,
      timestamp: checkInData.timestamp,
      deviceId: checkInData.deviceId,
      nonce: checkInData.nonce
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Record verified check-in to blockchain
   * 
   * In production, this would:
   * 1. Connect to WireFluid wallet (MetaMask/WalletConnect)
   * 2. Call contract method recordCheckIn()
   * 3. Return transaction hash
   */
  async recordCheckIn(checkIn, walletAddress) {
    const checkInHash = this.generateCheckInHash(checkIn);
    
    // Simulated blockchain record
    const blockchainRecord = {
      tokenId: this.checkIns.length + 1,
      fan: walletAddress,
      stadiumId: checkIn.stadiumId,
      stadiumName: checkIn.stadiumName,
      timestamp: checkIn.timestamp,
      riskScore: checkIn.riskScore,
      checkInHash: checkInHash,
      txHash: '0x' + crypto.randomBytes(32).toString('hex'),
      blockNumber: 12345678,
      verifiedAt: Date.now()
    };
    
    this.checkIns.push(blockchainRecord);
    
    return blockchainRecord;
  }
  
  /**
   * Get fan's NFT count
   */
  async getFanNFTS(walletAddress) {
    return this.checkIns.filter(c => c.fan === walletAddress);
  }
  
  /**
   * Calculate reward points
   */
  calculatePoints(checkIns, stadiumId, streakDays) {
    let points = CONFIG.rewards.basePoints;
    
    // Streak bonus
    if (streakDays > 0) {
      points += CONFIG.rewards.streakBonus * Math.min(streakDays, 5);
    }
    
    // Stadium bonus (special matches)
    const specialStadiums = ['final', 'semi-final'];
    if (specialStadiums.includes(stadiumId.toLowerCase())) {
      points += CONFIG.rewards.stadiumBonus;
    }
    
    return points;
  }
  
  /**
   * Get contract deployment info
   */
  getContractInfo() {
    return {
      name: 'PSLFanCheckIn',
      symbol: 'PSLFAN',
      network: 'WireFluid EVM',
      rpc: this.config.network.rpc,
      contractAddress: this.config.contract.address,
      totalSupply: this.checkIns.length,
      features: [
        'ERC721 NFT',
        'ERC721URIStorage',
        'Check-in recording',
        'Points system',
        'NFT minting on threshold'
      ]
    };
  }
}

// ==================== INTEGRATION WITH BACKEND ====================

/**
 * Extend backend with blockchain integration
 */
function integrateWithBackend(app, blockchainService) {
  /**
   * POST /blockchain/record - Record verified check-in to blockchain
   */
  app.post('/blockchain/record', async (req, res) => {
    const { checkIn, walletAddress } = req.body;
    
    if (!checkIn || !walletAddress) {
      return res.status(400).json({
        error: 'Missing checkIn or walletAddress'
      });
    }
    
    try {
      const result = await blockchainService.recordCheckIn(checkIn, walletAddress);
      
      res.json({
        success: true,
        blockchain: {
          tokenId: result.tokenId,
          txHash: result.txHash,
          blockNumber: result.blockNumber
        },
        message: 'Check-in recorded to WireFluid blockchain'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Blockchain recording failed',
        details: error.message
      });
    }
  });
  
  /**
   * GET /blockchain/nfts/:walletAddress - Get fan's NFTs
   */
  app.get('/blockchain/nfts/:walletAddress', async (req, res) => {
    const { walletAddress } = req.params;
    
    const nfts = await blockchainService.getFanNFTS(walletAddress);
    
    res.json({
      walletAddress,
      nfts,
      total: nfts.length
    });
  });
  
  /**
   * GET /blockchain/contract - Get contract info
   */
  app.get('/blockchain/contract', (req, res) => {
    res.json(blockchainService.getContractInfo());
  });
  
  /**
   * GET /blockchain/rewards/:walletAddress - Get reward points
   */
  app.get('/blockchain/rewards/:walletAddress', async (req, res) => {
    const { walletAddress } = req.params;
    
    const nfts = await blockchainService.getFanNFTS(walletAddress);
    const points = blockchainService.calculatePoints(
      nfts,
      nfts[0]?.stadiumId || 'none',
      0 // streakDays
    );
    
    res.json({
      walletAddress,
      points,
      nftCount: nfts.length,
      eligibleForNFT: points >= CONFIG.rewards.nftMintThreshold
    });
  });
}

module.exports = {
  CONFIG,
  PSL_FANCHECK_NFT_CONTRACT,
  CHECKIN_NFT_ABI,
  BlockchainService,
  integrateWithBackend
};