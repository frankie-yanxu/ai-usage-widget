#!/bin/bash
# Debug script for AI Usage Widget

echo "------------------------------------------------"
echo "🔍 AI Usage Widget Debugger"
echo "------------------------------------------------"

echo "1. Checking Python..."
python3 --version || echo "❌ Python 3 not found"

echo ""
echo "2. Checking Directory..."
DATA_DIR="$HOME/.ai-usage-widget"
if [ -d "$DATA_DIR" ]; then
    echo "✅ Data directory exists: $DATA_DIR"
else
    echo "❌ Data directory MISSING: $DATA_DIR"
fi

echo ""
echo "3. Running Collector Script..."
if [ -f "$DATA_DIR/collect_quota.py" ]; then
    /usr/bin/env python3 "$DATA_DIR/collect_quota.py"
else
    echo "❌ collect_quota.py missing"
fi

echo ""
echo "4. Checking Output File..."
JSON_FILE="$DATA_DIR/quota_data.json"
if [ -f "$JSON_FILE" ]; then
    echo "✅ JSON file exists. Content:"
    cat "$JSON_FILE"
else
    echo "❌ JSON file MISSING."
fi

echo ""
echo "------------------------------------------------"
