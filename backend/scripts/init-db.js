/**
 * PSL FanChain - Database Schema Initialization
 * Run this script to create all required tables
 */

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'oracle123'
};

async function initDatabase() {
  let connection;
  
  try {
    // Connect without database first
    connection = await mysql.createConnection({
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password
    });

    // Create database if not exists
    await connection.query('CREATE DATABASE IF NOT EXISTS psl_fanchain');
    console.log('✅ Database psl_fanchain created/exists');

    // Use the database
    await connection.query('USE psl_fanchain');

    // Create tables using query (not execute for DDL)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        wallet_address VARCHAR(66) UNIQUE NOT NULL,
        username VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(20),
        role ENUM('user', 'admin', 'super_admin') DEFAULT 'user',
        fan_score INT DEFAULT 0,
        tier ENUM('bronze', 'silver', 'gold', 'vip') DEFAULT 'bronze',
        referral_code VARCHAR(20) UNIQUE,
        referred_by INT,
        is_banned BOOLEAN DEFAULT FALSE,
        ban_reason VARCHAR(500),
        banned_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_wallet (wallet_address),
        INDEX idx_role (role),
        INDEX idx_fan_score (fan_score)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table users created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        description VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table roles created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_id INT NOT NULL,
        permission VARCHAR(100) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        UNIQUE KEY unique_role_perm (role_id, permission)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table permissions created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reporter_wallet VARCHAR(66) NOT NULL,
        target_wallet VARCHAR(66),
        target_type ENUM('user', 'influencer', 'campaign') NOT NULL,
        target_id INT,
        reason VARCHAR(255) NOT NULL,
        description TEXT,
        evidence JSON,
        risk_score INT DEFAULT 0,
        status ENUM('pending', 'under_review', 'resolved', 'dismissed') DEFAULT 'pending',
        assigned_admin INT,
        resolution ENUM('dismissed', 'warning', 'temporary_ban', 'permanent_ban', 'campaign_shutdown'),
        resolution_notes TEXT,
        resolved_by INT,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_risk_score (risk_score),
        INDEX idx_target (target_type, target_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table reports created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS moderation_actions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_wallet VARCHAR(66) NOT NULL,
        admin_id INT,
        target_wallet VARCHAR(66),
        target_type ENUM('user', 'influencer', 'campaign') NOT NULL,
        target_id INT,
        action_type ENUM('warning', 'flag', 'temporary_ban', 'permanent_ban', 'unban', 'campaign_shutdown', 'campaign_reactivate', 'dismiss') NOT NULL,
        reason VARCHAR(500),
        evidence JSON,
        duration_days INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin (admin_wallet),
        INDEX idx_target (target_type, target_id),
        INDEX idx_action (action_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table moderation_actions created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS banned_entities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_wallet VARCHAR(66) NOT NULL,
        entity_type ENUM('user', 'influencer', 'device', 'ip') NOT NULL,
        ban_type ENUM('temporary', 'permanent') NOT NULL,
        reason VARCHAR(500),
        banned_by INT,
        banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_active BOOLEAN DEFAULT TRUE,
        appeal_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none',
        appeal_notes TEXT,
        appealed_at DATETIME,
        INDEX idx_wallet (entity_wallet),
        INDEX idx_type (entity_type),
        INDEX idx_expiry (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table banned_entities created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS risk_scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        wallet_address VARCHAR(66) NOT NULL,
        geo_anomaly_score DECIMAL(5,2) DEFAULT 0,
        device_anomaly_score DECIMAL(5,2) DEFAULT 0,
        report_count INT DEFAULT 0,
        wallet_linking_score DECIMAL(5,2) DEFAULT 0,
        total_risk_score DECIMAL(5,2) DEFAULT 0,
        last_calculated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_wallet (wallet_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table risk_scores created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS appeals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        banned_entity_id INT NOT NULL,
        user_wallet VARCHAR(66) NOT NULL,
        explanation TEXT NOT NULL,
        evidence JSON,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        reviewed_by INT,
        review_notes TEXT,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_entity (banned_entity_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table appeals created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        wallet_address VARCHAR(66),
        action_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INT,
        details JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wallet (wallet_address),
        INDEX idx_action (action_type),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table activity_logs created');

    // Insert default roles
    await connection.query(`
      INSERT IGNORE INTO roles (name, description) VALUES 
      ('user', 'Regular user with basic permissions'),
      ('admin', 'Moderator with management permissions'),
      ('super_admin', 'Full system access')
    `);
    console.log('✅ Default roles inserted');

    // Insert default permissions for admin
    const [adminRole] = await connection.query("SELECT id FROM roles WHERE name = 'admin'");
    if (adminRole.length > 0) {
      const adminId = adminRole[0].id;
      const adminPerms = [
        'view_reports', 'create_report', 'manage_reports',
        'ban_user', 'unban_user', 'flag_content',
        'view_users', 'manage_users',
        'view_campaigns', 'manage_campaigns',
        'view_analytics'
      ];
      for (const perm of adminPerms) {
        await connection.query(
          'INSERT IGNORE INTO permissions (role_id, permission) VALUES (?, ?)',
          [adminId, perm]
        );
      }
      console.log('✅ Default admin permissions assigned');
    }

    console.log('\n🎉 Database initialization complete!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
