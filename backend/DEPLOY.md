# Backend Deployment Guide

## Option 1: Render.com (Recommended - Free MySQL available)

### 1. Deploy Backend
1. Go to https://render.com
2. Sign up with GitHub
3. Click **"New"** → **"Web Service"**
4. Connect your GitHub repo: `ibrahimq21/psl-fanchain`
5. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Add Environment Variables (see below)
7. Click **Create Web Service**

### 2. MySQL Database
1. In Render dashboard, click **"New"** → **"MySQL"**
2. Or use a free MySQL host

---

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|----------|
| PORT | Server port | 3003 |
| NODE_ENV | Environment | production |
| DB_HOST | MySQL host | mysql-xxx.onrender.com |
| DB_PORT | MySQL port | 3306 |
| DB_USER | MySQL user | root |
| DB_PASS | MySQL password | ***** |
| DB_NAME | Database name | psl_fanchain |
| WIREFLUID_RPC | Blockchain RPC | https://evm.wirefluid.com |
| WIREFLUID_CHAIN_ID | Chain ID | 92533 |
| CONTRACT_ADDRESS | Smart contract | 0x7Ddb788669d63F20abeCBF55C74604a074681523 |
| PLATFORM_WALLET | Your wallet | 0x5417B8dDF03b7380Ab6eFe4a364D904b6B989047 |
| PRIVATE_KEY | Wallet private key | 0x46c4ee2c0ab4516f3eac15b3e453e245eab8ae0457b1379bc9498f8435858e92 |

---

## Important: Build Settings

When deploying on Render, set:

- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`

This ensures dependencies are installed from backend/package.json
