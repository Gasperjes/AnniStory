import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

SCRIPT = Path(__file__).with_name('import_photos.py').resolve()
spec = importlib.util.spec_from_file_location('import_photos', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ImportTests(unittest.TestCase):
    def test_nested_exif(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'image.jpg'
            exif = Image.Exif()
            exif[34665] = {36867: '2024:05:12 13:00:00'}
            Image.new('RGB', (8, 8)).save(path, exif=exif)
            self.assertEqual(module.exif_date(path), ('2024-05-12', '13:00:00', 'EXIF', 'confirmed'))

    def test_same_day_times_ties_and_missing_time(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            inbox = root / 'photos-inbox'
            inbox.mkdir()
            for name, color, time in [('late', 'red', '18:00:01'), ('early', 'blue', '10:00:00'), ('tie', 'green', '10:00:00'), ('unknown', 'yellow', None)]:
                exif = Image.Exif()
                if time:
                    exif[34665] = {36867: f'2024:05:12 {time}'}
                Image.new('RGB', (8, 8), color).save(inbox / f'{name}.jpg', exif=exif)
            (root / 'overrides.json').write_text(json.dumps({'unknown.jpg': {'date': '2024-05-12'}}))
            def run():
                subprocess.run([sys.executable, str(SCRIPT)], cwd=root, check=True, capture_output=True)
                return json.loads((root / 'generated/memories.json').read_text())
            memories = run()
            self.assertEqual([m['time'] for m in memories], ['10:00:00', '18:00:01'])
            self.assertEqual(run(), memories)
            report = json.loads((root / 'generated/review-report.json').read_text())
            self.assertEqual(len(report['same_timestamp']), 1)
            self.assertEqual(len(report['missing_times']), 1)
            (root / 'overrides.json').write_text(json.dumps({'unknown.jpg': {'date': '2024-05-12', 'time': '12:30:00'}}))
            self.assertEqual([m['time'] for m in run()], ['10:00:00', '12:30:00', '18:00:01'])

    def test_repeat_import_duplicates_and_overrides(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            inbox = root / 'photos-inbox'
            inbox.mkdir()
            Image.new('RGB', (8, 8)).save(inbox / 'a.jpg')
            (inbox / 'duplicate.jpg').write_bytes((inbox / 'a.jpg').read_bytes())
            overrides = root / 'overrides.json'
            overrides.write_text(json.dumps({'a.jpg': {'date': '2024-05-12', 'caption': 'Najin dan'}}))
            def run():
                subprocess.run([sys.executable, str(SCRIPT)], cwd=root, check=True, capture_output=True)
                return json.loads((root / 'generated/memories.json').read_text())
            first = run()
            self.assertEqual(run(), first)
            self.assertEqual(len(first), 1)
            self.assertEqual(len(list((root / 'photos').iterdir())), 1)
            overrides.write_text(json.dumps({'a.jpg': {'date': '2024-05-13', 'caption': 'Popravljeno'}}))
            self.assertEqual(run()[0]['caption'], 'Popravljeno')
            self.assertEqual(run()[0]['date'], '2024-05-13')

if __name__ == '__main__':
    unittest.main()
