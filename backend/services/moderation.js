/**
 * PSL FanChain - Moderation Service
 * Handles reports, bans, risk scoring, and appeals
 */

const db = require('../config/database');

class ModerationService {
  
  // ==================== USER MANAGEMENT ====================

  /**
   * Create or update user
   */
  async upsertUser(walletAddress, userData = {}) {
    const [result] = await db.execute(
      `INSERT INTO users (wallet_address, username, email, role, fan_score, tier)
       VALUES (?, ?, ?, 'user', 0, 'bronze')
       ON DUPLICATE KEY UPDATE username = VALUES(username), email = VALUES(email)`,
      [walletAddress, userData.username || null, userData.email || null]
    );
    return result;
  }

  /**
   * Get user by wallet
   */
  async getUser(walletAddress) {
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE wallet_address = ?',
      [walletAddress]
    );
    return rows[0] || null;
  }

  /**
   * Get user role
   */
  async getUserRole(walletAddress) {
    const user = await this.getUser(walletAddress);
    return user?.role || 'user';
  }

  /**
   * Check if user is admin
   */
  async isAdmin(walletAddress) {
    const role = await this.getUserRole(walletAddress);
    return ['admin', 'super_admin'].includes(role);
  }

  /**
   * Check if user is banned
   */
  async isBanned(walletAddress) {
    const [rows] = await db.execute(
      'SELECT is_active FROM banned_entities WHERE entity_wallet = ? AND is_active = TRUE AND (ban_type = "permanent" OR expires_at > NOW())',
      [walletAddress]
    );
    return rows.length > 0;
  }

  /**
   * Promote user to admin
   */
  async promoteToAdmin(walletAddress, promotedBy) {
    await db.execute(
      'UPDATE users SET role = "admin" WHERE wallet_address = ?',
      [walletAddress]
    );
    
    // Log action
    await this.logModerationAction(promotedBy, walletAddress, 'user', null, 'promote', 'Promoted to admin');
    
    return { success: true, message: 'User promoted to admin' };
  }

  // ==================== REPORTS ====================

  /**
   * Submit a report
   */
  async createReport(data) {
    const { reporter_wallet, target_wallet, target_type, target_id, reason, description, evidence } = data;
    
    const [result] = await db.execute(
      `INSERT INTO reports (reporter_wallet, target_wallet, target_type, target_id, reason, description, evidence, risk_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [reporter_wallet, target_wallet, target_type, target_id, reason, description, JSON.stringify(evidence || {}), 0]
    );
    
    // Update risk score for target
    await this.updateRiskScore(target_wallet);
    
    return { success: true, report_id: result.insertId };
  }

  /**
   * Get reports queue (sorted by risk)
   */
  async getReportsQueue(filters = {}) {
    let query = 'SELECT * FROM reports WHERE 1=1';
    const params = [];
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.minRisk) {
      query += ' AND risk_score >= ?';
      params.push(filters.minRisk);
    }
    
    query += ' ORDER BY risk_score DESC, created_at ASC';
    
    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * Get single report
   */
  async getReport(reportId) {
    const [rows] = await db.execute('SELECT * FROM reports WHERE id = ?', [reportId]);
    return rows[0] || null;
  }

  /**
   * Assign report to admin
   */
  async assignReport(reportId, adminId) {
    await db.execute(
      'UPDATE reports SET assigned_admin = ?, status = "under_review" WHERE id = ?',
      [adminId, reportId]
    );
  }

  // ==================== MODERATION ACTIONS ====================

  /**
   * Log moderation action
   */
  async logModerationAction(adminWallet, targetWallet, targetType, targetId, actionType, reason, evidence = {}, durationDays = null) {
    await db.execute(
      `INSERT INTO moderation_actions (admin_wallet, target_wallet, target_type, target_id, action_type, reason, evidence, duration_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminWallet, targetWallet, targetType, targetId, actionType, reason, JSON.stringify(evidence), durationDays]
    );
  }

  /**
   * Get moderation history for user
   */
  async getModerationHistory(walletAddress) {
    const [rows] = await db.execute(
      'SELECT * FROM moderation_actions WHERE target_wallet = ? ORDER BY created_at DESC',
      [walletAddress]
    );
    return rows;
  }

  // ==================== BANS ====================

  /**
   * Ban user
   */
  async banUser(adminWallet, targetWallet, banType, reason, durationDays = null) {
    const expiresAt = banType === 'temporary' 
      ? new Date(Date.now() + (durationDays || 7) * 24 * 60 * 60 * 1000)
      : null;
    
    await db.execute(
      `INSERT INTO banned_entities (entity_wallet, entity_type, ban_type, reason, banned_by, expires_at)
       VALUES (?, 'user', ?, ?, ?, ?)`,
      [targetWallet, banType, reason, adminWallet, expiresAt]
    );
    
    await db.execute(
      'UPDATE users SET is_banned = TRUE, ban_reason = ? WHERE wallet_address = ?',
      [reason, targetWallet]
    );
    
    // Log action
    await this.logModerationAction(adminWallet, targetWallet, 'user', null, banType === 'permanent' ? 'permanent_ban' : 'temporary_ban', reason, {}, durationDays);
    
    return { success: true, message: `User ${banType === 'permanent' ? 'permanently banned' : `banned for ${durationDays} days`}` };
  }

  /**
   * Unban user
   */
  async unbanUser(adminWallet, targetWallet, reason) {
    await db.execute(
      'UPDATE banned_entities SET is_active = FALSE WHERE entity_wallet = ? AND entity_type = "user"',
      [targetWallet]
    );
    
    await db.execute(
      'UPDATE users SET is_banned = FALSE, ban_reason = NULL WHERE wallet_address = ?',
      [targetWallet]
    );
    
    await this.logModerationAction(adminWallet, targetWallet, 'user', null, 'unban', reason);
    
    return { success: true, message: 'User unbanned' };
  }

  /**
   * Flag user (soft action)
   */
  async flagUser(adminWallet, targetWallet, reason) {
    await this.logModerationAction(adminWallet, targetWallet, 'user', null, 'flag', reason);
    return { success: true, message: 'User flagged for monitoring' };
  }

  /**
   * Get active bans
   */
  async getActiveBans() {
    const [rows] = await db.execute(
      'SELECT * FROM banned_entities WHERE is_active = TRUE AND (ban_type = "permanent" OR expires_at > NOW())'
    );
    return rows;
  }

  // ==================== RISK SCORING ====================

  /**
   * Calculate risk score for user
   * Formula: risk_score = (geo_anomaly * 0.3) + (device_anomaly * 0.2) + (report_count * 0.2) + (wallet_linking * 0.3)
   */
  async calculateRiskScore(walletAddress) {
    // Get report count
    const [reports] = await db.execute(
      'SELECT COUNT(*) as count FROM reports WHERE target_wallet = ? AND status != "dismissed"',
      [walletAddress]
    );
    const reportCount = reports[0]?.count || 0;
    
    // Risk weights (simplified for now)
    const geoAnomalyScore = 0; // Would be calculated from check-in patterns
    const deviceAnomalyScore = 0; // Would be calculated from device fingerprints
    const walletLinkingScore = 0; // Would be calculated from wallet relationships
    
    const totalRisk = (geoAnomalyScore * 0.3) + (deviceAnomalyScore * 0.2) + (reportCount * 0.2 * 25) + (walletLinkingScore * 0.3);
    
    // Update or insert risk score
    await db.execute(
      `INSERT INTO risk_scores (wallet_address, geo_anomaly_score, device_anomaly_score, report_count, wallet_linking_score, total_risk_score)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE geo_anomaly_score = VALUES(geo_anomaly_score), device_anomaly_score = VALUES(device_anomaly_score),
       report_count = VALUES(report_count), wallet_linking_score = VALUES(wallet_linking_score), total_risk_score = VALUES(total_risk_score)`,
      [walletAddress, geoAnomalyScore, deviceAnomalyScore, reportCount, walletLinkingScore, totalRisk]
    );
    
    // Update report risk scores
    await db.execute(
      'UPDATE reports SET risk_score = ? WHERE target_wallet = ?',
      [totalRisk, walletAddress]
    );
    
    return totalRisk;
  }

  /**
   * Update risk score for user
   */
  async updateRiskScore(walletAddress) {
    return await this.calculateRiskScore(walletAddress);
  }

  /**
   * Get user risk score
   */
  async getRiskScore(walletAddress) {
    const [rows] = await db.execute(
      'SELECT * FROM risk_scores WHERE wallet_address = ?',
      [walletAddress]
    );
    return rows[0] || null;
  }

  // ==================== APPEALS ====================

  /**
   * Submit appeal
   */
  async submitAppeal(bannedEntityId, walletAddress, explanation, evidence = {}) {
    const [result] = await db.execute(
      `INSERT INTO appeals (banned_entity_id, user_wallet, explanation, evidence)
       VALUES (?, ?, ?, ?)`,
      [bannedEntityId, walletAddress, explanation, JSON.stringify(evidence)]
    );
    
    await db.execute(
      'UPDATE banned_entities SET appeal_status = "pending", appealed_at = NOW() WHERE id = ?',
      [bannedEntityId]
    );
    
    return { success: true, appeal_id: result.insertId };
  }

  /**
   * Get appeals queue
   */
  async getAppealsQueue() {
    const [rows] = await db.execute(
      'SELECT * FROM appeals WHERE status = "pending" ORDER BY created_at ASC'
    );
    return rows;
  }

  /**
   * Resolve appeal
   */
  async resolveAppeal(appealId, adminId, approved, reviewNotes) {
    const [appeal] = await db.execute('SELECT * FROM appeals WHERE id = ?', [appealId]);
    if (!appeal[0]) return { success: false, message: 'Appeal not found' };
    
    await db.execute(
      'UPDATE appeals SET status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = NOW() WHERE id = ?',
      [approved ? 'approved' : 'rejected', adminId, reviewNotes, appealId]
    );
    
    if (approved) {
      // Unban the user
      await db.execute(
        'UPDATE banned_entities SET is_active = FALSE, appeal_status = "approved" WHERE id = ?',
        [appeal[0].banned_entity_id]
      );
      
      await db.execute(
        'UPDATE users SET is_banned = FALSE, ban_reason = NULL WHERE wallet_address = ?',
        [appeal[0].user_wallet]
      );
    } else {
      await db.execute(
        'UPDATE banned_entities SET appeal_status = "rejected" WHERE id = ?',
        [appeal[0].banned_entity_id]
      );
    }
    
    return { success: true, message: approved ? 'Appeal approved, user unbanned' : 'Appeal rejected' };
  }

  // ==================== ANALYTICS ====================

  /**
   * Get moderation stats
   */
  async getModerationStats() {
    const [totalReports] = await db.execute('SELECT COUNT(*) as count FROM reports');
    const [pendingReports] = await db.execute('SELECT COUNT(*) as count FROM reports WHERE status = "pending"');
    const [activeBans] = await db.execute('SELECT COUNT(*) as count FROM banned_entities WHERE is_active = TRUE');
    const [pendingAppeals] = await db.execute('SELECT COUNT(*) as count FROM appeals WHERE status = "pending"');
    
    return {
      totalReports: totalReports[0]?.count || 0,
      pendingReports: pendingReports[0]?.count || 0,
      activeBans: activeBans[0]?.count || 0,
      pendingAppeals: pendingAppeals[0]?.count || 0
    };
  }
}

module.exports = new ModerationService();
