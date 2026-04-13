package com.psl.fanchain;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.InputStreamReader;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * PSL FanChain Anti-Spoof SDK
 * 
 * Provides location validation signals for anti-spoofing:
 * - Mock location detection
 * - Emulator/Root detection
 * - Sensor correlation (accelerometer + gyroscope)
 * - Device attestation
 * - Payload signing
 */
public class AntiSpoofSdk {
    
    private static final String TAG = "AntiSpoofSdk";
    private static final String SECRET_KEY = "psl-fanchain-secret-key-2026";
    
    private final Context context;
    private final LocationManager locationManager;
    
    // Device signals captured at check-in time
    private float[] lastAccelerometer = null;
    private float[] lastGyroscope = null;
    private long lastSensorUpdate = 0;
    
    // Store previous location for speed validation
    private Location lastKnownLocation = null;
    private long lastLocationTimestamp = 0;
    
    public AntiSpoofSdk(Context context) {
        this.context = context;
        this.locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    }
    
    // ==================== MOCK LOCATION DETECTION ====================
    
    /**
     * Check if mock location is enabled
     */
    public boolean isMockLocationEnabled() {
        if (locationManager == null) return false;
        
        try {
            // Check if mock location provider is enabled
            return locationManager.isProviderEnabled(LocationManager GPS_PROVIDER);
        } catch (Exception e) {
            Log.e(TAG, "Error checking mock location", e);
            return false;
        }
    }
    
    /**
     * Check if location is from a mock provider
     */
    public boolean isLocationFromMockProvider(Location location) {
        if (location == null) return false;
        
        try {
            // isFromMockProvider is available on API 18+
            return location.isFromMockProvider();
        } catch (Exception e) {
            Log.e(TAG, "Error checking mock provider", e);
            return false;
        }
    }
    
    // ==================== EMULATOR DETECTION ====================
    
