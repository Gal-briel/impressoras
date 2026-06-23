# agent/updater/manager.py
import asyncio
import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Optional

import httpx

from agent.core.config import config
from agent.health.events import report_or_queue_agent_event
from agent.security.auth import SecurityManager


class UpdateManager:
    updates_dir = config.data_dir / "updates"
    state_file = updates_dir / "update_state.json"

    @classmethod
    async def check_for_updates(cls) -> None:
        cls.updates_dir.mkdir(parents=True, exist_ok=True)
        await cls._finalize_previous_update_if_needed()

        while True:
            try:
                if config.update_enabled:
                    await cls._check_once()
            except Exception as exc:
                report_or_queue_agent_event(
                    event_type="agent_update_check_failed",
                    message=f"Failed to check agent update: {str(exc)}",
                    severity="warning",
                )
            await asyncio.sleep(config.update_check_interval_seconds)

    @classmethod
    async def _check_once(cls) -> None:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{config.api_url}/agents/version",
                params={"current_version": config.version, "channel": config.update_channel},
                headers=SecurityManager.get_auth_headers(),
            )
            response.raise_for_status()
            manifest = response.json()

        if not manifest.get("update_available"):
            return

        latest_version = manifest["latest_version"]
        report_or_queue_agent_event(
            "agent_update_available",
            f"Agent update available: {config.version} -> {latest_version}",
            "info",
        )

        package_url = manifest.get("package_url")
        package_sha256 = manifest.get("package_sha256")
        signature_thumbprint = manifest.get("signature_thumbprint")
        rollback_package_url = manifest.get("rollback_package_url")
        rollback_package_sha256 = manifest.get("rollback_package_sha256")

        if not package_url or not package_sha256 or not signature_thumbprint:
            raise ValueError("Invalid update manifest. Package URL, SHA-256 and signature are required.")
        if not rollback_package_url or not rollback_package_sha256:
            raise ValueError("Invalid update manifest. Rollback package is required.")

        package_path = cls.updates_dir / f"SaaSAgent-{latest_version}{cls._guess_extension(package_url)}"
        rollback_path = cls.updates_dir / f"SaaSAgent-rollback-{config.version}{cls._guess_extension(rollback_package_url)}"

        await cls._download_file(package_url, package_path)
        cls._verify_sha256(package_path, package_sha256)
        cls._verify_authenticode_signature(package_path, signature_thumbprint)

        await cls._download_file(rollback_package_url, rollback_path)
        cls._verify_sha256(rollback_path, rollback_package_sha256)
        cls._verify_authenticode_signature(rollback_path, signature_thumbprint)

        plan = {
            "service_name": config.update_service_name,
            "current_version": config.version,
            "target_version": latest_version,
            "package_path": str(package_path),
            "rollback_package_path": str(rollback_path),
            "health_timeout_seconds": config.update_health_timeout_seconds,
            "api_url": config.api_url,
        }

        cls._write_state({"status": "installing", "current_version": config.version, "target_version": latest_version})
        plan_path = cls.updates_dir / "update_plan.json"
        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump(plan, f, indent=2)

        report_or_queue_agent_event(
            "agent_update_install_scheduled",
            f"Agent update scheduled: {config.version} -> {latest_version}",
            "info",
        )
        cls._launch_runner(plan_path)

    @classmethod
    async def _download_file(cls, url: str, target_path: Path) -> None:
        temp_path = target_path.with_suffix(target_path.suffix + ".download")
        report_or_queue_agent_event("agent_update_download_started", f"Downloading update package: {url}", "info")
        async with httpx.AsyncClient(timeout=config.update_download_timeout_seconds) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                with open(temp_path, "wb") as f:
                    async for chunk in response.aiter_bytes():
                        f.write(chunk)
        temp_path.replace(target_path)

    @staticmethod
    def _verify_sha256(file_path: Path, expected_hash: str) -> None:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                sha256.update(chunk)
        actual_hash = sha256.hexdigest().lower()
        expected = expected_hash.lower()
        if actual_hash != expected:
            raise ValueError(f"SHA-256 mismatch for {file_path.name}. Expected={expected}, actual={actual_hash}")

    @staticmethod
    def _verify_authenticode_signature(file_path: Path, expected_thumbprint: str) -> None:
        expected = expected_thumbprint.replace(" ", "").upper()
        powershell = [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            (
                "$sig = Get-AuthenticodeSignature -FilePath "
                f"'{str(file_path)}'; "
                "if ($sig.Status -ne 'Valid') { exit 10 }; "
                "$thumb = $sig.SignerCertificate.Thumbprint.ToUpper(); "
                f"if ($thumb -ne '{expected}') {{ exit 11 }}; "
                "exit 0"
            ),
        ]
        result = subprocess.run(powershell, capture_output=True, text=True)
        if result.returncode != 0:
            raise ValueError(f"Invalid package signature for {file_path.name}. Return code={result.returncode}")

    @classmethod
    def _launch_runner(cls, plan_path: Path) -> None:
        runner_path = Path(__file__).with_name("runner.py")
        creation_flags = 0
        if os.name == "nt":
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        subprocess.Popen(
            ["python", str(runner_path), str(plan_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            creationflags=creation_flags,
        )

    @classmethod
    async def _finalize_previous_update_if_needed(cls) -> None:
        state = cls._read_state()
        if not state or state.get("status") != "installing":
            return
        target_version = state.get("target_version")
        if target_version == config.version:
            cls._write_state({"status": "succeeded", "current_version": config.version, "target_version": target_version})
            report_or_queue_agent_event(
                "agent_update_succeeded",
                f"Agent update completed successfully. Current version={config.version}",
                "info",
            )

    @classmethod
    def _read_state(cls) -> Optional[dict]:
        if not cls.state_file.exists():
            return None
        try:
            with open(cls.state_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    @classmethod
    def _write_state(cls, state: dict) -> None:
        cls.updates_dir.mkdir(parents=True, exist_ok=True)
        with open(cls.state_file, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)

    @staticmethod
    def _guess_extension(url: str) -> str:
        return ".exe" if url.lower().endswith(".exe") else ".msi"
