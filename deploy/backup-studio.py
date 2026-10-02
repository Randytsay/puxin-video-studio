#!/usr/bin/env python3
"""Consistent SQLite backup plus immutable media, retained for seven days."""
import os, sqlite3, tarfile, tempfile, time
from pathlib import Path
root = Path(os.environ.get('PUXIN_DATA_DIR', '/srv/ai-workspace/shared/puxin-video-studio'))
backups = root / 'backups'
backups.mkdir(parents=True, exist_ok=True, mode=0o700)
if not (root / 'studio.sqlite').exists():
    raise SystemExit(0)
name = time.strftime('%Y%m%d-%H%M%S')
with tempfile.TemporaryDirectory(dir=backups) as staging:
    snapshot = Path(staging) / 'studio.sqlite'
    with sqlite3.connect(root / 'studio.sqlite') as source, sqlite3.connect(snapshot) as target:
        source.backup(target)
    temporary = backups / (name + '.tmp')
    with tarfile.open(temporary, 'w:gz') as archive:
        archive.add(snapshot, arcname='studio.sqlite')
        if (root / 'media').exists():
            archive.add(root / 'media', arcname='media')
    temporary.rename(backups / (name + '.tar.gz'))
for old in backups.glob('*.tar.gz'):
    if old.stat().st_mtime < time.time() - 7 * 86400:
        old.unlink()
