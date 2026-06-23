# agent/storage/local_queue.py
import json
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from agent.core.config import config


class LocalQueue:
    def __init__(self):
        config.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = config.data_dir / "offline_queue.db"
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        return conn

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS outbox_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS pending_commands (
                    command_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'PENDING',
                    result_payload TEXT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_outbox_messages_created
                ON outbox_messages (created_at)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_pending_commands_status
                ON pending_commands (status)
                """
            )

    def push(self, topic: str, payload: Dict[str, Any]) -> int:
        now = self._now()
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO outbox_messages (topic, payload, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (topic, json.dumps(payload, default=str), now, now),
            )
            return int(cursor.lastrowid)

    def peek_batch(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, topic, payload, attempts
                FROM outbox_messages
                ORDER BY id ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "topic": row["topic"],
                "payload": json.loads(row["payload"]),
                "attempts": row["attempts"],
            }
            for row in rows
        ]

    def ack_message(self, message_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM outbox_messages WHERE id = ?", (message_id,))

    def mark_message_error(self, message_id: int, error: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE outbox_messages
                SET attempts = attempts + 1,
                    last_error = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (error[:1000], self._now(), message_id),
            )

    def upsert_pending_command(self, command_id: str, payload: Dict[str, Any]) -> None:
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO pending_commands (command_id, payload, status, created_at, updated_at)
                VALUES (?, ?, 'PENDING', ?, ?)
                ON CONFLICT(command_id) DO NOTHING
                """,
                (command_id, json.dumps(payload, default=str), now, now),
            )

    def get_pending_command(self, command_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT command_id, payload, status, result_payload
                FROM pending_commands
                WHERE command_id = ?
                """,
                (command_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "command_id": row["command_id"],
            "payload": json.loads(row["payload"]),
            "status": row["status"],
            "result_payload": json.loads(row["result_payload"]) if row["result_payload"] else None,
        }

    def list_pending_commands(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT command_id, payload, status, result_payload
                FROM pending_commands
                WHERE status IN ('PENDING', 'EXECUTING', 'FINISHED')
                ORDER BY created_at ASC
                """
            ).fetchall()
        return [
            {
                "command_id": row["command_id"],
                "payload": json.loads(row["payload"]),
                "status": row["status"],
                "result_payload": json.loads(row["result_payload"]) if row["result_payload"] else None,
            }
            for row in rows
        ]

    def mark_command_started(self, command_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE pending_commands
                SET status = 'EXECUTING', attempts = attempts + 1, updated_at = ?
                WHERE command_id = ?
                """,
                (self._now(), command_id),
            )

    def mark_command_finished(self, command_id: str, result_payload: Dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE pending_commands
                SET status = 'FINISHED', result_payload = ?, updated_at = ?
                WHERE command_id = ?
                """,
                (json.dumps(result_payload, default=str), self._now(), command_id),
            )

    def mark_command_error(self, command_id: str, error: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE pending_commands
                SET last_error = ?, updated_at = ?
                WHERE command_id = ?
                """,
                (error[:1000], self._now(), command_id),
            )

    def complete_command(self, command_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM pending_commands WHERE command_id = ?", (command_id,))


local_queue = LocalQueue()
