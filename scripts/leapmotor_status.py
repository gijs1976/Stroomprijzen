import json
import os
import sys
from datetime import datetime, timezone

from leapmotor_api import LeapmotorApiClient


def main():
    username = os.environ.get("LEAPMOTOR_USERNAME")
    password = os.environ.get("LEAPMOTOR_PASSWORD")
    if not username or not password:
        print("LEAPMOTOR_USERNAME of LEAPMOTOR_PASSWORD niet ingesteld; overslaan")
        return 0

    client = LeapmotorApiClient(
        username=username,
        password=password,
        app_cert_path="certs/app_cert.pem",
        app_key_path="certs/app_key.pem",
    )
    try:
        client.login()
        vehicles = client.get_vehicle_list()
        if not vehicles:
            print("Geen voertuigen gevonden in dit account")
            return 1
        vehicle = vehicles[0]
        status = client.get_vehicle_status(vehicle)
        battery = getattr(status, "battery", None)
        model = getattr(vehicle, "car_type", None) or "Leapmotor"
        vin = getattr(vehicle, "vin", None) or ""
        payload = {
            "vehicle": model + (f" \u00b7\u00b7\u00b7\u00b7{vin[-4:]}" if vin else ""),
            "soc": getattr(battery, "soc", None),
            "rangeKm": getattr(battery, "expected_mileage", None),
            "charging": bool(getattr(status, "is_charging", False)),
            "plugged": bool(getattr(status, "is_plugged", False)),
            "powerKw": getattr(battery, "charging_power_kw", None),
            "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    finally:
        client.close()

    with open("leap-status.json", "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    print(f"Status opgeslagen: SOC {payload['soc']}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
