#!/bin/bash
# AI Usage Widget - Install Script for macOS
# Installs the Übersicht widget and sets up auto-collection of quota data

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   AI Usage Quota Widget — Installer      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ─── Check prerequisites ─────────────────────────────────────────────
echo -e "${YELLOW}▸ Checking prerequisites...${NC}"

# Check Python 3
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}✗ python3 not found. Please install Python 3.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} python3 found: $(which python3)"

# Check Übersicht
WIDGET_DIR="$HOME/Library/Application Support/Übersicht/widgets"
if [ ! -d "$WIDGET_DIR" ]; then
    echo -e "${RED}✗ Übersicht not found.${NC}"
    echo -e "  Install it from: ${BLUE}https://tracesof.net/uebersicht/${NC}"
    echo -e "  Or: ${BLUE}brew install --cask ubersicht${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Übersicht found"

# Check at least one AI tool is available
HAS_CLAUDE=false
HAS_ANTIGRAVITY=false

if [ -f "$HOME/.claude/.credentials.json" ] || security find-generic-password -s "Claude Code-credentials" -w &>/dev/null 2>&1; then
    HAS_CLAUDE=true
    echo -e "  ${GREEN}✓${NC} Claude Code credentials found"
else
    echo -e "  ${YELLOW}⚠${NC} Claude Code credentials not found (Claude section will be empty)"
fi

if command -v antigravity-usage &>/dev/null; then
    HAS_ANTIGRAVITY=true
    echo -e "  ${GREEN}✓${NC} antigravity-usage CLI found: $(which antigravity-usage)"
else
    echo -e "  ${YELLOW}⚠${NC} antigravity-usage CLI not found (install: npm i -g antigravity-usage)"
fi

if [ "$HAS_CLAUDE" = false ] && [ "$HAS_ANTIGRAVITY" = false ]; then
    echo -e "${RED}✗ No AI tools detected. At least one of Claude Code or Antigravity must be active.${NC}"
    exit 1
fi

echo ""

# ─── Install files ────────────────────────────────────────────────────
echo -e "${YELLOW}▸ Installing files...${NC}"

# Create data directory
DATA_DIR="$HOME/.ai-usage-widget"
mkdir -p "$DATA_DIR"
echo -e "  ${GREEN}✓${NC} Created $DATA_DIR"

# Copy collector script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/collect_quota.py" "$DATA_DIR/collect_quota.py"
chmod +x "$DATA_DIR/collect_quota.py"
echo -e "  ${GREEN}✓${NC} Installed collect_quota.py"

# Copy widget to Übersicht
cp "$SCRIPT_DIR/quota.jsx" "$WIDGET_DIR/quota.jsx"
echo -e "  ${GREEN}✓${NC} Installed widget to Übersicht"

echo ""

# ─── Initial data collection ─────────────────────────────────────────
echo -e "${YELLOW}▸ Collecting initial quota data...${NC}"
python3 "$DATA_DIR/collect_quota.py" 2>&1 | grep "^\[quota\]" || true

if [ -f "$DATA_DIR/quota_data.json" ]; then
    echo -e "  ${GREEN}✓${NC} quota_data.json created"
else
    echo -e "  ${YELLOW}⚠${NC} quota_data.json not created — check the errors above"
fi

echo ""

# ─── Set up auto-refresh (optional) ──────────────────────────────────
echo -e "${YELLOW}▸ Setting up auto-refresh...${NC}"

PLIST_NAME="com.ai-usage-widget.collect"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
PYTHON_PATH="$(which python3)"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PYTHON_PATH</string>
        <string>$DATA_DIR/collect_quota.py</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$HOME/.npm-global/bin</string>
    </dict>
    <key>StartInterval</key>
    <integer>120</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>$DATA_DIR/collect.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo -e "  ${GREEN}✓${NC} LaunchAgent installed (runs every 2 minutes)"

echo ""

# ─── Done ─────────────────────────────────────────────────────────────
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅  Installation complete!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  The widget should appear on your desktop."
echo -e "  To adjust position, edit: ${BLUE}$WIDGET_DIR/quota.jsx${NC}"
echo -e "  Look for ${YELLOW}top${NC} and ${YELLOW}left${NC} values near the top of the file."
echo ""
echo -e "  To uninstall, run: ${BLUE}bash $(dirname "$0")/uninstall.sh${NC}"
