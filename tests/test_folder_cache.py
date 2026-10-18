import threading
import time
import unittest
from unittest.mock import MagicMock, patch

import smartgallery as gallery


class FolderSnapshotTests(unittest.TestCase):
    def setUp(self):
        gallery.folder_config_refreshing = False
        gallery.folder_config_cache = {'old': True}
        gallery.folder_config_cached_at = 0

    def test_navigation_does_not_wait_for_expired_snapshot(self):
        started = threading.Event()
        finish = threading.Event()
        def build():
            started.set()
            finish.wait(2)
            gallery.folder_config_cache = {'new': True}
            gallery.folder_config_cached_at = time.monotonic()
            return gallery.folder_config_cache
        with patch.object(gallery, 'build_dynamic_folder_config', side_effect=build) as mock:
            try:
                self.assertEqual(gallery.get_dynamic_folder_config(), {'old': True})
                self.assertTrue(started.wait(1))
                # A second navigation while discovery is blocked must also
                # return immediately, and must not start another scanner.
                self.assertEqual(gallery.get_dynamic_folder_config(), {'old': True})
                self.assertEqual(mock.call_count, 1)
            finally:
                finish.set()
            for _ in range(100):
                if not gallery.folder_config_refreshing:
                    break
                time.sleep(.01)
            self.assertEqual(gallery.folder_config_cache, {'new': True})

    def test_explicit_refresh_is_current(self):
        with patch.object(gallery, 'build_dynamic_folder_config', return_value={'current': True}) as build:
            self.assertEqual(gallery.get_dynamic_folder_config(force_refresh=True), {'current': True})
            build.assert_called_once()

    def test_invalidation_requires_current_snapshot(self):
        gallery.invalidate_folder_config()
        with patch.object(gallery, 'build_dynamic_folder_config', return_value={'current': True}) as build:
            self.assertEqual(gallery.get_dynamic_folder_config(), {'current': True})
            build.assert_called_once()

    def test_scan_cannot_republish_after_mutation(self):
        connection = MagicMock()
        connection.__enter__.return_value.execute.return_value.fetchall.return_value = []
        def walk(*args, **kwargs):
            gallery.invalidate_folder_config()
            return []
        with patch.object(gallery.os, 'walk', side_effect=walk), patch.object(gallery, 'get_db_connection', return_value=connection):
            gallery.build_dynamic_folder_config()
        self.assertIsNone(gallery.folder_config_cache)


if __name__ == '__main__':
    unittest.main()
