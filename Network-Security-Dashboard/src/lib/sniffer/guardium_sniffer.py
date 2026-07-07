#!/usr/bin/env python3
"""
Guardium Real-Time Network Sniffer — v3.0
===========================================
Production-grade multi-threaded packet capture with real-time Shannon entropy
analysis, adaptive heuristic anomaly detection, and batched Supabase ingestion.

CAPABILITIES:
  • Multi-threaded async capture via Scapy + ThreadPoolExecutor to prevent drops
  • Per-packet Shannon entropy calculation (0.0–8.0 bits) on Raw payloads
  • Adaptive entropy thresholding (>7.2 bits → exfiltration/ransomware)
  • Sliding-window port-scan detection (>15 unique ports / 2 sec window)
  • Batched 1-second flush to Supabase via direct HTTP POST
  • Payload hex-serialization to prevent buffer overflows
  • Authenticates via sensor api_key from the `sensors` table

REQUIREMENTS:
  pip install supabase scapy requests

USAGE:
  export SUPABASE_URL="https://your-project.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
  export SENSOR_API_KEY="your-sensor-api-key-from-dashboard"
  export TEAM_ID="your-team-uuid"
  export SENSOR_ID="your-sensor-uuid"          # optional — auto-resolved if absent
  export INTERFACE="eth0"                        # optional — uses Scapy default

  sudo python guardium_sniffer.py
"""

import os
import sys
import time
import json
import math
import signal
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import requests
from supabase import create_client, Client
from scapy.all import sniff, IP, TCP, UDP, Raw, conf as scapy_conf

# ── Configuration (from environment variables) ────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SENSOR_API_KEY = os.environ.get("SENSOR_API_KEY")
TEAM_ID = os.environ.get("TEAM_ID")
SENSOR_ID_ENV = os.environ.get("SENSOR_ID")          # optional
INTERFACE = os.environ.get("INTERFACE", "")           # optional — uses Scapy default

# Validate required config
missing: list[str] = []
if not SUPABASE_URL:
    missing.append("SUPABASE_URL")
if not SUPABASE_SERVICE_ROLE_KEY:
    missing.append("SUPABASE_SERVICE_ROLE_KEY")
if not SENSOR_API_KEY:
    missing.append("SENSOR_API_KEY")
if not TEAM_ID:
    missing.append("TEAM_ID")

if missing or "your-project" in (SUPABASE_URL or ""):
    print("❌ ERROR: Missing required environment variables:")
    for var in missing:
        print(f"   • {var}")
    print("\n   Set them before running:")
    print("   export SUPABASE_URL='https://your-project.supabase.co'")
    print("   export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'")
    print("   export SENSOR_API_KEY='your-sensor-api-key'")
    print("   export TEAM_ID='your-team-uuid'")
    sys.exit(1)

# ── Supabase client (for auth only; ingestion uses raw HTTP) ──────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ── Logging ───────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [GUARDIUM] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
#  SHANNON ENTROPY ENGINE
# ═══════════════════════════════════════════════════════════════════════

def shannon_entropy(data: bytes) -> float:
    """
    Compute the Shannon entropy of a byte sequence.

    H(X) = - Σ p(i) · log₂ p(i)

    where p(i) is the probability of byte value i appearing in `data`.
    Returns a float in the range [0.0, 8.0] bits per byte.
    - 0.0   → all bytes identical (e.g. all-zero padding)
    - ~3–5  → typical human-readable text or structured protocols
    - ~7–8  → uniform random distribution (encrypted / compressed payload)
    """
    if not data:
        return 0.0

    n = len(data)
    # Frequency count per byte value (0–255)
    freq = [0] * 256
    for byte in data:
        freq[byte] += 1

    entropy = 0.0
    for count in freq:
        if count == 0:
            continue
        p = count / n
        entropy -= p * math.log2(p)

    return entropy


ENTROPY_THRESHOLD = 7.2   # bits — anything above is likely encrypted/compressed payload


def classify_high_entropy(entropy: float, protocol: str, port: int | None) -> tuple[str, str]:
    """
    Return a (title, description) pair based on the entropy level and context.
    >7.2 bits suggests encrypted data exfiltration or ransomware staging.
    """
    if entropy >= 7.8:
        title = "Active Ransomware Staging — High-Entropy Payload Flood"
        desc = (
            f"Payload entropy {entropy:.2f} bits — near-maximum randomness. "
            f"This is consistent with ransomware encrypting files in memory "
            f"before exfiltration over {protocol}."
        )
    elif entropy >= 7.2:
        title = "Encrypted Data Exfiltration Detected"
        desc = (
            f"Payload entropy {entropy:.2f} bits exceeds threshold of 7.2. "
            f"The payload exhibits cryptographic-grade randomness, indicating "
            f"encrypted data egress via {protocol}:{port}."
        )
    else:
        title = ""
        desc = ""
    return title, desc


