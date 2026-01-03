# CMS Backend Test Script - JWT Authentication
# Tests all API endpoints with JWT tokens

$baseUrl = "http://localhost:3001/api"

Write-Host "=== CMS Backend API Tests (JWT) ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Admin Login - Get JWT Token
Write-Host "1. Admin Login (Get JWT Token)" -ForegroundColor Yellow
$adminToken = $null
try {
    $loginData = @{username="admin"; password="admin123"} | ConvertTo-Json
    $adminLogin = Invoke-RestMethod -Uri "$baseUrl/auth/admin/login" -Method POST -Body $loginData -ContentType "application/json"
    $adminToken = $adminLogin.token
    Write-Host "   Logged in as: $($adminLogin.admin.username)" -ForegroundColor Green
    Write-Host "   Token: $($adminToken.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 2: Create Driver with JWT
Write-Host ""
Write-Host "2. Create Driver with JWT Auth" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $adminToken" }
    $driverData = @{name="João Silva"; plate="ABC-1234"; price_per_km_ton=0.50; client="Agro Soja Ltda"} | ConvertTo-Json
    $driver = Invoke-RestMethod -Uri "$baseUrl/admin/drivers" -Method POST -Body $driverData -ContentType "application/json" -Headers $headers
    Write-Host "   Created driver: $($driver.name) (Client: $($driver.client))" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 3: Create Freight with JWT
Write-Host ""
Write-Host "3. Create Freight with JWT Auth" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $adminToken" }
    $freightData = @{driver_id=1; date="2025-01-15"; km=500; tons=30} | ConvertTo-Json
    $freight = Invoke-RestMethod -Uri "$baseUrl/admin/freights" -Method POST -Body $freightData -ContentType "application/json" -Headers $headers
    Write-Host "   Created freight: R`$$($freight.total_value)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 4: Create Abastecimento with JWT
Write-Host ""
Write-Host "4. Create Abastecimento with JWT Auth" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $adminToken" }
    $abastData = @{driver_id=1; date="2025-01-15"; quantity=200; price_per_liter=5.50} | ConvertTo-Json
    $abast = Invoke-RestMethod -Uri "$baseUrl/admin/abastecimentos" -Method POST -Body $abastData -ContentType "application/json" -Headers $headers
    Write-Host "   Created abastecimento: R`$$($abast.total_value)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 5: Driver Login - Get JWT Token
Write-Host ""
Write-Host "5. Driver Login (Get JWT Token)" -ForegroundColor Yellow
$driverToken = $null
try {
    $driverLoginData = @{name="João Silva"; plate="ABC-1234"} | ConvertTo-Json
    $driverLogin = Invoke-RestMethod -Uri "$baseUrl/auth/driver/login" -Method POST -Body $driverLoginData -ContentType "application/json"
    $driverToken = $driverLogin.token
    Write-Host "   Logged in as: $($driverLogin.driver.name)" -ForegroundColor Green
    Write-Host "   Token: $($driverToken.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 6: Driver Profile with JWT
Write-Host ""
Write-Host "6. Get Driver Profile with JWT" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $driverToken" }
    $profile = Invoke-RestMethod -Uri "$baseUrl/driver/profile" -Method GET -Headers $headers
    Write-Host "   Name: $($profile.name), Client: $($profile.client)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 7: Driver Freights with JWT
Write-Host ""
Write-Host "7. Get Driver Freights with JWT" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $driverToken" }
    $freights = Invoke-RestMethod -Uri "$baseUrl/driver/freights" -Method GET -Headers $headers
    Write-Host "   Found $($freights.freights.Count) freight(s), Total: R`$$($freights.stats.total_value)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 8: Driver Abastecimentos with JWT
Write-Host ""
Write-Host "8. Get Driver Abastecimentos with JWT" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $driverToken" }
    $abast = Invoke-RestMethod -Uri "$baseUrl/driver/abastecimentos" -Method GET -Headers $headers
    Write-Host "   Found $($abast.abastecimentos.Count) record(s), Total: R`$$($abast.stats.total_value)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 9: Verify Token
Write-Host ""
Write-Host "9. Verify Driver Token" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $driverToken" }
    $verify = Invoke-RestMethod -Uri "$baseUrl/auth/verify" -Method GET -Headers $headers
    Write-Host "   Token valid: $($verify.valid), Type: $($verify.type)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $_" -ForegroundColor Red
}

# Test 10: Invalid Token Rejection
Write-Host ""
Write-Host "10. Test Invalid Token Rejection" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer invalid-token" }
    $result = Invoke-RestMethod -Uri "$baseUrl/driver/profile" -Method GET -Headers $headers
    Write-Host "   FAILED: Should have rejected invalid token" -ForegroundColor Red
} catch {
    Write-Host "   Correctly rejected invalid token" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Tests Complete ===" -ForegroundColor Cyan
