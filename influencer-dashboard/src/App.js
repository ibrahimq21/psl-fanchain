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
};

// Create a unique request ID to track async operations
const generateRequestId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Fetch with retry and consistent error handling
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
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.warn(`[Fetch] Attempt ${attempt}/${retries} failed:`, error.message);
      
      // Don't retry on network errors or parse errors (last attempt)
      if (attempt === retries || error.name === 'SyntaxError') {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  throw new Error('Max retries exceeded');
};

// API wrapper
const api = {
  get: (endpoint) => fetchWithRetry(`${API_URL}${endpoint}`),
  post: (endpoint, body) => fetchWithRetry(`${API_URL}${endpoint}`, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => fetchWithRetry(`${API_URL}${endpoint}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => fetchWithRetry(`${API_URL}${endpoint}`, { method: 'DELETE' }),
};

// PSL Stadiums - loaded from backend API or use defaults
// The actual venue list comes from the backend /stadiums endpoint

// ==================== Loading Spinner Component ====================
function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="loading-overlay">
      <div className="loading-spinner-container">
        <div className="loading-spinner"></div>
        <p className="loading-message">{message}</p>
      </div>
    </div>
  );
}

// Skeleton loader for cards
function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-title"></div>
      <div className="skeleton-text"></div>
      <div className="skeleton-text short"></div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wallet, setWallet] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({ totalCampaigns: 0, totalParticipants: 0, totalRewards: 0 });
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [notification, setNotification] = useState(null);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(false); // Global loading state
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

  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState({});
  
  // Loading state for campaign creation
  const [isCreating, setIsCreating] = useState(false);
  
  // Optimistic UI - pending campaigns
  const [pendingCampaigns, setPendingCampaigns] = useState([]);

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
    
    // Cleanup on unmount
    return () => {
      // Cancel any pending fetch if needed
    };
  }, []);

  // ==================== Fetch Functions with Proper Error Handling ====================
  
  // Validate venue response structure
  const isValidVenueResponse = (data) => {
    if (!data || typeof data !== 'object') return false;
    // Allow any object with venue data (flexible validation)
    return Object.keys(data).length > 0;
  };

  // Normalize venue data from API
  const normalizeVenue = ([key, v]) => ({
    id: key,
    name: v?.name || v?.stadiumName || key,
    city: v?.city || 'Unknown',
    lat: v?.lat || v?.coordinates?.lat || 0,
    lng: v?.lng || v?.coordinates?.lng || 0,
    radius: v?.radius || 500,
    isEvent: v?.isEvent || false
  });

  // Default venues as fallback
  const defaultVenues = [
    { id: 'Rawalpindi Cricket Stadium', name: 'Rawalpindi Cricket Stadium', city: 'Rawalpindi', lat: 33.7266, lng: 73.0718, isEvent: false },
    { id: 'Gaddafi Stadium', name: 'Gaddafi Stadium', city: 'Lahore', lat: 31.5204, lng: 74.3587, isEvent: false },
    { id: 'National Stadium Karachi', name: 'National Stadium Karachi', city: 'Karachi', lat: 24.8967, lng: 67.0817, isEvent: false }
  ];

  const fetchVenues = async () => {
    setLoading(true);
    console.log('[Venues] Fetching from API...');
    try {
      const data = await api.get('/stadiums');
      
      // Validate response
      if (!isValidVenueResponse(data)) {
        console.warn('[Venues] Invalid response, using defaults');
        setVenues(defaultVenues);
        return;
      }
      
      console.log('[Venues] Received:', Object.keys(data));
      const venueOptions = Object.entries(data).map(normalizeVenue);
      
      // Ensure we have venues
      if (venueOptions.length === 0) {
        console.warn('[Venues] Empty response, using defaults');
        setVenues(defaultVenues);
        return;
      }
      
      setVenues(venueOptions);
      console.log(`[Venues] Loaded ${venueOptions.length} venues`);
      
      // Set default stadium if none selected
      if (!newCampaign.stadiumId && venueOptions.length > 0) {
        setNewCampaign(prev => ({ ...prev, stadiumId: venueOptions[0].id }));
      }
    } catch (err) {
      // Log the actual error
      console.error('[Venues] Fetch failed:', err.message || err);
      console.log('[Venues] Falling back to defaults');
      setVenues(defaultVenues);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    console.log('[Campaigns] Fetching from API...');
    try {
      const data = await api.get('/campaigns');
      
      // Validate response
      if (!data || !Array.isArray(data.campaigns)) {
        console.warn('[Campaigns] Invalid response, using empty');
        setCampaigns([]);
        return;
      }
      
      console.log(`[Campaigns] Loaded ${data.campaigns.length} campaigns`);
      setCampaigns(data.campaigns);
    } catch (err) {
      console.error('[Campaigns] Fetch failed:', err.message || err);
      setCampaigns([]);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
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

  // ==================== Validation Functions ====================
  const validateField = (name, value) => {
    switch (name) {
      case 'name':
        if (!value || value.trim().length < 3) return 'Name must be at least 3 characters';
        if (value.length > 100) return 'Name must be less than 100 characters';
        return null;
      case 'stadiumId':
        if (!value) return 'Please select a location';
        return null;
      case 'startTime':
        if (!value) return 'Start time is required';
        const start = new Date(value);
        if (start < new Date()) return 'Start time must be in the future';
        return null;
      case 'endTime':
        if (value && new Date(value) <= new Date(newCampaign.startTime)) return 'End time must be after start time';
        return null;
      case 'maxParticipants':
        if (value < 10) return 'Minimum 10 participants';
        if (value > 10000) return 'Maximum 10,000 participants';
        return null;
      case 'pointsPerCheckIn':
        if (value < 10) return 'Minimum 10 points';
        if (value > 1000) return 'Maximum 1,000 points';
        return null;
      case 'bonusPoints':
        if (value < 0) return 'Bonus points cannot be negative';
        if (value > 500) return 'Maximum 500 bonus points';
        return null;
      default:
        return null;
    }
  };

  // Validate all fields
  const validateAllFields = () => {
    const errors = {};
    Object.keys(newCampaign).forEach(key => {
      const error = validateField(key, newCampaign[key]);
      if (error) errors[key] = error;
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle field change with inline validation
  const handleFieldChange = (field, value) => {
    setNewCampaign({ ...newCampaign, [field]: value });
    // Clear this field's error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors({ ...fieldErrors, [field]: null });
    }
    // Real-time validation for this field
    const error = validateField(field, value);
    if (error) {
      setFieldErrors({ ...fieldErrors, [field]: error });
    }
  };

  // Handle form submission
  const handleCreateCampaign = async () => {
    // Validate all fields first
    const errors = {};
    Object.keys(newCampaign).forEach(key => {
      const error = validateField(key, newCampaign[key]);
      if (error) errors[key] = error;
    });
    setFieldErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      setNotification({ type: 'error', message: 'Please fix the validation errors below' });
      return;
    }
    
    setLoading(true);

    const campaign = {
      name: newCampaign.name,
      stadiumId: newCampaign.stadiumId,
      description: newCampaign.description,
      startTime: new Date(newCampaign.startTime).toISOString(),
      endTime: newCampaign.endTime ? new Date(newCampaign.endTime).toISOString() : new Date(newCampaign.startTime).toISOString(),
      rewards: {
        pointsPerCheckIn: newCampaign.pointsPerCheckIn,
        bonusPoints: newCampaign.bonusPoints,
        nftReward: newCampaign.rewards === 'both' || newCampaign.rewards === 'nft'
      },
      maxParticipants: newCampaign.maxParticipants
    };

    // Create optimistic campaign object (temporary UI)
    const optimisticCampaign = {
      ...campaign,
      id: `temp_${Date.now()}`,
      status: 'pending',
      currentParticipants: 0,
      createdAt: new Date().toISOString(),
      isOptimistic: true // Flag to identify temporary cards
    };

    // Store request ID for race condition handling
    const requestId = generateRequestId();
    
    // Optimistic UI update - show immediately!
    setIsCreating(true);
    const tempId = optimisticCampaign.id;
    
    // Use functional updates to avoid stale state
    setPendingCampaigns(prev => [...prev, optimisticCampaign]);
    setCampaigns(prev => [...prev, optimisticCampaign]);

    try {
      const data = await api.post('/campaigns', campaign);
      
      // Verify this is still our pending request (race condition check)
      setPendingCampaigns(prev => prev.filter(c => c.id !== tempId));
      setCampaigns(prev => prev.map(c => 
        c.id === tempId ? { ...data.campaign, status: 'active' } : c
      ));
      
      setNotification({ 
        type: 'success', 
        message: `✅ Campaign "${campaign.name}" created successfully!`
      });
      
      // Reset form
      setNewCampaign({ name: '', stadiumId: venues[0]?.id || '', description: '', startTime: '', endTime: '', maxParticipants: 500, pointsPerCheckIn: 100, bonusPoints: 50, rewards: 'both' });
      setFieldErrors({});
      
      // Redirect to campaigns page after success
      setActiveTab('campaigns');
      
      // Refresh stats
      fetchStats();
      
    } catch (err) {
      console.error('Campaign creation error:', err);
      
      // Rollback: remove optimistic card on failure
      setPendingCampaigns(prev => prev.filter(c => c.id !== tempId));
      setCampaigns(prev => prev.filter(c => c.id !== tempId));
      
      setNotification({ 
        type: 'error', 
        message: `❌ Failed to create campaign: ${err.message}. Please try again.`
      });
    } finally {
      setLoading(false);
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
      {/* Global Loading Spinner */}
      {loading && <LoadingSpinner />}
      
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
                <div key={c.id} className={`campaign-card ${c.isOptimistic ? 'optimistic' : ''}`}>
                  <div className="campaign-header">
                    <h3>{c.name}</h3>
                    <span className={`status ${c.status || 'active'}`}>
                      {c.isOptimistic ? '⏳ Pending...' : c.status === 'active' ? '🟢 Active' : '⏸️ Ended'}
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
                    <img src={c.isOptimistic ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNi8+PC9zdmc+' : generateQRCode(c.id)} alt="Campaign QR" />
                    <p>{c.isOptimistic ? 'QR after creation' : 'Scan to join'}</p>
                  </div>

                  <div className="campaign-actions">
                    {!c.isOptimistic && (
                      <>
                        <button className="btn-small" onClick={() => handleGenerateSignedQR(c)}>📱 Generate QR</button>
                        <button className="btn-small">📊 Analytics</button>
                        <button className="btn-small">📤 Share</button>
                      </>
                    )}
                    {c.isOptimistic && (
                      <button className="btn-small" disabled>⏳ Waiting for confirmation</button>
                    )}
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
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  className={fieldErrors.name ? 'error' : ''}
                />
                {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
              </div>

              <div className="form-group">
                <label>Location *</label>
                <select 
                  value={newCampaign.stadiumId}
                  onChange={(e) => handleFieldChange('stadiumId', e.target.value)}
                  className={fieldErrors.stadiumId ? 'error' : ''}
                >
                  <option value="">Select a venue...</option>
                  {venues.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
                  ))}
                </select>
                {fieldErrors.stadiumId && <span className="field-error">{fieldErrors.stadiumId}</span>}
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
                    onChange={(e) => handleFieldChange('startTime', e.target.value)}
                    className={fieldErrors.startTime ? 'error' : ''}
                  />
                  {fieldErrors.startTime && <span className="field-error">{fieldErrors.startTime}</span>}
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input 
                    type="datetime-local"
                    value={newCampaign.endTime}
                    onChange={(e) => handleFieldChange('endTime', e.target.value)}
                    className={fieldErrors.endTime ? 'error' : ''}
                  />
                  {fieldErrors.endTime && <span className="field-error">{fieldErrors.endTime}</span>}
                </div>
              </div>

              <div className="form-group">
                <label>Max Participants</label>
                <input 
                  type="number"
                  min="10"
                  max="10000"
                  value={newCampaign.maxParticipants}
                  onChange={(e) => handleFieldChange('maxParticipants', parseInt(e.target.value))}
                  className={fieldErrors.maxParticipants ? 'error' : ''}
                />
                {fieldErrors.maxParticipants && <span className="field-error">{fieldErrors.maxParticipants}</span>}
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
                      onChange={(e) => handleFieldChange('pointsPerCheckIn', parseInt(e.target.value))}
                      className={fieldErrors.pointsPerCheckIn ? 'error' : ''}
                    />
                    {fieldErrors.pointsPerCheckIn && <span className="field-error">{fieldErrors.pointsPerCheckIn}</span>}
                  </div>
                  <div className="form-group">
                    <label>Bonus Points</label>
                    <input 
                      type="number"
                      min="0"
                      max="500"
                      value={newCampaign.bonusPoints}
                      onChange={(e) => handleFieldChange('bonusPoints', parseInt(e.target.value))}
                      className={fieldErrors.bonusPoints ? 'error' : ''}
                    />
                    {fieldErrors.bonusPoints && <span className="field-error">{fieldErrors.bonusPoints}</span>}
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
                <button type="button" className="btn-secondary" onClick={() => setActiveTab('campaigns')} disabled={isCreating}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isCreating}>
                  {isCreating ? '⏳ Creating...' : '🚀 Create Campaign'}
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