# ═══════════════════════════════════════════════════════════════════════
#  STATE & BUFFERING
# ═══════════════════════════════════════════════════════════════════════

SENSOR_ID: str | None = SENSOR_ID_ENV or None

# Thread-safe ingestion queues
PACKET_BUFFER: list[dict[str, Any]] = []
ALERT_BUFFER: list[dict[str, Any]] = []
BUFFER_LOCK = threading.Lock()
SHUTDOWN_FLAG = threading.Event()

# Thread pool for parallel entropy computation
EXECUTOR = ThreadPoolExecutor(max_workers=4)

# Sliding-window port-scan tracker
#   Key: src_ip
#   Value: { "ports": set[int], "window_start": float }
#   Window duration = 2 seconds
PORT_SCAN_WINDOW = 2.0
PORT_SCAN_THRESHOLD = 15
port_scan_tracker: dict[str, dict[str, Any]] = {}
PORT_SCAN_LOCK = threading.Lock()

# Metrics
TOTAL_PACKETS: int = 0
TOTAL_ALERTS: int = 0

SEVERITY_MAP: dict[str, str] = {
    "Critical": "critical",
    "High": "high",
    "Medium": "medium",
    "Low": "low",
}

# ── flush every 1.0 second ────
FLUSH_INTERVAL = 1.0
MAX_PAYLOAD_BYTES = 4096  # truncate payloads beyond this before hex-encoding


# ═══════════════════════════════════════════════════════════════════════
#  SENSOR AUTHENTICATION
# ═══════════════════════════════════════════════════════════════════════

