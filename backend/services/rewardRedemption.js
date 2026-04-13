/**
 * PSL FanChain - Reward Redemption System
 * 
 * Features:
 * - Reward catalog
 * - Redemption workflow
 * - Voucher generation
 */

const { v4: uuidv4 } = require('uuid');

// Reward catalog
const REWARD_CATALOG = {
  // Merchandise
  merchandise: [
    { id: 'jersey_2026', name: 'PSL 2026 Jersey', cost: 500, type: 'merchandise', stock: 100, image: '👕' },
    { id: 'cap_psl', name: 'PSL Cap', cost: 200, type: 'merchandise', stock: 200, image: '🧢' },
    { id: 'scarf_lhr', name: 'Lahore Qalandars Scarf', cost: 300, type: 'merchandise', stock: 150, image: '🧣' },
    { id: 'keychain', name: 'PSL Keychain', cost: 100, type: 'merchandise', stock: 500, image: '🔑' },
    { id: 'mug', name: 'PSL Coffee Mug', cost: 250, type: 'merchandise', stock: 300, image: '☕' }
  ],
  // Tickets
  tickets: [
    { id: 'ticket_ground', name: 'Ground Pass', cost: 1000, type: 'ticket', stock: 50, event: 'PSL 2026' },
    { id: 'ticket_vip_box', name: 'VIP Box Seating', cost: 5000, type: 'ticket', stock: 10, event: 'PSL 2026' },
    { id: 'ticket_final', name: 'Final Match Ticket', cost: 3000, type: 'ticket', stock: 25, event: 'PSL Final 2026' }
  ],
  // Experiences
  experiences: [
    { id: 'meet_player', name: 'Meet a Player', cost: 10000, type: 'experience', stock: 5, description: 'Meet your favorite player' },
    { id: 'ground_tour', name: 'Stadium Tour', cost: 2000, type: 'experience', stock: 20, description: 'Behind the scenes tour' },
    { id: 'photo_kit', name: 'Photo with Trophy', cost: 1500, type: 'experience', stock: 30, description: 'Professional photo with trophy' }
  ],
  // NFT Rewards
  nfts: [
    { id: 'nft_bronze_badge', name: 'Bronze Fan Badge', cost: 500, type: 'nft', rarity: 'common' },
    { id: 'nft_silver_badge', name: 'Silver Fan Badge', cost: 1500, type: 'nft', rarity: 'rare' },
    { id: 'nft_gold_badge', name: 'Gold Fan Badge', cost: 5000, type: 'nft', rarity: 'epic' },
    { id: 'nft_champion', name: 'Champion NFT', cost: 10000, type: 'nft', rarity: 'legendary' }
  ]
};

// Redemption store
const redemptions = new Map();

/**
 * Get all rewards
 */
function getRewardCatalog() {
  return REWARD_CATALOG;
}

/**
 * Get rewards by type
 */
function getRewardsByType(type) {
  return REWARD_CATALOG[type] || [];
}

/**
 * Get single reward
 */
function getReward(rewardId) {
  for (const category of Object.values(REWARD_CATALOG)) {
    const reward = category.find(r => r.id === rewardId);
    if (reward) return reward;
  }
  return null;
}

/**
 * Check if reward is available
 */
function isRewardAvailable(rewardId) {
  const reward = getReward(rewardId);
  if (!reward) return { available: false, reason: 'Reward not found' };
  if (reward.stock !== undefined && reward.stock <= 0) {
    return { available: false, reason: 'Out of stock' };
  }
  return { available: true };
}

/**
 * Redeem reward
 */
function redeemReward(userWallet, rewardId, fanScore) {
  const reward = getReward(rewardId);
  
  if (!reward) {
    return { success: false, message: 'Reward not found' };
  }
  
  if (reward.stock !== undefined && reward.stock <= 0) {
    return { success: false, message: 'Out of stock' };
  }
  
  if (fanScore < reward.cost) {
    return { success: false, message: `Insufficient fan score. Need ${reward.cost}, have ${fanScore}` };
  }
  
  // Generate voucher
  const voucherId = `VCHR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const redemption = {
    id: uuidv4(),
    voucherId,
    userWallet,
    reward: {
      id: reward.id,
      name: reward.name,
      type: reward.type,
      image: reward.image || '🎁'
    },
    cost: reward.cost,
    redeemedAt: new Date().toISOString(),
    status: 'active',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
  };
  
  // Reduce stock
  if (reward.stock !== undefined) {
    reward.stock--;
  }
  
  // Store redemption
  if (!redemptions.has(userWallet)) {
    redemptions.set(userWallet, []);
  }
  redemptions.get(userWallet).push(redemption);
  
  return {
    success: true,
    redemption,
    message: `Successfully redeemed ${reward.name}!`
  };
}

/**
 * Get user redemptions
 */
function getUserRedemptions(userWallet) {
  return redemptions.get(userWallet) || [];
}

/**
 * Get active redemptions
 */
function getActiveRedemptions(userWallet) {
  const userRedemptions = redemptions.get(userWallet) || [];
  return userRedemptions.filter(r => r.status === 'active');
}

/**
 * Use/Claim voucher
 */
function claimVoucher(userWallet, voucherId) {
  const userRedemptions = redemptions.get(userWallet) || [];
  const redemption = userRedemptions.find(r => r.voucherId === voucherId);
  
  if (!redemption) {
    return { success: false, message: 'Voucher not found' };
  }
  
  if (redemption.status !== 'active') {
    return { success: false, message: 'Voucher already claimed or expired' };
  }
  
  // Check expiry
  if (new Date(redemption.expiresAt) < new Date()) {
    redemption.status = 'expired';
    return { success: false, message: 'Voucher expired' };
  }
  
  redemption.status = 'claimed';
  redemption.claimedAt = new Date().toISOString();
  
  return {
    success: true,
    redemption,
    message: 'Voucher claimed successfully!'
  };
}

/**
 * Get reward cost by ID
 */
function getRewardCost(rewardId) {
  const reward = getReward(rewardId);
  return reward ? reward.cost : 0;
}

module.exports = {
  REWARD_CATALOG,
  redemptions,
  getRewardCatalog,
  getRewardsByType,
  getReward,
  isRewardAvailable,
  redeemReward,
  getUserRedemptions,
  getActiveRedemptions,
  claimVoucher,
  getRewardCost
};
