#!/usr/bin/env python3
"""Import local photographs, preserve originals, and produce game data.

Pillow is optional for PNG/JPEG/WebP EXIF reading. HEIC support depends on the
installed Pillow plugins. Files without a trustworthy date are reported and
are not added to generated/memories.json until corrected in overrides.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
DATE_RE = re.compile(r"(20\d{2})[-_](\d{2})[-_](\d{2})")


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_capture(raw: str) -> tuple[str, str | None]:
    date = datetime.strptime(raw[:10], "%Y:%m:%d").date().isoformat()
    try:
        time = datetime.strptime(raw[11:19], "%H:%M:%S").strftime("%H:%M:%S")
    except ValueError:
        time = None
    return date, time


def exif_date(path: Path) -> tuple[str | None, str | None, str, str]:
    try:
        try:
            from pillow_heif import register_heif_opener
            register_heif_opener()
        except ImportError:
            pass
        from PIL import Image, ExifTags
        with Image.open(path) as image:
            exif = image.getexif()
            values = dict(exif)
            values.update(exif.get_ifd(34665))
            names = {ExifTags.TAGS.get(key, key): value for key, value in values.items()}
            raw = names.get("DateTimeOriginal") or names.get("DateTimeDigitized") or names.get("DateTime")
            if raw:
                date, time = parse_capture(str(raw))
                return date, time, "EXIF", "confirmed"
    except (ImportError, OSError, ValueError):
        pass
    # ImageMagick provides a local fallback, including libheif on Linux.
    if shutil.which("identify"):
        result = subprocess.run(["identify", "-format", "%[EXIF:DateTimeOriginal]\n%[EXIF:DateTimeDigitized]\n%[EXIF:DateTime]", str(path)], capture_output=True, text=True)
        for raw in result.stdout.splitlines() if result.returncode == 0 else []:
            try:
                date, time = parse_capture(raw)
                return date, time, "EXIF", "confirmed"
            except ValueError:
                pass
    match = DATE_RE.search(path.stem)
    if match:
        try:
            parsed = datetime.strptime("-".join(match.groups()), "%Y-%m-%d")
            return parsed.date().isoformat(), None, "filename", "review"
        except ValueError:
            pass
    return None, None, "missing", "review"


def load_json(path: Path, fallback: dict) -> dict:
    if not path.exists():
        return fallback
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else fallback
    except json.JSONDecodeError as error:
        raise SystemExit(f"Cannot parse {path}: {error}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import local photos for Our Little Timeline.")
    parser.add_argument("--inbox", type=Path, default=Path("photos-inbox"))
    parser.add_argument("--photos", type=Path, default=Path("photos"))
    parser.add_argument("--output", type=Path, default=Path("generated"))
    parser.add_argument("--overrides", type=Path, default=Path("overrides.json"))
    args = parser.parse_args()
    args.photos.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    overrides = load_json(args.overrides, {})
    existing = load_json(args.output / "manifest.json", {"files": []})
    previous = {entry.get("sha256"): entry for entry in existing.get("files", [])}
    seen_hashes = set()
    used_names = {Path(entry.get("generated_path", "")).name for entry in existing.get("files", [])}
    counters: dict[str, int] = {}
    manifest, memories, report = [], [], {"missing_dates": [], "duplicates": [], "unsupported": [], "errors": [], "decoder_errors": [], "missing_times": [], "same_timestamp": [], "uncertain_dates": []}

    for source in sorted(args.inbox.rglob("*")) if args.inbox.exists() else []:
        if not source.is_file():
            continue
        if source.suffix.lower() not in SUPPORTED:
            report["unsupported"].append(str(source))
            continue
        try:
            digest = file_hash(source)
            if digest in seen_hashes:
                report["duplicates"].append({"path": str(source), "reason": "exact file hash already imported"})
                continue
            seen_hashes.add(digest)
            old = previous.get(digest)
            date, time, source_name, status = exif_date(source)
            if not date and old:
                date, source_name, status = old["capture_date"], old["date_source"], old["status"]
                time = old.get("capture_time")
            override = overrides.get(str(source)) or overrides.get(source.name) or {}
            if override.get("date"):
                date, source_name, status = override["date"], "override", "confirmed"
            if "time" in override:
                time = override["time"] or None
            if time is not None:
                if not isinstance(time, str) or not re.fullmatch(r"\d{2}:\d{2}:\d{2}", time):
                    raise ValueError("Capture time must use HH:MM:SS.")
                datetime.strptime(time, "%H:%M:%S")
            if not date:
                report["missing_dates"].append(str(source))
                continue
            datetime.strptime(date, "%Y-%m-%d")
            extension = ".jpg" if source.suffix.lower() in {".heic", ".heif"} else source.suffix.lower()
            if old and Path(old["generated_path"]).suffix.lower() == extension:
                destination = Path(old["generated_path"])
                generated_name = destination.name
            else:
                number = counters.get(date, 0) + 1
                generated_name = f"{date}_{number:03d}{extension}"
                while generated_name in used_names or (args.photos / generated_name).exists():
                    number += 1
                    generated_name = f"{date}_{number:03d}{extension}"
                counters[date] = number
                used_names.add(generated_name)
                destination = args.photos / generated_name
            if not destination.exists():
                if source.suffix.lower() in {".heic", ".heif"}:
                    from PIL import Image, ImageOps
                    try:
                        with Image.open(source) as image:
                            ImageOps.exif_transpose(image).convert("RGB").save(destination, quality=95)
                    except OSError:
                        converter = shutil.which("magick") or shutil.which("convert")
                        if not converter:
                            raise ValueError("HEIC decoding requires pillow-heif or ImageMagick with libheif.")
                        result = subprocess.run([converter, str(source), "-auto-orient", "-quality", "95", str(destination)], capture_output=True, text=True)
                        if result.returncode:
                            destination.unlink(missing_ok=True)
                            raise ValueError(result.stderr)
                else:
                    shutil.copy2(source, destination)
            entry = {"original_path": str(source), "generated_path": str(destination), "capture_date": date,
                     "capture_time": time, "date_source": source_name, "status": status, "sha256": digest}
            if status != "confirmed":
                report["uncertain_dates"].append(entry)
            manifest.append(entry)
            memories.append({"id": destination.stem, "photo": f"./photos/{generated_name}", "date": date, "time": time,
                             "caption": override.get("caption", ""), "alt": override.get("alt", f"Spomin z dne {date}")})

        except (OSError, ValueError) as error:
            report["errors"].append({"path": str(source), "error": str(error)})

    all_manifest = manifest
    (args.output / "manifest.json").write_text(json.dumps({"files": all_manifest}, indent=2) + "\n", encoding="utf-8")
    memories = sorted(memories, key=lambda item: (item["date"], item["time"] or ""))
    playable = []
    timestamps = set()
    date_counts = {}
    for memory in memories:
        date_counts[memory["date"]] = date_counts.get(memory["date"], 0) + 1
    for memory in memories:
        timestamp = (memory["date"], memory["time"])
        if date_counts[memory["date"]] > 1 and memory["time"] is None:
            report["missing_times"].append(memory)
        elif timestamp in timestamps:
            report["same_timestamp"].append(memory)
        else:
            timestamps.add(timestamp)
            playable.append(memory)
    (args.output / "memories.json").write_text(json.dumps(playable, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (args.output / "review-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(manifest)} photo(s). Review {args.output / 'review-report.json'} for anything needing attention.")


if __name__ == "__main__":
    main()