def authenticate_sensor() -> str | None:
    """Look up sensor by api_key and return its ID. Updates last_seen."""
    try:
        resp = (
            supabase.table("sensors")
            .select("id, team_id")
            .eq("api_key", SENSOR_API_KEY)
            .limit(1)
            .execute()
        )
        if resp.data and len(resp.data) > 0:
            sensor = resp.data[0]
            sensor_id = sensor["id"]
            # Update last_seen
            supabase.table("sensors").update(
                {"last_seen": datetime.now(timezone.utc).isoformat()}
            ).eq("id", sensor_id).execute()
            log.info(f"🔐 Sensor authenticated: {sensor_id}")
            return sensor_id
        else:
            log.error("❌ No sensor found with the provided SENSOR_API_KEY")
            log.error("   → Create a sensor in the Guardium dashboard Settings page")
            return None
    except Exception as e:
        log.error(f"❌ Sensor auth failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════
#  BATCHED SUPABASE INGESTION (direct HTTP POST)
# ═══════════════════════════════════════════════════════════════════════

def _supabase_insert(table: str, rows: list[dict[str, Any]]) -> None:
    """
    Insert rows into a Supabase table via direct REST API POST.
    Uses the service_role key for full access.
    """
    if not rows:
        return
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Prefer": "return=minimal",
    }
    try:
        resp = requests.post(url, headers=headers, json=rows, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as e:
        log.error(f"❌ Supabase POST {table} failed ({len(rows)} rows): {e}")
        raise


def flush_buffers() -> None:
    """Flush buffered packets and alerts to Supabase via batch POST."""
    global PACKET_BUFFER, ALERT_BUFFER, TOTAL_PACKETS, TOTAL_ALERTS

    with BUFFER_LOCK:
        packets = list(PACKET_BUFFER)
        alerts = list(ALERT_BUFFER)
        PACKET_BUFFER.clear()
        ALERT_BUFFER.clear()

    # Insert packets
    if packets:
        try:
            _supabase_insert("packets", packets)
            TOTAL_PACKETS += len(packets)
            log.info(f"📦 Flushed {len(packets)} packets (total: {TOTAL_PACKETS})")
        except Exception as e:
            log.error(f"❌ Packet flush failed, re-buffering {len(packets)} rows: {e}")
            with BUFFER_LOCK:
                PACKET_BUFFER.extend(packets)

    # Insert alerts
    if alerts:
        try:
            _supabase_insert("network_alerts", alerts)
            TOTAL_ALERTS += len(alerts)
            log.info(f"🚨 Flushed {len(alerts)} alerts (total: {TOTAL_ALERTS})")
        except Exception as e:
            log.error(f"❌ Alert flush failed, re-buffering {len(alerts)} rows: {e}")
            with BUFFER_LOCK:
                ALERT_BUFFER.extend(alerts)


def periodic_flush() -> None:
    """Background thread that flushes buffers every FLUSH_INTERVAL seconds."""
    while not SHUTDOWN_FLAG.is_set():
        SHUTDOWN_FLAG.wait(FLUSH_INTERVAL)
        flush_buffers()


def queue_packet(packet_row: dict[str, Any]) -> None:
    """Thread-safe append to the packet buffer."""
    with BUFFER_LOCK:
        PACKET_BUFFER.append(packet_row)


def queue_alert(
    src_ip: str,
    dst_ip: str,
    title: str,
    description: str,
    severity: str,
    protocol: str = "OTHER",
    port: int | None = None,
    category: str = "network_scan",
    entropy: float | None = None,
    payload_hex: str | None = None,
    payload_size: int | None = None,
) -> None:
    """Queue a security alert for batch insertion."""
    alert: dict[str, Any] = {
        "team_id": TEAM_ID,
        "sensor_id": SENSOR_ID,
        "src_ip": src_ip,
        "dst_ip": dst_ip,
        "title": title,
        "description": description,
        "severity": SEVERITY_MAP.get(severity, "medium"),
        "protocol": protocol,
        "port": port,
        "category": category,
        "status": "open",
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }
    # Attach entropy metadata if present
    if entropy is not None:
        alert["entropy_score"] = round(entropy, 4)
    if payload_hex is not None:
        alert["payload_sample"] = payload_hex
    if payload_size is not None:
        alert["payload_size"] = payload_size

    with BUFFER_LOCK:
        ALERT_BUFFER.append(alert)
    log.info(f"  🚨 Alert queued [{severity}] {title} (entropy={entropy})")


# ═══════════════════════════════════════════════════════════════════════
#  PORT-SCAN SLIDING WINDOW (2-second)
# ═══════════════════════════════════════════════════════════════════════

def check_port_scan(src_ip: str, dst_port: int | None, now: float) -> None:
    """
    Track unique destination ports per source IP in a 2-second sliding window.
    If >15 unique ports seen, raise a Port Scan / Infrastructure Probing alert.
    """
    if dst_port is None:
        return

    with PORT_SCAN_LOCK:
        entry = port_scan_tracker.get(src_ip)

        if entry is None or (now - entry["window_start"]) > PORT_SCAN_WINDOW:
            # Start a new window
            entry = {"ports": set(), "window_start": now}
            port_scan_tracker[src_ip] = entry

        entry["ports"].add(dst_port)
        unique_count = len(entry["ports"])

        if unique_count >= PORT_SCAN_THRESHOLD:
            # Trigger alert and reset the window to prevent spam
            alert_description = (
                f"Source IP {src_ip} targeted {unique_count} unique destination ports "
                f"within a {PORT_SCAN_WINDOW}-second sliding window. "
                f"This is characteristic of an active Port Scan / Infrastructure Probing "
                f"tool (nmap, masscan, zmap)."
            )
            queue_alert(
                src_ip=src_ip,
                dst_ip="",
                title="Port Scan / Infrastructure Probing Detected",
                description=alert_description,
                severity="High",
                protocol="TCP",
                port=dst_port,
                category="port_scan",
            )
            # Reset: start fresh window
            port_scan_tracker[src_ip] = {"ports": set(), "window_start": now}


# ═══════════════════════════════════════════════════════════════════════
#  PACKET ANALYSIS (dispatched to thread pool)
# ═══════════════════════════════════════════════════════════════════════

def _process_packet(packet) -> None:
    """
    Analyse a single packet: extract metadata, compute entropy, run heuristics.
    This function runs inside a ThreadPoolExecutor worker.
    """
    if not packet.haslayer(IP):
        return

    ip_layer = packet[IP]
    src_ip = ip_layer.src
    dst_ip = ip_layer.dst

    protocol = "OTHER"
    port: int | None = None

    if packet.haslayer(TCP):
        protocol = "TCP"
        port = packet[TCP].dport
    elif packet.haslayer(UDP):
        protocol = "UDP"
        port = packet[UDP].dport

    # ── Extract raw payload bytes ──────────────────────────────
    raw_payload: bytes = b""
    if packet.haslayer(Raw):
        raw_payload = bytes(packet[Raw].load)

    payload_size = len(raw_payload) if raw_payload else len(packet)

    # ── Compute Shannon entropy if we have a payload ───────────
    entropy: float | None = None
    payload_hex: str | None = None
    if raw_payload:
        # Truncate to prevent huge payloads from eating memory
        sample = raw_payload[:MAX_PAYLOAD_BYTES]
        entropy = shannon_entropy(sample)
        payload_hex = sample.hex()

    now = time.time()

    # ── Build packet row for ingestion ─────────────────────────
    packet_row: dict[str, Any] = {
        "sensor_id": SENSOR_ID,
        "team_id": TEAM_ID,
        "src_ip": src_ip,
        "dst_ip": dst_ip,
        "protocol": protocol,
        "payload_size": payload_size,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    # Attach entropy metadata to the packet record (optional — extra analytical value)
    if entropy is not None:
        packet_row["entropy_score"] = round(entropy, 4)
        packet_row["payload_hex"] = payload_hex

    queue_packet(packet_row)

    # ── HEURISTIC 1: High-entropy payload → exfiltration / ransomware ─
    if entropy is not None and entropy >= ENTROPY_THRESHOLD:
        alert_title, alert_desc = classify_high_entropy(entropy, protocol, port)
        if alert_title:
            queue_alert(
                src_ip=src_ip,
                dst_ip=dst_ip,
                title=alert_title,
                description=alert_desc,
                severity="Critical" if entropy >= 7.8 else "High",
                protocol=protocol,
                port=port,
                category="data_exfiltration",
                entropy=entropy,
                payload_hex=payload_hex,
                payload_size=payload_size,
            )

    # ── HEURISTIC 2: Port-scan detection (2-second sliding window) ──
    if protocol in ("TCP", "UDP"):
        check_port_scan(src_ip, port, now)


def analyze_packet(packet) -> None:
    """
    Entry point called by Scapy's sniff() for each captured frame.
    Offloads the actual processing to the thread pool so sniff() never blocks.
    """
    if not packet.haslayer(IP):
        return
    EXECUTOR.submit(_process_packet, packet)


# ═══════════════════════════════════════════════════════════════════════
#  SIGNAL HANDLING & GRACEFUL SHUTDOWN
# ═══════════════════════════════════════════════════════════════════════

def signal_handler(signum, frame) -> None:
    """Graceful shutdown: signal flush thread, flush remaining buffers."""
    log.info(f"\n🛑 Received signal {signum}. Shutting down gracefully…")
    SHUTDOWN_FLAG.set()

    # Give executor threads a moment to finish current work
    EXECUTOR.shutdown(wait=True, cancel_futures=False)

    # One final flush
    flush_buffers()

    log.info(f"📊  Total packets ingested:  {TOTAL_PACKETS}")
    log.info(f"📊  Total alerts generated:  {TOTAL_ALERTS}")
    log.info("👋 Goodbye.")
    sys.exit(0)


# ═══════════════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # ── Authenticate sensor ────────────────────────────────────
    if not SENSOR_ID:
        log.info("🔐 Authenticating sensor with Supabase…")
        SENSOR_ID = authenticate_sensor()
        if not SENSOR_ID:
            log.error("❌ Authentication failed. Exiting.")
            sys.exit(1)
    else:
        log.info(f"🔐 Using provided SENSOR_ID: {SENSOR_ID}")

    # ── Start background flush thread ──────────────────────────
    flush_thread = threading.Thread(target=periodic_flush, daemon=True)
    flush_thread.start()
    log.info(f"⏱️  Flush interval: {FLUSH_INTERVAL}s (batch POST to Supabase)")

    # ── Start sniffing ─────────────────────────────────────────
    try:
        iface = INTERFACE or scapy_conf.iface
        log.info(f"🛡️  Guardium sniffer v3.0 bound to interface: {iface}")
        log.info(f"🔍  Sensor ID: {SENSOR_ID}")
        log.info(f"📊  Entropy threshold: {ENTROPY_THRESHOLD} bits")
        log.info(f"📊  Port-scan window: {PORT_SCAN_WINDOW}s / {PORT_SCAN_THRESHOLD}+ unique ports")
        log.info(f"🧵  Thread pool workers: {EXECUTOR._max_workers}")
        log.info("=" * 60)

        # Async sniff with store=0 (don't keep packets in memory)
        sniff(iface=iface, prn=analyze_packet, store=0)

    except PermissionError:
        log.error("\n❌ PRIVILEGE ERROR: Raw socket capture requires root / admin.")
        log.error("   Linux:   sudo python guardium_sniffer.py")
        log.error("   Termux:  pkg install tsu && tsu python guardium_sniffer.py")
        sys.exit(1)
    except ImportError as e:
        log.error(f"❌ Missing dependency: {e}")
        log.error("   Install: pip install supabase scapy requests")
        sys.exit(1)
    except Exception as exc:
        log.error(f"❌ Sniffer crashed: {exc}")
        sys.exit(1)