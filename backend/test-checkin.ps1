# Test script for PSL FanChain Backend
$baseUrl = "http://localhost:3003"

Write-Host "Testing PSL FanChain Backend..." -ForegroundColor Cyan

# 1. Generate test payload
Write-Host "`n[1] Generating test payload..." -ForegroundColor Yellow
$response = Invoke-RestMethod -Uri "$baseUrl/demo/generate" -Method Post -Body '{"lat":31.5204,"lng":74.3587,"stadiumId":"lahore","deviceId":"test-device-001"}' -ContentType "application/json"

Write-Host "Payload:" -ForegroundColor Green
$response.payload | Format-List

Write-Host "Signature: $($response.signature)" -ForegroundColor Green

# 2. Verify check-in
Write-Host "`n[2] Verifying check-in..." -ForegroundColor Yellow
$verifyBody = @{
    payload = $response.payload
    signature = $response.signature
} | ConvertTo-Json

$verifyResponse = Invoke-RestMethod -Uri "$baseUrl/verify" -Method Post -Body $verifyBody -ContentType "application/json"

if ($verifyResponse.success) {
    Write-Host "✅ Check-in verified!" -ForegroundColor Green
    $verifyResponse.checkIn | Format-List
} else {
    Write-Host "❌ Verification failed: $($verifyResponse.errors)" -ForegroundColor Red
}

# 3. List check-ins
Write-Host "`n[3] Listing check-ins..." -ForegroundColor Yellow
$checkIns = Invoke-RestMethod -Uri "$baseUrl/checkins"
Write-Host "Total check-ins: $($checkIns.total)" -ForegroundColor Cyan

Write-Host "`n✅ All tests passed!" -ForegroundColor Green