    /**
     * Check if running on emulator
     */
    public boolean isEmulator() {
        // Check for emulator-specific properties
        if (Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.startsWith("sdk") ||
            Build.FINGERPRINT.contains("goldfish") ||
            Build.FINGERPRINT.contains("vbox86p")) {
            return true;
        }
        
        // Check for emulator-specific files
        if (new File("/system/xbin/su").exists() ||
            new File("/system/bin/su").exists()) {
            // Check if su is actually working (not just present)
            if (!isSuWorking()) {
                return true;
            }
        }
        
        // Check for emulator-specific properties
        if (Build.BRAND.equalsIgnoreCase("generic") &&
            Build.DEVICE.equalsIgnoreCase("generic")) {
            return true;
        }
        
        // Check for test keys
        if (Build.TAGS.equalsIgnoreCase("test-keys")) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Check if su command is actually working
     */
    private boolean isSuWorking() {
        Process process = null;
        try {
            process = Runtime.getRuntime().exec(new String[]{"su", "-v"});
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line = reader.readLine();
            return line != null && line.contains("mtk");
        } catch (Exception e) {
            return false;
        } finally {
            if (process != null) {
                try {
                    process.destroy();
                } catch (Exception ignored) {}
            }
        }
    }
    
    // ==================== ROOT DETECTION ====================
    
    /**
     * Check if device is rooted
     */
    public boolean isRooted() {
        String[] rootPaths = {
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/bin/su",
            "/data/local/su",
            "/system/sbin/su",
            "/vendor/bin/su"
        };
        
        for (String path : rootPaths) {
            if (new File(path).exists()) {
                return true;
            }
        }
        
        // Additional root detection
        return checkRootBinary() || checkRootApps();
    }
    
    /**
     * Check for root binary
     */
    private boolean checkRootBinary() {
        String[] binaries = {"su", "busybox", "magisk"};
        for (String binary : binaries) {
            try {
                Process process = Runtime.getRuntime().exec(new String[]{"which", binary});
                if (process.waitFor() == 0) {
                    return true;
                }
            } catch (Exception ignored) {}
        }
        return false;
    }
    
    /**
     * Check for root apps
     */
    private boolean checkRootApps() {
        String[] rootApps = {
            "com.topjohnwu.magisk",
            "com.noshufou.android.su",
            "com.noshufou.android.su.elite",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.thirdparty.superuser"
        };
        
        PackageManager pm = context.getPackageManager();
        for (String app : rootApps) {
            try {
                pm.getPackageInfo(app, 0);
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }
    
    // ==================== SENSOR CORRELATION ====================
    
    /**
     * Record accelerometer data
     */
    public void recordAccelerometer(float[] values) {
        this.lastAccelerometer = values.clone();
        this.lastSensorUpdate = System.currentTimeMillis();
    }
    
    /**
     * Record gyroscope data
     */
    public void recordGyroscope(float[] values) {
        this.lastGyroscope = values.clone();
        this.lastSensorUpdate = System.currentTimeMillis();
    }
    
    /**
     * Check for sensor mismatch - GPS shows movement but sensors don't
     * 
     * @param currentLocation Current GPS location
     * @return true if sensors indicate suspicious mismatch
     */
    public boolean checkSensorMismatch(Location currentLocation) {
        if (currentLocation == null || lastKnownLocation == null) {
            return false;
        }
        
        // Calculate GPS speed
        float gpsSpeed = currentLocation.getSpeed(); // m/s
        
        // Calculate distance moved
        float distance = lastKnownLocation.distanceTo(currentLocation); // meters
        long timeDiff = currentLocation.getTime() - lastLocationTimestamp; // ms
        
        if (timeDiff <= 0 || distance <= 0) {
            return false;
        }
        
        // Convert GPS speed to m/s for comparison
        float calculatedSpeed = distance / (timeDiff / 1000f); // m/s
        
        // If GPS shows significant movement but accelerometer shows no motion
        if (lastAccelerometer != null && gpsSpeed > 1.0f) {
            float accelMagnitude = calculateMagnitude(lastAccelerometer);
            
            // Motionless accelerometer while GPS shows movement = suspicious
            if (accelMagnitude < 0.5f && calculatedSpeed > 2.0f) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Calculate magnitude of 3D vector
     */
    private float calculateMagnitude(float[] values) {
        if (values == null || values.length < 3) return 0;
        return (float) Math.sqrt(
            values[0] * values[0] +
            values[1] * values[1] +
            values[2] * values[2]
        );
    }
    
    /**
     * Update last known location
     */
    public void updateLocation(Location location) {
        if (location != null) {
            this.lastKnownLocation = location;
            this.lastLocationTimestamp = location.getTime();
        }
    }
    
    // ==================== DEVICE ATTESTATION ====================
    
    /**
     * Get hashed device ID
     */
    public String getDeviceId() {
        // Use ANDROID_ID as unique identifier
        String androidId = android.provider.Settings.Secure.getString(
            context.getContentResolver(),
            android.provider.Settings.Secure.ANDROID_ID
        );
        
        // Hash the ANDROID_ID
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(androidId.getBytes());
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            Log.e(TAG, "Error hashing device ID", e);
            return UUID.randomUUID().toString();
        }
    }
    
    // ==================== PAYLOAD SIGNING ====================
    
    /**
     * Generate signed check-in payload
     * 
     * @param location Current GPS location
     * @param stadiumId Stadium identifier
     * @return Map containing payload and signature
     */
    public Map<String, Object> generateSignedPayload(Location location, String stadiumId) {
        long timestamp = System.currentTimeMillis() / 1000;
        String nonce = UUID.randomUUID().toString();
        
        // Build payload
        Map<String, Object> payload = new HashMap<>();
        payload.put("lat", location.getLatitude());
        payload.put("lng", location.getLongitude());
        payload.put("timestamp", timestamp);
        payload.put("nonce", nonce);
        payload.put("stadiumId", stadiumId);
        payload.put("deviceId", getDeviceId());
        payload.put("isMockLocation", isLocationFromMockProvider(location));
        payload.put("isEmulator", isEmulator());
        payload.put("sensorMismatch", checkSensorMismatch(location));
        
        // Generate signature HMAC-SHA256
        String signature = generateHmacSignature(payload);
        
        Map<String, Object> result = new HashMap<>();
        result.put("payload", payload);
        result.put("signature", signature);
        
        return result;
    }
    
    /**
     * Generate HMAC-SHA256 signature
     */
    private String generateHmacSignature(Map<String, Object> payload) {
        try {
            // Sort and serialize payload
            StringBuilder sb = new StringBuilder();
            sb.append("lat=").append(payload.get("lat")).append("&");
            sb.append("lng=").append(payload.get("lng")).append("&");
            sb.append("timestamp=").append(payload.get("timestamp")).append("&");
            sb.append("nonce=").append(payload.get("nonce")).append("&");
            sb.append("stadiumId=").append(payload.get("stadiumId")).append("&");
            sb.append("deviceId=").append(payload.get("deviceId"));
            
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            javax.crypto.spec.SecretKeySpec keySpec = new javax.crypto.spec.SecretKeySpec(
                SECRET_KEY.getBytes(), "HmacSHA256"
            );
            mac.init(keySpec);
            byte[] hmac = mac.doFinal(sb.toString().getBytes());
            
            StringBuilder hexString = new StringBuilder();
            for (byte b : hmac) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            Log.e(TAG, "Error generating signature", e);
            return "";
        }
    }
    
    // ==================== VALIDATION RESULT ====================
    
    /**
     * Get all validation signals
     */
    public Map<String, Object> getValidationSignals(Location location) {
        Map<String, Object> signals = new HashMap<>();
        
        signals.put("isMockLocationEnabled", isMockLocationEnabled());
        signals.put("isLocationFromMockProvider", isLocationFromMockProvider(location));
        signals.put("isEmulator", isEmulator());
        signals.put("isRooted", isRooted());
        signals.put("sensorMismatch", checkSensorMismatch(location));
        signals.put("deviceId", getDeviceId());
        signals.put("deviceAttestation", "baseline"); // Can be upgraded to Play Integrity API
        
        return signals;
    }
}