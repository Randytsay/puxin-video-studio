#!/usr/bin/env python3
"""Consistent SQLite/media backup with optional private R2 replication."""
import hashlib, json, os, shlex, sqlite3, subprocess, tarfile, tempfile, time
from pathlib import Path
root = Path(os.environ.get('PUXIN_DATA_DIR', '/srv/ai-workspace/projects/puxin-video-studio/.data/studio'))
backups = root / 'backups'
backups.mkdir(parents=True, exist_ok=True, mode=0o700)
if not (root / 'studio.sqlite').exists():
    raise SystemExit(0)
name = time.strftime('%Y%m%d-%H%M%S')
final = backups / (name + '.tar.gz')
with tempfile.TemporaryDirectory(dir=backups) as staging:
    snapshot = Path(staging) / 'studio.sqlite'
    with sqlite3.connect(root / 'studio.sqlite') as source, sqlite3.connect(snapshot) as target:
        source.backup(target)
    temporary = backups / (name + '.tmp')
    with tarfile.open(temporary, 'w:gz') as archive:
        archive.add(snapshot, arcname='studio.sqlite')
        if (root / 'media').exists():
            archive.add(root / 'media', arcname='media')
    temporary.rename(final)

digest = hashlib.sha256()
with final.open('rb') as source:
    for chunk in iter(lambda: source.read(1024 * 1024), b''):
        digest.update(chunk)
checksum = final.with_suffix(final.suffix + '.sha256')
checksum.write_text(f'{digest.hexdigest()}  {final.name}\n', encoding='utf-8')
checksum.chmod(0o600)

bucket = os.environ.get('PUXIN_R2_BACKUP_BUCKET', 'puxin-video-studio-backups').strip()
if bucket:
    prefix = os.environ.get('PUXIN_R2_BACKUP_PREFIX', 'puxin-video-studio/daily').strip().strip('/')
    wrangler = shlex.split(os.environ.get(
        'PUXIN_R2_WRANGLER',
        '/srv/ai-workspace/webcodex/.local/bin/npx --yes wrangler@4.147.0',
    ))
    max_object_bytes = int(os.environ.get('PUXIN_R2_MAX_OBJECT_BYTES', str(250 * 1024 * 1024)))

    wrangler_env = dict(os.environ)
    wrangler_env.setdefault('HOME', '/srv/ai-workspace/webcodex')

    def upload(source: Path, remote_name: str, content_type: str):
        key = f'{prefix}/{remote_name}' if prefix else remote_name
        subprocess.run([
            *wrangler,
            'r2', 'object', 'put', f'{bucket}/{key}',
            f'--file={source}',
            '--remote',
            f'--content-type={content_type}',
            '--cache-control=private, no-store',
            '--force',
        ], check=True, env=wrangler_env)

    if final.stat().st_size <= max_object_bytes:
        upload(final, final.name, 'application/gzip')
        upload(checksum, checksum.name, 'text/plain; charset=utf-8')
    else:
        # Wrangler's single-object upload path is capped below large backup sizes.
        # Split only the remote copy; keep one normal tar.gz locally for simple restore.
        with tempfile.TemporaryDirectory(dir=backups) as part_dir_name:
            part_dir = Path(part_dir_name)
            parts = []
            with final.open('rb') as source:
                index = 1
                while True:
                    part_name = f'{final.name}.part{index:03d}'
                    part_path = part_dir / part_name
                    part_hash = hashlib.sha256()
                    part_size = 0
                    with part_path.open('wb') as target:
                        while part_size < max_object_bytes:
                            chunk = source.read(min(8 * 1024 * 1024, max_object_bytes - part_size))
                            if not chunk:
                                break
                            target.write(chunk)
                            part_hash.update(chunk)
                            part_size += len(chunk)
                    if not part_size:
                        part_path.unlink(missing_ok=True)
                        break
                    parts.append({'name': part_name, 'size': part_size, 'sha256': part_hash.hexdigest()})
                    upload(part_path, part_name, 'application/octet-stream')
                    index += 1
            upload(checksum, checksum.name, 'text/plain; charset=utf-8')
            manifest = {
                'version': 1,
                'archive': final.name,
                'size': final.stat().st_size,
                'sha256': digest.hexdigest(),
                'parts': parts,
                'restore': f"cat {' '.join(part['name'] for part in parts)} > {final.name}",
            }
            manifest_path = part_dir / f'{final.name}.manifest.json'
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            # Upload the manifest last: its presence is the completion marker for a multipart backup.
            upload(manifest_path, manifest_path.name, 'application/json')

for old in backups.glob('*.tar.gz'):
    if old.stat().st_mtime < time.time() - 7 * 86400:
        old.unlink()
        old.with_suffix(old.suffix + '.sha256').unlink(missing_ok=True)
