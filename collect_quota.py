#!/usr/bin/env python3
"""
AI Usage Quota Collector
Fetches live usage data from Claude Code and Antigravity (Windsurf/Codeium).

Supported services:
  1. Claude Code — OAuth API (session/weekly/extra usage)
  2. Antigravity — Local language server (per-model quota)
  3. Gemini — Google API (optional, experimental)

Output: ~/.ai-usage-widget/quota_data.json
"""

import json, os, subprocess, re, sys, urllib.request, urllib.error, urllib.parse, ssl, time
from datetime import datetime, timezone

# Output path — always in ~/.ai-usage-widget/
DATA_DIR = os.path.join(os.path.expanduser("~"), ".ai-usage-widget")
OUTPUT = os.path.join(DATA_DIR, "quota_data.json")

def log(msg):
    print(f"[quota] {msg}", file=sys.stderr)


# ─── 1. Claude Code OAuth API ────────────────────────────────────────

def get_claude_quota():
    """Fetch real Claude Code usage via OAuth API."""
    try:
        # Try Keychain first (macOS)
        result = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            # Fallback to credentials file
            cred_file = os.path.expanduser("~/.claude/.credentials.json")
            if os.path.exists(cred_file):
                with open(cred_file) as f:
                    creds = json.load(f)
            else:
                log("Claude: no credentials found")
                return None
        else:
            creds = json.loads(result.stdout.strip())

        token = creds.get("claudeAiOauth", {}).get("accessToken")
        if not token:
            log("Claude: no OAuth access token")
            return None

        # SSL context with fallback
        ssl_ctx = ssl.create_default_context()
        try:
            import certifi
            ssl_ctx.load_verify_locations(certifi.where())
        except ImportError:
            ssl_ctx = ssl._create_unverified_context()

        req = urllib.request.Request(
            "https://api.anthropic.com/api/oauth/usage",
            headers={
                "Authorization": f"Bearer {token}",
                "anthropic-beta": "oauth-2025-04-20",
            }
        )
        with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as resp:
            data = json.loads(resp.read())

        result = {"source": "oauth_api"}

        # Session (5-hour window)
        fh = data.get("five_hour", {})
        result["session"] = {
            "pct_used": fh.get("utilization", 0),
            "resets_at": fh.get("resets_at"),
        }

        # Weekly (7-day window)
        sd = data.get("seven_day", {})
        result["weekly"] = {
            "pct_used": sd.get("utilization", 0),
            "resets_at": sd.get("resets_at"),
        }

        # Per-model weekly
        for key in ["seven_day_sonnet", "seven_day_opus", "seven_day_cowork"]:
            val = data.get(key)
            if val:
                result[key] = {
                    "pct_used": val.get("utilization", 0),
                    "resets_at": val.get("resets_at"),
                }

        # Extra usage
        eu = data.get("extra_usage", {})
        if eu:
            result["extra_usage"] = {
                "is_enabled": eu.get("is_enabled", False),
                "used_cents": eu.get("used_credits", 0),
                "limit_cents": eu.get("monthly_limit", 0),
                "pct_used": eu.get("utilization", 0),
            }

        log(f"Claude: session {result['session']['pct_used']}%, weekly {result['weekly']['pct_used']}%")
        return result

    except Exception as e:
        log(f"Claude: error — {e}")
        return None


# ─── 2. Antigravity / Windsurf Local Language Server ─────────────────

