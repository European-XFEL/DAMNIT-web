import os
import logging
import asyncio
import time
import threading
from pathlib import Path
from watchdog.observers.polling import PollingObserver as Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent
from typing import Callable, Dict, Optional

from .utils import fetch_file_data

# Logging
logger = logging.getLogger("uvicorn")


class FileWatcher(FileSystemEventHandler):
    """
    Watches an specific file
    """

    def __init__(self, file_path: Path):
        """Initialize the watcher
        Args:
            file_path (str): file path
        """

        self.file_path = file_path
        self.last_modified = os.path.getmtime(file_path)

    def on_modified(self, event: FileSystemEvent):
        logger.info(f"change triggered for {str(self.file_path)}")
        
        if event.src_path == str(self.file_path):
            current_last_modified = os.path.getmtime(self.file_path)
            logger.info(f"File {self.file_path} modified at {current_last_modified}")
            
            if current_last_modified != self.last_modified:
                self.last_modified = current_last_modified

    async def initialize_last_modified(self):
        self.last_modified = os.path.getmtime(self.file_path)

class FileWatcherManager:
    def __init__(self) -> None:
        self.watchers: Dict[str, Dict] = {}
        self.timeout = 10
        self._cleanup_time = 1
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()

    def _cleanup_loop(self):
        while True:
            time.sleep(self._cleanup_time) 
            self.cleanup_inactive_watchers()

    def cleanup_inactive_watchers(self):
        if not self.watchers:
            return
        logger.info("Started clean up checks for FileWatcherManager")
        current_time = time.time()
        inactive_files = [
            file_path for file_path, data in self.watchers.items()
            if (current_time - data["last_activity"]) > self.timeout
        ]
        if inactive_files:
            logger.info(f"Stopping watcher for {inactive_files} due to inactivity.")
            for file in inactive_files:
                self.stop_watcher(file)

    async def register_client(self, file_path: str, client_ip: str, on_change: Optional[Callable] = None):
        """Starts watcher for a given file and proposal if watcher doesn't
        exist. If it does, adds the client to the client list.
        Every time this function is called, last_activity is updated
        Args:
            file_path (str): File path
            client_ip (str): Client IP 
            on_change (Callable): Callback for changes
        """
        if file_path not in self.watchers:
            self.watchers[file_path] = {}
        elif client_ip not in self.watchers[file_path]["clients"]:
            self.watchers[file_path]["count"] += 1
            self.watchers[file_path]["last_activity"] = time.time()
            self.watchers[file_path]["clients"].append(client_ip)
            logger.info(f"Client {client_ip} added to an watched file path: {file_path}")
            return
        else:
            logger.info(f"Client {client_ip} already watching file path: {file_path}")
            self.watchers[file_path]["last_activity"] = time.time()
            return

        file_watcher = FileWatcher(
            file_path=file_path)

        logger.info(f"""New watcher added to the list \n
                     file {file_path} is being watched now""")

        #await file_watcher.initialize_last_modified()
        observer = Observer()
        observer.schedule(file_watcher, os.path.dirname(
            file_path), recursive=False)

        self.watchers[file_path]["observer"] = observer
        self.watchers[file_path]["watcher"] = file_watcher
        self.watchers[file_path]["count"] = 1 
        self.watchers[file_path]["clients"]= [client_ip]
        self.watchers[file_path]["observer"].start()
        self.watchers[file_path]["last_activity"] = time.time()

        logger.info(f"Watcher's list updated: {self.watchers}")

    def stop_watcher(self, file_path: str):
        if file_path not in self.watchers:
            logging.warning("File isn't being watched, nothing to do.")
            return
        self.watchers[file_path]["observer"].stop()
        self.watchers[file_path]["observer"].join()
        del self.watchers[file_path]

    def watcher_status(self, file_path: str):
        """Shows the watcher status. False = off, True = on
        """
        if file_path not in self.watchers:
            return False

        return self.watchers[file_path]["observer"].is_alive()

    async def last_modified(self, file_path: str, client_ip: str):
        """Compares checksum in a file being watched
        Args:
          file_path (str): file path
          checksum: checksum for comparison 
        """
        await self.register_client(file_path, client_ip)

        if self.watchers[file_path]['watcher'].last_modified is None:
            logger.info("Checksum can not be found")
            return None

        return self.watchers[file_path]['watcher'].last_modified