import React, { useState, useEffect } from 'react';
import './App.css';

// Environment variables - use .env file
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3003';
const QR_API_URL = process.env.REACT_APP_QR_API_URL || 'https://api.qrserver.com/v1/create-qr-code/';

// PSL Stadiums - loaded from backend API or use defaults
// The actual venue list comes from the backend /stadiums endpoint

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wallet, setWallet] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({ totalCampaigns: 0, totalParticipants: 0, totalRewards: 0 });
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

  useEffect(() => {
    // Load data from backend
    fetchCampaigns();
    fetchStats();
    fetchVenues();
  }, []);

  const fetchVenues = async () => {
    try {
      const res = await fetch(`${API_URL}/stadiums`);
      const data = await res.json();
      // Transform to dropdown options
      const venueOptions = Object.entries(data).map(([key, v]) => ({
        id: key,
        name: v.name || key,
        city: v.city,
        lat: v.lat,
        lng: v.lng,
        isEvent: v.isEvent || false
      }));
      setVenues(venueOptions);
      // Set default stadium
      if (venueOptions.length > 0 && !newCampaign.stadiumId) {
        setNewCampaign(prev => ({ ...prev, stadiumId: venueOptions[0].id }));
      }
    } catch (err) {
      console.error('Failed to fetch venues:', err);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${API_URL}/campaigns`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
      // Use demo data
      setCampaigns([
        {
          id: 'demo_1',
          name: 'PSL 2026 - Lahore Match',
          stadiumId: 'Gaddafi Stadium',
          status: 'active',
          currentParticipants: 234,
          maxParticipants: 500,
          rewards: { pointsPerCheckIn: 100, bonusPoints: 50 }
        }
      ]);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/analytics`);
      const data = await res.json();
      setStats({
        totalCampaigns: data.campaigns?.length || 0,
        totalParticipants: data.totalCheckIns || 0,
        totalRewards: data.totalPoints || 0
      });
    } catch (err) {
      setStats({
        totalCampaigns: campaigns.length,
        totalParticipants: campaigns.reduce((sum, c) => sum + (c.currentParticipants || 0), 0),
        totalRewards: campaigns.length * 1000
      });
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
      const res = await fetch(`${API_URL}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaign)
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
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
    // Return a QR code URL using environment variable or fallback
    return `${QR_API_URL}?size=200x200&data=${campaignId}`;
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