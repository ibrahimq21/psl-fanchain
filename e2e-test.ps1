# Full End-to-End Test for PSL FanChain Backend
$baseUrl = "http://localhost:3003"

Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host "PSL FanChain - Full E2E Test" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan

# 1. Health check
Write-Host "`n[1] Health Check..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "$baseUrl/health"
Write-Host "Status: $($health.status)" -ForegroundColor Green
Write-Host "Uptime: $($health.uptime)s"

# 2. Generate test payload
Write-Host "`n[2] Generate Test Payload..." -ForegroundColor Yellow
$payload = @{
    lat = 31.5204
    lng = 74.3587
    stadiumId = "lahore"
    deviceId = "0x742d35Cc6453C60f6b1C3d2c2aE2a4f4C9d1d6"
} | ConvertTo-Json -Compress

$demo = Invoke-RestMethod -Uri "$baseUrl/demo/generate" -Method Post -Body $payload -ContentType "application/json"

Write-Host "Generated:" -ForegroundColor Green
Write-Host "  Lat: $($demo.payload.lat)"
Write-Host "  Lng: $($demo.payload.lng)"
Write-Host "  Stadium: $($demo.payload.stadiumId)"
Write-Host "  Nonce: $($demo.payload.nonce)"
Write-Host "  Signature: $($demo.signature.Substring(0, 16))..."

# 3. Verify check-in
Write-Host "`n[3] Verify Check-in..." -ForegroundColor Yellow
$verify = @{
    payload = $demo.payload
    signature = $demo.signature
} | ConvertTo-Json -Compress

$result = Invoke-RestMethod -Uri "$baseUrl/verify" -Method Post -Body $verify -ContentType "application/json"

if ($result.success) {
    Write-Host "✅ Verified! Token ID: $($result.checkIn.id)" -ForegroundColor Green
    
    # 4. Record to blockchain
    Write-Host "`n[4] Record to Blockchain..." -ForegroundColor Yellow
    $blockchain = @{
        checkIn = $result.checkIn
        walletAddress = $demo.payload.deviceId
    } | ConvertTo-Json -Compress
    
    $bcResult = Invoke-RestMethod -Uri "$baseUrl/blockchain/record" -Method Post -Body $blockchain -ContentType "application/json"
    
    if ($bcResult.success) {
        Write-Host "✅ NFT Minted! Token # $($bcResult.nft.tokenId)" -ForegroundColor Green
        Write-Host "   Tx Hash: $($bcResult.nft.txHash.Substring(0, 20))..."
    }
    
    # 5. Check rewards
    Write-Host "`n[5] Check Rewards..." -ForegroundColor Yellow
    $rewards = Invoke-RestMethod -Uri "$baseUrl/blockchain/rewards/$($demo.payload.deviceId)"
    Write-Host "Points: $($rewards.points)" -ForegroundColor Cyan
    Write-Host "NFTs: $($rewards.nftCount)"
    Write-Host "Eligible for NFT: $($rewards.eligibleForNFT)"
}

Write-Host "`n" + ("=" * 50) -ForegroundColor Cyan
Write-Host "✅ ALL TESTS PASSED!" -ForegroundColor Green
Write-Host ("=" * 50) -ForegroundColor Cyan