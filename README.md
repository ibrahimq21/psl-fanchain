# 🏏 PSL FanChain - Blockchain-Powered Fan Engagement Platform

A comprehensive Web3 platform for PSL (Pakistan Super League) fan engagement with NFT-based attendance verification, campaign management, and reward systems.

---

## 🎯 Features

### Core
- ✅ **NFT Check-in** - Real blockchain transactions on WireFluid
- ✅ **Anti-Spoof** - GPS validation, device fingerprinting, risk scoring
- ✅ **Campaigns** - Influencer-driven campaigns with tasks
- ✅ **Fan Score** - Points system with Bronze/Silver/Gold/VIP tiers
- ✅ **Rewards** - Merchandise, tickets, experiences redemption
- ✅ **Moderation** - Reports, bans, appeals system

### Tech Stack
- **Frontend:** React
- **Backend:** Express + Node.js
- **Blockchain:** Solidity + Truffle + WireFluid
- **Database:** MySQL

---

## 📁 Project Structure

```
psl-fanchain/
├── backend/           # Express API (port 3003)
├── frontend/          # React app (port 3000)
├── influencer-dashboard/  # Campaign management
├── blockchain/        # Web3 module
├── contracts/         # Solidity contracts
├── build/            # Compiled artifacts
├── shared/           # Shared utilities
└── venues/           # Stadium data JSON
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL
- npm/yarn

### Setup

```bash
# Clone & install
git clone https://github.com/ibrahimq21/psl-fanchain.git
cd psl-fanchain

# Backend
cd backend
npm install
# Configure .env with your settings
node server.js

# Frontend (new terminal)
cd ../frontend
npm install
npm start

# Influencer Dashboard (new terminal)
cd ../influencer-dashboard
npm install
npm start
```

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|---------|--------|-------------|
| `/health` | GET | Health check |
| `/verify` | POST | **Check-in + NFT mint** |
| `/campaigns` | GET/POST | Campaign CRUD |
| `/stadiums` | GET | Venue data |
| `/profile/:wallet` | GET | Fan profile + tier |
| `/rewards` | GET | Reward catalog |
| `/admin/ban` | POST | Ban user |
| `/admin/reports` | GET | Reports queue |

---

## ⛓️ Blockchain

| Item | Details |
|------|---------|
| **Network** | WireFluid Testnet |
| **Chain ID** | 92533 |
| **RPC** | https://evm.wirefluid.com |
| **Contract** | `0x7Ddb788669d63F20abeCBF55C74604a074681523` |

---

## 🗄️ Database

**MySQL Database:** `psl_fanchain`

Tables: users, roles, permissions, reports, moderation_actions, banned_entities, risk_scores, appeals, activity_logs

---

## 📱 Apps

| App | URL | Description |
|-----|-----|-------------|
| Frontend | http://localhost:3000 | User check-in |
| Dashboard | http://localhost:3001 | Influencer hub |
| Backend | http://localhost:3003 | API |

---

## 📱 Deployment

### Vercel (Frontend)

```bash
cd frontend

# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

**Or connect GitHub repo to Vercel:**
1. Go to https://vercel.com
2. Import your GitHub repo
3. Set environment variables:
   - `REACT_APP_API_URL` = your backend URL
   - `REACT_APP_WIREFLUID_RPC` = https://evm.wirefluid.com
   - `REACT_APP_CONTRACT_ADDRESS` = 0x7Ddb788669d63F20abeCBF55C74604a074681523
   - `REACT_APP_CHAIN_ID` = 92533

### Backend (Render/Railway/Heroku)

The backend requires:
- Node.js server
- MySQL database

Deploy to Render.com, Railway.app, or similar.

---

## 📱 Deployment

### Frontend → Vercel
1. Go to https://vercel.com
2. Import `ibrahimq21/psl-fanchain`
3. Select `frontend` folder
4. Add env vars:
   ```
   REACT_APP_API_URL = https://your-backend.onrender.com
   REACT_APP_WIREFLUID_RPC = https://evm.wirefluid.com
   REACT_APP_CONTRACT_ADDRESS = 0x7Ddb788669d63F20abeCBF55C74604a074681523
   REACT_APP_CHAIN_ID = 92533
   ```

### Backend → Render/Railway
See [backend/DEPLOY.md](backend/DEPLOY.md) for full instructions.

Quick start:
1. Deploy to https://render.com
2. Add MySQL database
3. Set environment variables
4. Connect to GitHub

---

## 📝 License

MIT

---

## 🔗 Links

- [WireFluid Explorer](https://wirefluidscan.com)
- [Contract on Explorer](https://wirefluidscan.com/address/0x7Ddb788669d63F20abeCBF55C74604a074681523)
