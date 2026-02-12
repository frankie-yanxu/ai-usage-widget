#!/bin/bash
# AI Usage Widget - Uninstaller

echo "Uninstalling AI Usage Widget..."

# Remove LaunchAgent
PLIST="$HOME/Library/LaunchAgents/com.ai-usage-widget.collect.plist"
if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null
    rm "$PLIST"
    echo "✓ LaunchAgent removed"
fi

# Remove widget from Übersicht
WIDGET="$HOME/Library/Application Support/Übersicht/widgets/quota.jsx"
if [ -f "$WIDGET" ]; then
    rm "$WIDGET"
    echo "✓ Widget removed from Übersicht"
fi

# Remove data directory
DATA_DIR="$HOME/.ai-usage-widget"
if [ -d "$DATA_DIR" ]; then
    rm -rf "$DATA_DIR"
    echo "✓ Data directory removed"
fi

echo ""
echo "✅ Uninstall complete. Your credentials were NOT removed."
