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

    except urllib.error.HTTPError as e:
        if e.code == 401:
            log("Claude: 401 Unauthorized (Login Required)")
            return {"error": "Login Required", "detail": "Run: claude login"}
        log(f"Claude: HTTP error {e.code} — {e}")
        return {"error": f"HTTP {e.code}", "detail": str(e)}
    except Exception as e:
        log(f"Claude: error — {e}")
        return {"error": "Error", "detail": str(e)}


# ─── 2. Antigravity / Windsurf — via antigravity-usage CLI ───────────

def get_antigravity_quota():
    """Fetch per-model quota using the antigravity-usage CLI tool.

    Install: npm install -g antigravity-usage
    The CLI handles language server discovery, CSRF tokens, and SSL internally.
    """
    try:
        # Find the CLI binary (may be in npm global bin)
        cli_paths = [
            os.path.expanduser("~/.npm-global/bin/antigravity-usage"),
            "/usr/local/bin/antigravity-usage",
            "/opt/homebrew/bin/antigravity-usage",
        ]
        cli = None
        for p in cli_paths:
            if os.path.isfile(p):
                cli = p
                break
        if not cli:
            # Try PATH
            which = subprocess.run(["which", "antigravity-usage"],
                                   capture_output=True, text=True, timeout=3)
            if which.returncode == 0:
                cli = which.stdout.strip()

        if not cli:
            log("Antigravity: antigravity-usage CLI not found (npm i -g antigravity-usage)")
            return None

        result = subprocess.run(
            [cli, "quota", "--json"],
            capture_output=True, text=True, timeout=30
        )

        if result.returncode != 0:
            log(f"Antigravity: CLI error — {result.stderr.strip()}")
            return None

        data = json.loads(result.stdout)

        # Transform models to widget format (skip autocomplete-only models like Gemini 2.5)
        models = []
        for m in data.get("models", []):
            if m.get("isAutocompleteOnly", False):
                continue
            remaining = m.get("remainingPercentage", 1.0)
            models.append({
                "label": m.get("label", "Unknown"),
                "remaining_fraction": remaining,
                "pct_used": round((1 - remaining) * 100, 1),
                "reset_time": m.get("resetTime"),
            })

        # Prompt credits
        pc = data.get("promptCredits", {})
        prompt_available = pc.get("available", 0)
        prompt_monthly = pc.get("monthly", 0)
        prompt_used_pct = round(pc.get("usedPercentage", 0) * 100, 1) if pc else 0

        out = {
            "source": "antigravity_cli",
            "email": data.get("email", ""),
            "prompt_credits": prompt_available,
            "prompt_credits_monthly": prompt_monthly,
            "prompt_credits_used_pct": prompt_used_pct,
            "models": models,
        }

        log(f"Antigravity: {len(models)} models, {prompt_available} credits left")
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

