# PSL FanChain API Documentation

## Base URL
`http://localhost:3004/api`

---

## 📍 Campaign Endpoints

### Create Campaign
**POST** `/campaigns`

```json
{
  "creator": "0x65aa7b8BEd35C28b910E258431306E2f469E6260",
  "name": "Match Day NFT Drop",
  "description": "Join me at Rawalpindi Stadium!",
  "stadiumId": "rawalpindi",
  "startTime": 1712160000000,
  "endTime": 1712246400000,
  "rewardTier": "gold",
  "rewardPoints": 500,
  "sponsor": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "campaign": { "id": "camp_...", ... }
}
```

### Get Campaign
**GET** `/campaigns/:id`

### List Campaigns
**GET** `/campaigns?stadiumId=rawalpindi`

---

## 🔐 Anti-Spoof Validation

### Validate Location
**POST** `/validate-location`

```json
{
  "lat": 33.6517,
  "lng": 73.0785,
  "accuracy": 12,
  "deviceInfo": {
    "emulator": false,
    "rooted": false,
    "selfieVerified": true
  },
  "stadiumId": "rawalpindi"
}
```

**Response:**
```json
{
  "valid": true,
  "score": 85,
  "distance": 45,
  "reasons": []
}
```

---

## 🎫 Check-In

### Submit Check-In
**POST** `/checkin`

```json
{
  "wallet": "0x65aa7b8BEd35C28b910E258431306E2f469E6260",
  "campaignId": "camp_...",
  "lat": 33.6517,
  "lng": 73.0785,
  "accuracy": 12,
  "deviceInfo": {...},
  "influencerId": "cricket_king"
}
```

**Response:**
```json
{
  "success": true,
  "nft": {
    "id": "nft_...",
    "owner": "0x...",
    "campaignId": "...",
    "proofHash": "0xabc...",
    "timestamp": 1712160000000
  },
  "reward": 500
}
```

---

## 📊 Analytics

### Get Stats
**GET** `/stats`

**Response:**
```json
{
  "totalCampaigns": 5,
  "totalNFTs": 247,
  "activeCampaigns": 3,
  "earnings": {
    "0x65aa...": 1500
  }
}
```

---

## 🔗 Connected Endpoints

| Description | Endpoint |
|--------------|----------|
| User NFTs | `/users/:wallet/nfts` |
| Campaign Joins | `/campaigns/:id/joins` |

---

## 📋 Supported Stadiums

| ID | Name | Coordinates |
|---|---|---|
| rawalpindi | Rawalpindi Cricket Stadium | 33.6517, 73.0785 |
| lahore | Gaddafi Stadium | 31.5080, 74.3333 |
| karachi | National Stadium | 24.8910, 67.0755 |

---

## ⚡ Risk Scoring

| Signal | Score |
|--------|-------|
| GPS valid | +20 |
| Inside geo-fence | +20 |
| Device pass | +25 |
| Camera pass | +15 |
| Network match | +10 |
| Suspicious | -30 |

**Pass Threshold: 70**

---

## 🚀 Run

```bash
cd backend
npm install express cors body-parser
node fanchain-api.js
```