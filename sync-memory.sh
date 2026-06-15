#!/bin/bash
# sync-memory.sh — Synct @freebuff Memory-Dateien zwischen Projekt und Google Drive
# Usage: bash sync-memory.sh          # pull: Google Drive → Projekt
#        bash sync-memory.sh push     # push: Projekt → Google Drive

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEMORY_DIR="$PROJECT_DIR/.codebuff/memory"
GDRIVE_PATH="/Users/daerias/Meine Ablage/@ - coding/@ - AI-Agents/@freebuff"

# Dateien die gesynct werden
FILES=(
  "user-profile.md"
  "session-context.md"
  "knowledge.md"
)

echo "🧠 @freebuff Memory Sync"
echo "   Projekt: $MEMORY_DIR"
echo "   Drive:   $GDRIVE_PATH"
echo ""

# Prüfen ob Google Drive gemountet ist
if [ ! -d "$GDRIVE_PATH" ]; then
  echo "❌ Google Drive nicht gefunden unter: $GDRIVE_PATH"
  echo "   Bitte Google Drive mounten und erneut versuchen."
  exit 1
fi

# Memory-Ordner im Projekt anlegen
mkdir -p "$MEMORY_DIR"

if [ "$1" = "push" ]; then
  # PUSH: Projekt → Google Drive
  echo "📤 Push: Projekt → Google Drive"
  for file in "${FILES[@]}"; do
    if [ -f "$MEMORY_DIR/$file" ]; then
      cp "$MEMORY_DIR/$file" "$GDRIVE_PATH/$file"
      echo "   ✅ $file → Drive"
    else
      echo "   ⚠️  $file nicht im Projekt (.codebuff/memory/)"
    fi
  done
else
  # PULL: Google Drive → Projekt (default)
  echo "📥 Pull: Google Drive → Projekt"
  for file in "${FILES[@]}"; do
    if [ -f "$GDRIVE_PATH/$file" ]; then
      cp "$GDRIVE_PATH/$file" "$MEMORY_DIR/$file"
      echo "   ✅ $file"
    else
      echo "   ⚠️  $file nicht im Google Drive"
    fi
  done
fi

echo ""
echo "✨ Sync abgeschlossen."
echo "   Memory-Dateien sind jetzt in .codebuff/memory/ verfügbar."
