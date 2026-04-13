# PSL FanChain Verification
Write-Host ""
Write-Host "PSL FanChain Verification" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

$errors = 0

# Check 1: Backend server
Write-Host -NoNewline "[1/4] Checking backend server... "
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3003/health" -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "OK" -ForegroundColor Green
    }
}
catch {
    Write-Host "FAILED" -ForegroundColor Red
    $errors++
}

# Check 2: WireFluid RPC
Write-Host -NoNewline "[2/4] Checking WireFluid RPC... "
try {
    $body = '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
    $response = Invoke-RestMethod -Uri "https://evm.wirefluid.com" -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
    if ($response.result) {
        $block = [Convert]::ToInt64($response.result, 16)
        Write-Host "OK (Block: $block)" -ForegroundColor Green
    }
}
catch {
    Write-Host "FAILED" -ForegroundColor Red
    $errors++
}

# Check 3: Contract
Write-Host -NoNewline "[3/4] Checking contract deployment... "
$contract = "0x7Ddb788669d63F20abeCBF55C74604a074681523"
try {
    $body = "{`"jsonrpc`":`"2.0`",`"method`":`"eth_call`",`"params`":[{`"to`":`"$contract`",`"data`":`"0x4e5c3b1e`"},`"latest`"],`"id`":1}"
    $response = Invoke-RestMethod -Uri "https://evm.wirefluid.com" -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
    if ($response.result) {
        Write-Host "OK" -ForegroundColor Green
    }
}
catch {
    Write-Host "FAILED" -ForegroundColor Red
    $errors++
}

# Summary
Write-Host ""
Write-Host "========================" -ForegroundColor Cyan
if ($errors -eq 0) {
    Write-Host "All checks passed!" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "$errors check(s) failed" -ForegroundColor Red
    Write-Host "Start backend: cd psl-fanchain\backend; node server.js" -ForegroundColor Yellow
    exit 1
}
