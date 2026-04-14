/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import './App.css';

// Environment variables - use .env file
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3003';
const QR_API_URL = process.env.REACT_APP_QR_API_URL || 'https://api.qrserver.com/v1/create-qr-code/';

// ==================== Centralized API Wrapper ====================

// Toast notification helper
const showToast = (message, type = 'error') => {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // You can integrate a toast library here
};

// Fetch with retry and error handling
const fetchWithRetry = async (url, options = {}, retries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      // Check if response is ok
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Fetch attempt ${attempt}/${retries} failed:`, error.message);
      
      if (attempt === retries) {
        showToast(`Failed to fetch: ${error.message}`);
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  throw new Error('Max retries exceeded');
};

// Convenience wrappers
const api = {
  get: (endpoint) => fetchWithRetry(`${API_URL}${endpoint}`),
  post: (endpoint, body) => fetchWithRetry(`${API_URL}${endpoint}`, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => fetchWithRetry(`${API_URL}${endpoint}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => fetchWithRetry(`${API_URL}${endpoint}`, { method: 'DELETE' }),
};

// PSL Stadiums - loaded from backend API or use defaults
// The actual venue list comes from the backend /stadiums endpoint

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wallet, setWallet] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({ totalCampaigns: 0, totalParticipants: 0, totalRewards: 0 });
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [notification, setNotification] = useState(null);
  const [venues, setVenues] = useState([]); // Load from backend
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    stadiumId: '',
    description: '',
    startTime: '',
    endTime: '',
    maxParticipants: 500,
    pointsPerCheckIn: 100,
    bonusPoints: 50,
    rewards: 'both'
  });

  // Demo influencer data
  const [influencerData] = useState({
    name: 'PSL Influencer',
    handle: '@psl_fan',
    avatar: '👤',
    totalFollowers: 125000,
    totalCampaigns: 3,
    totalEarnings: 45000
  });

  // Load data from backend
  useEffect(() => {
    fetchCampaigns();
    fetchStats();
    fetchVenues();
  }, []);

  // Fetch functions using centralized API
  const fetchVenues = async () => {
    try {
      const data = await api.get('/stadiums').catch(() => ({}));
      if (!data || Object.keys(data).length === 0) {
        console.log('Using default venues');
        return;
      }
      const venueOptions = Object.entries(data).map(([key, v]) => ({
        id: key,
        name: v.name || key,
        city: v.city,
        lat: v.lat,
        lng: v.lng,
        isEvent: v.isEvent || false
      }));
      setVenues(venueOptions);
      if (venueOptions.length > 0 && !newCampaign.stadiumId) {
        setNewCampaign(prev => ({ ...prev, stadiumId: venueOptions[0].id }));
      }
    } catch (err) {
      console.error('Failed to fetch venues:', err);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const data = await api.get('/campaigns').catch(() => ({ campaigns: [] }));
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
      setCampaigns([]);
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await api.get('/admin/stats').catch(() => 
        api.get('/campaigns').catch(() => null)
      );
      
      if (data) {
        setStats({
          totalCampaigns: data.campaigns?.length || campaigns.length || 0,
          totalParticipants: data.totalCheckIns || 0,
          totalRewards: data.totalPoints || 0
        });
      } else {
        setStats({ totalCampaigns: campaigns.length, totalParticipants: 0, totalRewards: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setStats({ totalCampaigns: campaigns.length, totalParticipants: 0, totalRewards: 0 });
    } finally {
      setLoading(false);
    }
  };

  // Generate QR code for campaign
  const generateCampaignQR = async (campaign) => {
    try {
      setLoading(true);
      const stadiumId = campaign.stadiumId || campaign.stadiumId;
      const result = await api.post('/generate-qr-payload', {
        campaignId: campaign.id,
        stadiumId: stadiumId
      });
      
      if (result.success) {
        // Generate QR image URL
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.qrData)}`;
        setNotification({
          type: 'success',
          message: `QR Generated! Campaign: ${campaign.name}`
        });
        return { qrUrl, qrData: result.qrData, campaign };
      }
    } catch (err) {
      console.error('QR generation failed:', err);
      setNotification({ type: 'error', message: 'Failed to generate QR' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.startTime) {
      setNotification({ type: 'error', message: 'Please fill in required fields (name and start time)' });
      return;
    }

    const campaign = {
      name: newCampaign.name,
      stadiumId: newCampaign.stadiumId,
      description: newCampaign.description,
      startTime: new Date(newCampaign.startTime).toISOString(),
      endTime: new Date(newCampaign.endTime || newCampaign.startTime).toISOString(),
      rewards: {
        pointsPerCheckIn: newCampaign.pointsPerCheckIn,
        bonusPoints: newCampaign.bonusPoints,
        nftReward: newCampaign.rewards === 'both' || newCampaign.rewards === 'nft'
      },
      maxParticipants: newCampaign.maxParticipants
    };

    try {
      const data = await api.post('/campaigns', campaign);
      
      // Success!
      setNotification({ 
        type: 'success', 
        message: `✅ Campaign "${campaign.name}" created successfully! Campaign ID: ${data.campaign?.id || 'N/A'}`
      });
      
      setCampaigns([...campaigns, data.campaign]);
      setShowCreateForm(false);
      setNewCampaign({ name: '', stadiumId: 'Gaddafi Stadium', description: '', startTime: '', endTime: '', maxParticipants: 500, pointsPerCheckIn: 100, bonusPoints: 50, rewards: 'both' });
      
      // Refresh stats
      fetchStats();
      
    } catch (err) {
      console.error('Campaign creation error:', err);
      setNotification({ 
        type: 'error', 
        message: `❌ Failed to create campaign: ${err.message}. Please try again or check if the backend is running.`
      });
    }
    
    // Clear notification after 5 seconds
    setTimeout(() => setNotification(null), 5000);
  };

  const generateQRCode = (campaignId) => {
    // Use plain campaignId string - no URL encoding needed for QR
    return `${QR_API_URL}?size=300x300&data=${encodeURIComponent(campaignId)}&chose=M&chf=bg%2Cs%2CFFFFFFFF`;
  };
  
  // Generate signed QR on demand
  const handleGenerateSignedQR = async (campaign) => {
    const qrUrl = generateQRCode(campaign.id);
    // Open in new tab
    window.open(qrUrl, '_blank');
  };

  const getStadiumName = (id) => venues.find(s => s.id === id)?.name || id;

  return (
    <div className="app">
      {/* Notification Banner */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}
      
      <header className="header">
        <div className="header-content">
          <div className="brand">
            <span className="logo">🎯</span>
            <div>
              <h1>FanChain Influencer Hub</h1>
              <p>Create campaigns • Engage fans • Earn rewards</p>
            </div>
          </div>
          <div className="influencer-info">
            <span className="avatar">{influencerData.avatar}</span>
            <div>
              <p className="handle">{influencerData.handle}</p>
              <p className="followers">{influencerData.totalFollowers.toLocaleString()} followers</p>
            </div>
          </div>
        </div>
      </header>

      <nav className="nav">
        <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
        <button className={activeTab === 'campaigns' ? 'active' : ''} onClick={() => setActiveTab('campaigns')}>🎯 Campaigns</button>
        <button className={activeTab === 'create' ? 'active' : ''} onClick={() => setActiveTab('create')}>➕ Create</button>
        <button className={activeTab === 'earnings' ? 'active' : ''} onClick={() => setActiveTab('earnings')}>💰 Earnings</button>
      </nav>

      <main className="main">
        {activeTab === 'dashboard' && (
          <div className="dashboard">
            <h2>📊 Performance Overview</h2>
            
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-icon">🎯</span>
                <div className="stat-info">
                  <h3>{campaigns.length}</h3>
                  <p>Active Campaigns</p>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">👥</span>
                <div className="stat-info">
                  <h3>{stats.totalParticipants}</h3>
                  <p>Total Participants</p>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">🏆</span>
                <div className="stat-info">
                  <h3>{stats.totalRewards.toLocaleString()}</h3>
                  <p>Points Distributed</p>
                </div>
              </div>
              <div className="stat-card highlight">
                <span className="stat-icon">💵</span>
                <div className="stat-info">
                  <h3>PKR {influencerData.totalEarnings.toLocaleString()}</h3>
                  <p>Estimated Earnings</p>
                </div>
              </div>
            </div>

            <div className="quick-actions">
              <h3>⚡ Quick Actions</h3>
              <div className="action-buttons">
                <button className="action-btn primary" onClick={() => setActiveTab('create')}>
                  ➕ Create Campaign
                </button>
                <button className="action-btn" onClick={() => setActiveTab('campaigns')}>
                  📋 View Campaigns
                </button>
              </div>
            </div>

            <div className="recent-activity">
              <h3>📈 Recent Activity</h3>
              <div className="activity-list">
                {campaigns.slice(0, 3).map(c => (
                  <div key={c.id} className="activity-item">
                    <span className="activity-icon">✅</span>
                    <div>
                      <p><strong>{c.name}</strong> - {c.currentParticipants || 0} participants</p>
                      <span>{getStadiumName(c.stadiumId)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'campaigns' && (
          <div className="campaigns-tab">
            <h2>🎯 Your Campaigns</h2>
            
            <div className="campaigns-grid">
              {campaigns.map(c => (
                <div key={c.id} className="campaign-card">
                  <div className="campaign-header">
                    <h3>{c.name}</h3>
                    <span className={`status ${c.status || 'active'}`}>
                      {c.status === 'active' ? '🟢 Active' : '⏸️ Ended'}
                    </span>
                  </div>
                  
                  <div className="campaign-details">
                    <p>📍 {getStadiumName(c.stadiumId)}</p>
                    <p>👥 {c.currentParticipants || 0} / {c.maxParticipants || 500} participants</p>
                    <p>🎁 {c.rewards?.pointsPerCheckIn || 100} pts per check-in</p>
                  </div>

                  <div className="campaign-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${((c.currentParticipants || 0) / (c.maxParticipants || 500)) * 100}%` }}
                      />
                    </div>
                    <span>{Math.round(((c.currentParticipants || 0) / (c.maxParticipants || 500)) * 100)}% filled</span>
                  </div>

                  <div className="campaign-qr">
                    <img src={generateQRCode(c.id)} alt="Campaign QR" />
                    <p>Scan to join</p>
                  </div>

                  <div className="campaign-actions">
                    <button className="btn-small" onClick={() => handleGenerateSignedQR(c)}>📱 Generate QR</button>
                    <button className="btn-small">📊 Analytics</button>
                    <button className="btn-small">📤 Share</button>
                  </div>
                </div>
              ))}
            </div>

            {campaigns.length === 0 && (
              <div className="empty-state">
                <p>🎯 No campaigns yet</p>
                <button onClick={() => setActiveTab('create')}>Create your first campaign</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'create' && (
          <div className="create-tab">
            <h2>➕ Create New Campaign</h2>
            
            <form className="create-form" onSubmit={(e) => { e.preventDefault(); handleCreateCampaign(); }}>
              <div className="form-group">
                <label>Campaign Name *</label>
                <input 
                  type="text" 
                  placeholder="e.g., PSL 2026 - Karachi Match"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({...newCampaign, name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Location *</label>
                <select 
                  value={newCampaign.stadiumId}
                  onChange={(e) => setNewCampaign({...newCampaign, stadiumId: e.target.value})}
                >
                  {venues.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea 
                  placeholder="Describe your campaign..."
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({...newCampaign, description: e.target.value})}
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Time *</label>
                  <input 
                    type="datetime-local"
                    value={newCampaign.startTime}
                    onChange={(e) => setNewCampaign({...newCampaign, startTime: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input 
                    type="datetime-local"
                    value={newCampaign.endTime}
                    onChange={(e) => setNewCampaign({...newCampaign, endTime: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Max Participants</label>
                <input 
                  type="number"
                  min="10"
                  max="10000"
                  value={newCampaign.maxParticipants}
                  onChange={(e) => setNewCampaign({...newCampaign, maxParticipants: parseInt(e.target.value)})}
                />
              </div>

              <div className="form-section">
                <h4>🎁 Rewards Configuration</h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Points per Check-in</label>
                    <input 
                      type="number"
                      min="10"
                      max="1000"
                      value={newCampaign.pointsPerCheckIn}
                      onChange={(e) => setNewCampaign({...newCampaign, pointsPerCheckIn: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Bonus Points</label>
                    <input 
                      type="number"
                      min="0"
                      max="500"
                      value={newCampaign.bonusPoints}
                      onChange={(e) => setNewCampaign({...newCampaign, bonusPoints: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Reward Type</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        value="both"
                        checked={newCampaign.rewards === 'both'}
                        onChange={(e) => setNewCampaign({...newCampaign, rewards: e.target.value})}
                      />
                      Points + NFT
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        value="points"
                        checked={newCampaign.rewards === 'points'}
                        onChange={(e) => setNewCampaign({...newCampaign, rewards: e.target.value})}
                      />
                      Points Only
                    </label>
                    <label className="radio-label">
                      <input 
                        type="radio" 
                        value="nft"
                        checked={newCampaign.rewards === 'nft'}
                        onChange={(e) => setNewCampaign({...newCampaign, rewards: e.target.value})}
                      />
                      NFT Only
                    </label>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setActiveTab('campaigns')}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  🚀 Create Campaign
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'earnings' && (
          <div className="earnings-tab">
            <h2>💰 Earnings & Benefits</h2>
            
            <div className="earnings-summary">
              <div className="earning-card main">
                <h3>Total Earnings</h3>
                <p className="amount">PKR {influencerData.totalEarnings.toLocaleString()}</p>
                <span className="trend">📈 +12% this month</span>
              </div>
            </div>

            <div className="benefits-section">
              <h3>🎁 Influencer Benefits</h3>
              <div className="benefits-grid">
                <div className="benefit-card">
                  <span className="benefit-icon">💵</span>
                  <h4>Commission</h4>
                  <p>Earn 15% commission on every participant check-in</p>
                </div>
                <div className="benefit-card">
                  <span className="benefit-icon">🎁</span>
                  <h4>NFT Royalties</h4>
                  <p>5% royalty on every NFT traded</p>
                </div>
                <div className="benefit-card">
                  <span className="benefit-icon">👥</span>
                  <h4>Referral Bonus</h4>
                  <p>PKR 50 per new user you bring</p>
                </div>
                <div className="benefit-card">
                  <span className="benefit-icon">🏆</span>
                  <h4>Achievement Rewards</h4>
                  <p>Bonus rewards for hitting milestones</p>
                </div>
              </div>
            </div>

            <div className="leaderboard-section">
              <h3>🏆 Top Influencers This Month</h3>
              <div className="leaderboard">
                <div className="leader-item top">
                  <span className="rank">🥇</span>
                  <span className="name">@cricket_king</span>
                  <span className="score">PKR 125,000</span>
                </div>
                <div className="leader-item">
                  <span className="rank">🥈</span>
                  <span className="name">@ PSL_Fan</span>
                  <span className="score">PKR 45,000</span>
                </div>
                <div className="leader-item">
                  <span className="rank">🥉</span>
                  <span className="name">@sports_buddy</span>
                  <span className="score">PKR 32,000</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;