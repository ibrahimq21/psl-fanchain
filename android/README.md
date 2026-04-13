# PSL FanChain - Android Anti-Spoof SDK

Android module for capturing location validation signals.

## Features

- **Mock Location Detection** - Detect fake GPS
- **Emulator Detection** - Identify test environments
- **Root Detection** - Check for rooted devices
- **Sensor Correlation** - GPS vs accelerometer mismatch detection
- **Device Attestation** - Unique device identification
- **Payload Signing** - HMAC-SHA256 signed check-in payloads

## Usage

```kotlin
// Initialize SDK
val antiSpoofSdk = AntiSpoofSdk(context)

// Get current location
val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
val location = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)

// Generate signed payload
val result = antiSpoofSdk.generateSignedPayload(location, "lahore")

// Send to backend
val payload = result["payload"] as Map
val signature = result["signature"] as String

// API call...
```

## API Reference

### Core Methods

| Method | Description |
|--------|-------------|
| `isMockLocationEnabled()` | Check if mock location is enabled |
| `isLocationFromMockProvider(Location)` | Check if location is fake |
| `isEmulator()` | Detect emulator environment |
| `isRooted()` | Check for root access |
| `checkSensorMismatch(Location)` | GPS vs accelerometer mismatch |
| `getDeviceId()` | Get hashed device ID |
| `generateSignedPayload(Location, stadiumId)` | Generate signed check-in |

## Integration

1. Add `AntiSpoofSdk.java` to your project
2. Request location permission in manifest
3. Initialize and use in your check-in activity

## Permissions Required

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```