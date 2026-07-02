import json
import os
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import Json, execute_batch


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://saas:saas@localhost:5432/saas_platform",
)

AGENT_ID = os.getenv("AGENT_ID")


def parse_json_output(value):
    if not value:
        return {}

    if isinstance(value, dict):
        return value

    try:
        return json.loads(value)
    except Exception:
        return {}


def is_enabled(value):
    return str(value).lower() in ("true", "enabled", "on")


def calculate_security_alerts(data):
    critical = 0
    warning = 0
    info = 0

    defender = data.get("defender") or {}
    antivirus = data.get("antivirus") or []
    firewall = data.get("firewall") or []
    bitlocker = data.get("bitlocker") or []
    hotfixes = data.get("hotfixes") or []
    local_admins = data.get("local_administrators") or []

    if defender.get("available") is False:
        critical += 1

    if not antivirus:
        critical += 1

    if defender.get("available") is True and defender.get("antivirus_enabled") is False:
        critical += 1

    if defender.get("available") is True and defender.get("real_time_protection_enabled") is False:
        critical += 1

    disabled_firewall = [
        item for item in firewall
        if not is_enabled(item.get("enabled"))
    ]

    if disabled_firewall:
        warning += 1

    for volume in bitlocker:
        mount_point = str(volume.get("mount_point") or "").lower()
        protection_status = str(volume.get("protection_status") or "").lower()

        if mount_point in ("c:", "c:\\") and protection_status not in ("on", "enabled", "true", "1"):
            warning += 1
            break

    if not hotfixes:
        warning += 1

    if local_admins:
        info += 1

    score = 100 - (critical * 30) - (warning * 15)
    score = max(0, min(100, score))

    return score, critical, warning, info


def get_latest_command(conn, command_type):
    params = [command_type]

    sql = """
        SELECT
            id,
            tenant_id,
            agent_id,
            output,
            finished_at,
            created_at
        FROM commands
        WHERE command_type = %s
          AND status = 'success'
          AND output IS NOT NULL
    """

    if AGENT_ID:
        sql += " AND agent_id = %s"
        params.append(AGENT_ID)

    sql += """
        ORDER BY created_at DESC
        LIMIT 1;
    """

    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def sync_software(conn):
    row = get_latest_command(conn, "collect_software_inventory")

    if not row:
        print("Nenhum collect_software_inventory success encontrado.")
        return

    command_id, tenant_id, agent_id, output, finished_at, created_at = row
    data = parse_json_output(output)
    items = data.get("items") or []
    collected_at = finished_at or created_at or datetime.now(timezone.utc)

    records = []

    for item in items:
        name = item.get("name")

        if not name:
            continue

        records.append(
            (
                tenant_id,
                agent_id,
                command_id,
                name,
                item.get("version"),
                item.get("publisher"),
                item.get("install_date"),
                item.get("estimated_size_mb"),
                item.get("install_location"),
                item.get("uninstall_string"),
                item.get("registry_key"),
                item.get("source"),
                item.get("user_sid"),
                collected_at,
            )
        )

    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM agent_software_inventory
            WHERE agent_id = %s;
            """,
            (agent_id,),
        )

        if records:
            execute_batch(
                cur,
                """
                INSERT INTO agent_software_inventory (
                    tenant_id,
                    agent_id,
                    command_id,
                    name,
                    version,
                    publisher,
                    install_date,
                    estimated_size_mb,
                    install_location,
                    uninstall_string,
                    registry_key,
                    source,
                    user_sid,
                    collected_at
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                );
                """,
                records,
                page_size=200,
            )

    print(f"Software sincronizado: {len(records)} item(ns).")


def sync_security(conn):
    row = get_latest_command(conn, "collect_security_inventory")

    if not row:
        print("Nenhum collect_security_inventory success encontrado.")
        return

    command_id, tenant_id, agent_id, output, finished_at, created_at = row
    data = parse_json_output(output)
    collected_at = finished_at or created_at or datetime.now(timezone.utc)

    score, critical, warning, info = calculate_security_alerts(data)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO agent_security_snapshots (
                tenant_id,
                agent_id,
                command_id,
                defender,
                antivirus,
                bitlocker,
                firewall,
                hotfixes,
                update_services,
                local_users,
                local_groups,
                local_administrators,
                usb_devices,
                monitors,
                recent_software,
                security_score,
                critical_alerts,
                warning_alerts,
                info_alerts,
                collected_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            );
            """,
            (
                tenant_id,
                agent_id,
                command_id,
                Json(data.get("defender")),
                Json(data.get("antivirus") or []),
                Json(data.get("bitlocker") or []),
                Json(data.get("firewall") or []),
                Json(data.get("hotfixes") or []),
                Json(data.get("update_services") or []),
                Json(data.get("local_users") or []),
                Json(data.get("local_groups") or []),
                Json(data.get("local_administrators") or []),
                Json(data.get("usb_devices") or []),
                Json(data.get("monitors") or []),
                Json(data.get("recent_software") or []),
                score,
                critical,
                warning,
                info,
                collected_at,
            ),
        )

    print(
        f"Segurança sincronizada: score={score}, critical={critical}, warning={warning}, info={info}."
    )


def main():
    conn = psycopg2.connect(DATABASE_URL)

    try:
        with conn:
            sync_software(conn)
            sync_security(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