def get_antigravity_quota():
    """Fetch per-model quota from the local Antigravity/Windsurf language server."""
    try:
        result = subprocess.run(
            ["ps", "-ax", "-o", "pid=,command="],
            capture_output=True, text=True, timeout=5
        )

        processes = []
        for line in result.stdout.splitlines():
            if "language_server_macos" in line and "antigravity" in line.lower():
                csrf_match = re.search(r'--csrf_token\s+(\S+)', line)
                port_match = re.search(r'--extension_server_port\s+(\d+)', line)
                pid_match = re.match(r'\s*(\d+)', line)
                if csrf_match and pid_match:
                    processes.append({
                        "pid": pid_match.group(1),
                        "csrf": csrf_match.group(1),
                        "ext_port": int(port_match.group(1)) if port_match else None,
                    })

        if not processes:
            # Also try Windsurf (same engine)
            for line in result.stdout.splitlines():
                if "language_server" in line and ("windsurf" in line.lower() or "codeium" in line.lower()):
                    csrf_match = re.search(r'--csrf_token\s+(\S+)', line)
                    port_match = re.search(r'--extension_server_port\s+(\d+)', line)
                    pid_match = re.match(r'\s*(\d+)', line)
                    if csrf_match and pid_match:
                        processes.append({
                            "pid": pid_match.group(1),
                            "csrf": csrf_match.group(1),
                            "ext_port": int(port_match.group(1)) if port_match else None,
                        })

        if not processes:
            log("Antigravity: no language server process found")
            return None

        proc = processes[0]
        log(f"Antigravity: found process PID={proc['pid']}, ext_port={proc['ext_port']}")

        # Find connect port via lsof
        lsof_result = subprocess.run(
            ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-p", proc["pid"]],
            capture_output=True, text=True, timeout=5
        )
        ports = set()
        for line in lsof_result.stdout.splitlines():
            m = re.search(r':(\d+)\s', line)
            if m:
                ports.add(int(m.group(1)))

        ext_port = proc["ext_port"] or 0
        sorted_ports = sorted(ports, key=lambda p: abs(p - ext_port))

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        connect_port = None
        for port in sorted_ports[:20]:
            try:
                req = urllib.request.Request(
                    f"https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/GetUnleashData",
                    data=b'{}',
                    headers={
                        "X-Codeium-Csrf-Token": proc["csrf"],
                        "Connect-Protocol-Version": "1",
                        "Content-Type": "application/json",
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=2, context=ctx) as resp:
                    if resp.status == 200:
                        connect_port = port
                        break
            except:
                continue

        if not connect_port:
            log("Antigravity: no connect port found")
            return None

        log(f"Antigravity: connect port = {connect_port}")

        # Call GetUserStatus
        body = json.dumps({
            "metadata": {
                "ideName": "antigravity",
                "extensionName": "antigravity",
                "locale": "en",
                "ideVersion": "unknown"
            }
        }).encode()

        req = urllib.request.Request(
            f"https://127.0.0.1:{connect_port}/exa.language_server_pb.LanguageServerService/GetUserStatus",
            data=body,
            headers={
                "X-Codeium-Csrf-Token": proc["csrf"],
                "Connect-Protocol-Version": "1",
                "Content-Type": "application/json",
            },
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read())

        us = data.get("userStatus", {})
        plan_info = us.get("planStatus", {}).get("planInfo", {})
        configs = us.get("cascadeModelConfigData", {}).get("clientModelConfigs", [])

        models = []
        for c in configs:
            qi = c.get("quotaInfo", {})
            if qi:
                remaining = qi.get("remainingFraction", 1.0)
                models.append({
                    "label": c.get("label", "Unknown"),
                    "remaining_fraction": remaining,
                    "pct_used": round((1 - remaining) * 100, 1),
                    "reset_time": qi.get("resetTime"),
                })

        out = {
            "source": "local_language_server",
            "plan": plan_info.get("planName", "Unknown"),
            "email": us.get("email", ""),
            "prompt_credits": us.get("planStatus", {}).get("availablePromptCredits", 0),
            "flow_credits": us.get("planStatus", {}).get("availableFlowCredits", 0),
            "models": models,
        }

        log(f"Antigravity: {len(models)} models, plan={out['plan']}")
        return out

    except Exception as e:
        log(f"Antigravity: error — {e}")
        return None


# ─── 3. Gemini Quota (placeholder) ───────────────────────────────────

def get_gemini_quota():
    """Gemini quota tracking — not yet supported.

    The Gemini Cloud Code quota API requires OAuth credentials that vary
    per user. If you'd like to contribute Gemini support, see:
    https://github.com/frankie-yanxu/ai-usage-widget/issues
    """
    return None


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    quota = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "claude": get_claude_quota(),
        "antigravity": get_antigravity_quota(),
        "gemini": get_gemini_quota(),
    }

    with open(OUTPUT, 'w') as f:
        json.dump(quota, f, indent=2)

    log(f"Quota data written to {OUTPUT}")
    print(json.dumps(quota, indent=2))


if __name__ == "__main__":
    main()

