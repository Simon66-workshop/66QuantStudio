#!/bin/sh
set -e
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
dest="$root/vendor/quantstudio"
if [ -f "$dest/package.json" ]; then
  echo "vendor/quantstudio already present"
  exit 0
fi
git clone --depth 1 https://github.com/quantskills/QuantStudio.git "$dest"
echo "cloned QuantStudio into vendor/quantstudio (optional; web UI runs without it)"
