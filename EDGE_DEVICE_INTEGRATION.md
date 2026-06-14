# Edge Device Integration Guide

## Overview

The **NexusShield Dashboard** is a React frontend that displays and manages IoT security data stored in Supabase. It does **not** process video or run detection algorithms directly. All video capture, motion detection, and event generation must happen on an **edge device** (e.g., Raspberry Pi, IP camera, or server with GPU).

---

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────────┐
│   Edge Device    │────▶│   Supabase   │◀────│  NexusShield       │
│  (Raspberry Pi)  │     │   (Backend)  │     │  Dashboard (React) │
│                  │     │              │     │                    │
│ - Camera capture │     │ - PostgreSQL │     │ - View events      │
│ - Motion detect  │     │ - Realtime   │     │ - Manage devices   │
│ - Push events    │     │ - Storage    │     │ - Analytics        │
│ - Push snapshots │     │ - Auth       │     │ - Configure alerts │
└─────────────────┘     └──────────────┘     └────────────────────┘
```

---

## What the Edge Device Should Do

### 1. Device Heartbeat / Status

Periodically update the device's status and `last_seen_at` timestamp:

```python
import requests
from datetime import datetime

SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-service-role-key"  # Use service role key on edge device
DEVICE_ID = "your-device-uuid"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# Update device status
requests.patch(
    f"{SUPABASE_URL}/rest/v1/devices?id=eq.{DEVICE_ID}",
    headers=headers,
    json={
        "status": "online",
        "last_seen_at": datetime.utcnow().isoformat(),
    }
)
```

### 2. Push Events

When motion is detected (or any security event occurs), insert into the `events` table:

```python
requests.post(
    f"{SUPABASE_URL}/rest/v1/events",
    headers=headers,
    json={
        "device_id": DEVICE_ID,
        "event_type": "motion",       # or: person_detected, door, camera_offline, etc.
        "severity": "medium",         # low, medium, high
    }
)
```

### 3. Upload Snapshots

Capture a frame and upload it to Supabase Storage, then link it in the `snapshots` table:

```python
import base64

# Upload image to Supabase Storage
with open("snapshot.jpg", "rb") as f:
    image_data = f.read()

filename = f"snapshots/{DEVICE_ID}/{datetime.utcnow().isoformat()}.jpg"

requests.post(
    f"{SUPABASE_URL}/storage/v1/object/snapshots/{filename}",
    headers={**headers, "Content-Type": "image/jpeg"},
    data=image_data
)

# Get public URL
image_url = f"{SUPABASE_URL}/storage/v1/object/public/snapshots/{filename}"

# Insert snapshot record linked to the event
requests.post(
    f"{SUPABASE_URL}/rest/v1/snapshots",
    headers=headers,
    json={
        "event_id": "event-uuid-here",
        "image_url": image_url,
    }
)
```

### 4. Read Device Configuration

The edge device should periodically check its config (sensitivity, cooldown, alerts):

```python
response = requests.get(
    f"{SUPABASE_URL}/rest/v1/device_config?device_id=eq.{DEVICE_ID}",
    headers=headers,
)
config = response.json()
if config:
    sensitivity = config[0].get("sensitivity", 5)
    cooldown = config[0].get("detection_cooldown", 30)
    alerts_enabled = config[0].get("alert_enabled", True)
```

---

## Telegram Bot Integration (Future)

Telegram alerts should be sent from a **secure backend**, never from the React frontend.

### Options:

1. **Supabase Edge Function** — Trigger on database insert (events table) via webhook
2. **Edge device Python script** — After pushing an event, also send a Telegram message
3. **Separate backend service** — Node.js/Python server that listens for Supabase realtime events

### Example (Python on edge device):

```python
import requests

TELEGRAM_BOT_TOKEN = "your-bot-token"  # NEVER put this in frontend code
TELEGRAM_CHAT_ID = "your-chat-id"

def send_telegram_alert(message):
    requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
        }
    )

# Usage after detecting an event:
send_telegram_alert(
    f"🚨 <b>Motion Detected</b>\n"
    f"Device: Front Door Camera\n"
    f"Time: {datetime.utcnow().strftime('%H:%M:%S')}\n"
    f"Severity: HIGH"
)
```

### Security Rules:
- ❌ **NEVER** put `TELEGRAM_BOT_TOKEN` in React frontend code
- ❌ **NEVER** expose it in environment variables prefixed with `VITE_`
- ✅ Store it in Supabase Edge Function secrets or edge device environment
- ✅ The dashboard only stores the user's `telegram_chat_id` (safe to expose)

---

## Supabase Tables Used

| Table | Purpose | Who writes |
|-------|---------|------------|
| `devices` | Camera/sensor registry & status | Edge device (heartbeat) + Dashboard (admin CRUD) |
| `device_config` | Per-device settings (sensitivity, cooldown, alerts) | Dashboard (admin) |
| `events` | Security events (motion, door, person detected) | Edge device |
| `snapshots` | Event snapshot images | Edge device |
| `profiles` | User accounts, roles, notification preferences | Dashboard |
| `system_logs` | System-level logs | Edge device |

---

## Existing Test Scripts

The repository includes several test scripts that can help you verify your Supabase connection:

- `test-supabase.js` — Basic Supabase connection test
- `test-fake.js` — Insert fake/test data for development
- `test-endpoints.js` — Test various API endpoints
- `test-schema.js` — Verify database schema
- `test-profile.js` — Test profile queries
- `test-columns.js` — Verify table columns
- `test-count.js` — Count records in tables

Run them with: `node test-supabase.js` (make sure you have a `.env` file or set environment variables).

---

## Getting Started

1. Set up a Raspberry Pi with a camera module
2. Install Python 3 with `requests` library
3. Create a device entry in the dashboard (Device Management page)
4. Copy the device UUID
5. Configure the edge script with your Supabase URL, service role key, and device ID
6. Run the script — events will appear in the dashboard in real-time via Supabase Realtime
