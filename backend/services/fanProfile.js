/**
 * PSL FanChain - User Profile & Fan Score System
 * 
 * Features:
 * - Fan Score calculation
 * - Tier system (Bronze, Silver, Gold, VIP)
 * - Campaign history
 * - NFT collection tracking
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// User profiles store
const userProfiles = new Map();

// Tier configuration
const TIER_CONFIG = {
  bronze: { min: 0, max: 999, name: 'Bronze', color: '#CD7F32', perks: ['Basic campaigns', 'Standard rewards'] },
  silver: { min: 1000, max: 4999, name: 'Silver', color: '#C0C0C0', perks: ['Priority campaigns', '2x rewards', 'Monthly bonus'] },
  gold: { min: 5000, max: 19999, name: 'Gold', color: '#FFD700', perks: ['Exclusive campaigns', '3x rewards', 'VIP events access'] },
  vip: { min: 20000, max: Infinity, name: 'VIP', color: '#9B59B6', perks: ['Private drops', '5x rewards', 'Meet & greet', 'Influencer rewards'] }
};

// Score events
const SCORE_EVENTS = {
  campaign_join: 10,
  campaign_complete: 50,
  checkin: 25,
  nft_mint: 100,
  referral: 75,
  social_share: 15,
  task_complete: 20,
  event_attendance: 50,
  streak_bonus: 30
};

/**
 * Create or get user profile
 */
function getUserProfile(walletAddress) {
  if (!userProfiles.has(walletAddress)) {
    userProfiles.set(walletAddress, {
      walletAddress,
      fanScore: 0,
      tier: 'bronze',
      campaignCount: 0,
      checkInCount: 0,
      nftCount: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActive: null,
      joinedAt: new Date().toISOString(),
      campaigns: [],
      nfts: [],
      achievements: [],
      referralCode: generateReferralCode()
    });
  }
  return userProfiles.get(walletAddress);
}

/**
 * Generate unique referral code
 */
function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PSL-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Calculate tier from fan score
 */
function calculateTier(fanScore) {
  if (fanScore >= TIER_CONFIG.vip.min) return 'vip';
  if (fanScore >= TIER_CONFIG.gold.min) return 'gold';
  if (fanScore >= TIER_CONFIG.silver.min) return 'silver';
  return 'bronze';
}

/**
 * Add score to user
 */
function addScore(walletAddress, eventType, metadata = {}) {
  const profile = getUserProfile(walletAddress);
  const scoreToAdd = SCORE_EVENTS[eventType] || 10;
  
  profile.fanScore += scoreToAdd;
  profile.lastActive = new Date().toISOString();
  
  // Update tier
  const newTier = calculateTier(profile.fanScore);
  if (newTier !== profile.tier) {
    profile.tier = newTier;
    profile.achievements.push({
      type: 'tier_upgrade',
      from: profile.tier,
      to: newTier,
      timestamp: new Date().toISOString()
    });
  }
  
  // Track campaign participation
  if (eventType === 'campaign_join' || eventType === 'campaign_complete') {
    if (metadata.campaignId && !profile.campaigns.includes(metadata.campaignId)) {
      profile.campaigns.push(metadata.campaignId);
      profile.campaignCount = profile.campaigns.length;
    }
  }
  
  // Track check-ins
  if (eventType === 'checkin') {
    profile.checkInCount++;
    // Streak logic
    const lastCheckIn = profile.lastCheckIn ? new Date(profile.lastCheckIn) : null;
    const now = new Date();
    if (lastCheckIn) {
      const daysDiff = Math.floor((now - lastCheckIn) / (1000 * 60 * 60 * 24));
      if (daysDiff === 1) {
        profile.currentStreak++;
        profile.fanScore += SCORE_EVENTS.streak_bonus;
      } else if (daysDiff > 1) {
        profile.currentStreak = 1;
      }
    } else {
      profile.currentStreak = 1;
    }
    profile.longestStreak = Math.max(profile.longestStreak, profile.currentStreak);
    profile.lastCheckIn = now.toISOString();
  }
  
  // Track NFT
  if (eventType === 'nft_mint') {
    profile.nfts.push(metadata.nftId || uuidv4());
    profile.nftCount = profile.nfts.length;
  }
  
  return {
    fanScore: profile.fanScore,
    tier: profile.tier,
    tierInfo: TIER_CONFIG[profile.tier],
    scoreAdded: scoreToAdd
  };
}

/**
 * Get user profile with tier info
 */
function getProfileWithTier(walletAddress) {
  const profile = getUserProfile(walletAddress);
  return {
    ...profile,
    tierInfo: TIER_CONFIG[profile.tier],
    allTiers: TIER_CONFIG
  };
}

/**
 * Get leaderboard
 */
function getLeaderboard(limit = 10) {
  const profiles = Array.from(userProfiles.values());
  return profiles
    .sort((a, b) => b.fanScore - a.fanScore)
    .slice(0, limit)
    .map((p, index) => ({
      rank: index + 1,
      walletAddress: p.walletAddress,
      fanScore: p.fanScore,
      tier: p.tier,
      campaignCount: p.campaignCount,
      nftCount: p.nftCount
    }));
}

/**
 * Get tier perks
 */
function getTierPerks(tier) {
  return TIER_CONFIG[tier] || TIER_CONFIG.bronze;
}

/**
 * Export functions
 */
module.exports = {
  userProfiles,
  TIER_CONFIG,
  SCORE_EVENTS,
  getUserProfile,
  getProfileWithTier,
  addScore,
  calculateTier,
  getLeaderboard,
  getTierPerks,
  generateReferralCode
};
