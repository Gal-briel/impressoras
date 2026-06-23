# agent/updater/runner.py
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional


def run(command: list[str], timeout: Optional[int] = None) -> subprocess.CompletedProcess:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def stop_service(service_name: str) -> None:
    run(["sc.exe", "stop", service_name], timeout=60)
    time.sleep(5)


def start_service(service_name: str) -> None:
    run(["sc.exe", "start", service_name], timeout=60)


def is_service_running(service_name: str) -> bool:
    result = run(["sc.exe", "query", service_name], timeout=30)
    return "RUNNING" in result.stdout.upper()


def wait_for_service_running(service_name: str, timeout_seconds: int) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if is_service_running(service_name):
            return True
        time.sleep(5)
    return False


def install_package(package_path: str) -> int:
    path = Path(package_path)
    suffix = path.suffix.lower()
    if suffix == ".msi":
        command = ["msiexec.exe", "/i", str(path), "/qn", "/norestart"]
    elif suffix == ".exe":
        command = [str(path), "/quiet", "/norestart"]
    else:
        raise ValueError(f"Unsupported package extension: {suffix}")
    return run(command, timeout=900).returncode


def write_runner_state(plan_path: Path, status: str, error: Optional[str] = None) -> None:
    state_path = plan_path.with_name("runner_state.json")
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump({"status": status, "error": error, "updated_at": time.time()}, f, indent=2)


def main() -> int:
    if len(sys.argv) < 2:
        return 2

    plan_path = Path(sys.argv[1])
    with open(plan_path, "r", encoding="utf-8") as f:
        plan = json.load(f)

    service_name = plan["service_name"]
    package_path = plan["package_path"]
    rollback_package_path = plan["rollback_package_path"]
    health_timeout_seconds = int(plan.get("health_timeout_seconds", 90))

    try:
        write_runner_state(plan_path, "installing")
        stop_service(service_name)
        install_rc = install_package(package_path)

        if install_rc != 0:
            write_runner_state(plan_path, "install_failed", f"Installer return code={install_rc}")
            rollback_rc = install_package(rollback_package_path)
            start_service(service_name)
            if rollback_rc == 0:
                write_runner_state(plan_path, "rollback_succeeded")
                return 10
            write_runner_state(plan_path, "rollback_failed", f"Rollback return code={rollback_rc}")
            return 11

        start_service(service_name)
        if wait_for_service_running(service_name, health_timeout_seconds):
            write_runner_state(plan_path, "service_started")
            return 0

        write_runner_state(plan_path, "health_check_failed")
        stop_service(service_name)
        rollback_rc = install_package(rollback_package_path)
        start_service(service_name)

        if rollback_rc == 0:
            write_runner_state(plan_path, "rollback_succeeded_after_health_failure")
            return 20

        write_runner_state(plan_path, "rollback_failed_after_health_failure")
        return 21

    except Exception as exc:
        write_runner_state(plan_path, "runner_error", str(exc))
        try:
            install_package(rollback_package_path)
            start_service(service_name)
        except Exception:
            pass
        return 99


if __name__ == "__main__":
    raise SystemExit(main())
