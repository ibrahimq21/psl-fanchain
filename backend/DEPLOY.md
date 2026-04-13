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
   - **Start Command:** `node server.js`
6. Add Environment Variables:
   ```
   PORT=3003
   NODE_ENV=production
   WIREFLUID_RPC=https://evm.wirefluid.com
   WIREFLUID_CHAIN_ID=92533
   CONTRACT_ADDRESS=0x7Ddb788669d63F20abeCBF55C74604a074681523
   PLATFORM_WALLET=0x5417B8dDF03b7380Ab6eFe4a364D904b6B989047
   PRIVATE_KEY=your_private_key_here
   DB_HOST=your_mysql_host
   DB_PORT=3306
   DB_USER=root
   DB_PASS=your_db_password
   DB_NAME=psl_fanchain
   ```

### 2. Deploy MySQL Database
1. In Render dashboard, click **"New"** → **"PostgreSQL"** (or MySQL via clearDB)
2. Or use a free MySQL host like https://freemysqlhosting.net

---

## Option 2: Railway.app

1. Go to https://railway.app
2. Sign up with GitHub
3. Click **"New Project"**
4. Add **MySQL** plugin
5. Add **Node.js** service
6. Connect to GitHub repo
7. Set root directory to `backend`
8. Add environment variables in Railway dashboard

---

## Option 3: Heroku

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create psl-fanchain-backend

# Add MySQL
heroku addons:create jawsdb:kitefin

# Set env vars
heroku config:set WIREFLUID_RPC=https://evm.wirefluid.com
heroku config:set CONTRACT_ADDRESS=0x7Ddb788669d63F20abeCBF55C74604a074681523
# ... other vars

# Deploy
git push heroku main
```

---

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|----------|
| PORT | Server port | 3003 |
| NODE_ENV | Environment | production |
| DB_HOST | MySQL host | localhost |
| DB_PORT | MySQL port | 3306 |
| DB_USER | MySQL user | root |
| DB_PASS | MySQL password | ***** |
| DB_NAME | Database name | psl_fanchain |
| WIREFLUID_RPC | Blockchain RPC | https://evm.wirefluid.com |
| WIREFLUID_CHAIN_ID | Chain ID | 92533 |
| CONTRACT_ADDRESS | Smart contract | 0x7Ddb... |
| PLATFORM_WALLET | Your wallet | 0x5417... |
| PRIVATE_KEY | Wallet private key | 0x46c4... |

---

## Quick Deploy Scripts

### Deploy to Render (if CLI installed)
```bash
render deploy --service-type web --source .
```

### After Backend Deploys
Update frontend `.env`:
```
REACT_APP_API_URL=https://your-backend.onrender.com
```
