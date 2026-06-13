"""Verify PLANET Watchdog events from Kafka, ASAPO/local broker, and MongoDB.

This is a transition helper for local HZDR integration testing. It prefers the
transport-shaped Kafka path, can check the ASAPO local broker, and falls back to
MongoDB when live transports are not available.
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import requests


@dataclass
class VerifyResult:
    backend: str
    events: list[dict[str, Any]]
    detail: str


def parse_json_object(value: str) -> dict[str, Any]:
    """Parse a CLI JSON object."""
    if not value:
        return {}
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        msg = f"Expected a JSON object, got: {parsed}"
        raise argparse.ArgumentTypeError(msg)
    return parsed


def tcp_reachable(host: str, port: int, timeout: float) -> bool:
    """Return whether a TCP endpoint accepts connections."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def verify_kafka(args) -> VerifyResult:
    """Try to read Watchdog events from Kafka."""
    host, _, port_text = args.kafka_bootstrap.partition(":")
    port = int(port_text or "9092")
    if not tcp_reachable(host or "127.0.0.1", port, args.timeout):
        msg = f"Kafka broker is not reachable at {args.kafka_bootstrap}"
        raise RuntimeError(msg)

    from kafka import KafkaConsumer

    consumer = KafkaConsumer(
        args.kafka_topic,
        bootstrap_servers=args.kafka_bootstrap,
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        consumer_timeout_ms=int(args.timeout * 1000),
        value_deserializer=decode_event,
    )
    try:
        events = [
            message.value for message in consumer if event_matches(message.value, args)
        ][: args.limit]
    finally:
        consumer.close()

    if not events:
        msg = f"No matching Kafka events found on {args.kafka_topic}"
        raise RuntimeError(msg)
    return VerifyResult(
        backend="kafka",
        events=events,
        detail=f"Read {len(events)} event(s) from Kafka topic {args.kafka_topic}",
    )


def verify_asapo(args) -> VerifyResult:
    """Read Watchdog events from the ASAPO local broker status API."""
    endpoint = args.asapo_broker.rstrip("/")
    response = requests.get(f"{endpoint}/api/status", timeout=args.timeout)
    response.raise_for_status()
    status = response.json()
    recent_messages = status.get("recent_messages", [])
    if not isinstance(recent_messages, list):
        msg = f"ASAPO local broker returned invalid recent_messages: {recent_messages}"
        raise RuntimeError(msg)
    events = [
        message
        for message in recent_messages[-args.limit :]
        if isinstance(message, dict) and event_matches(message, args)
    ]
    if not events:
        msg = f"No matching ASAPO/local-broker events found at {endpoint}"
        raise RuntimeError(msg)
    message_count = status.get("message_count", "?")
    return VerifyResult(
        backend="asapo",
        ok=True,
        events=events,
        detail=(
            f"Read {len(events)} recent event(s) from ASAPO/local broker "
            f"{endpoint}; broker has {message_count} total message(s)"
        ),
    )


def verify_mongo(args) -> VerifyResult:
    """Read Watchdog events from MongoDB."""
    from pymongo import MongoClient

    query = dict(args.mongo_query)
    if args.shot_number is not None:
        query.setdefault(args.mongo_shot_field, args.shot_number)
    if args.experiment_id:
        query.setdefault("experiment_id", args.experiment_id)

    client = MongoClient(
        args.mongo_uri, serverSelectionTimeoutMS=int(args.timeout * 1000)
    )
    try:
        collection = client[args.mongo_database][args.mongo_collection]
        records = list(
            collection.find(query, projection={"_id": False}).limit(args.limit)
        )
    finally:
        client.close()

    if not records:
        msg = "No matching MongoDB Watchdog records found"
        raise RuntimeError(msg)
    return VerifyResult(
        backend="mongo",
        events=[json_safe(record) for record in records],
        detail=(
            f"Read {len(records)} record(s) from MongoDB "
            f"{args.mongo_database}.{args.mongo_collection}"
        ),
    )


def decode_event(value) -> dict[str, Any]:
    """Decode a Kafka message value into a dict."""
    if isinstance(value, dict):
        return value
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        msg = f"Kafka message value is not a JSON object: {parsed}"
        raise ValueError(msg)
    return parsed


def event_matches(event: dict[str, Any], args) -> bool:
    """Check optional experiment/shot filters."""
    if args.experiment_id and str(event.get("experiment_id")) != args.experiment_id:
        return False
    if args.shot_number is None:
        return True
    values = {
        event.get("shot_number"),
        event.get("shot"),
        event.get("shotNumber"),
    }
    shot_id = event.get("shot_id")
    if shot_id is not None:
        digits = "".join(character for character in str(shot_id) if character.isdigit())
        if digits:
            values.add(int(digits))
    return args.shot_number in {int(value) for value in values if value is not None}


def json_safe(value):
    """Convert common Mongo values into JSON-safe values."""
    if isinstance(value, dict):
        return {key: json_safe(nested) for key, nested in value.items()}
    if isinstance(value, list):
        return [json_safe(nested) for nested in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("../scripts/hzdr-launch.config.json"),
        help="Shared HZDR launcher/connection config JSON.",
    )
    parser.add_argument(
        "--mode",
        choices=["auto", "all", "kafka", "asapo", "mongo"],
        default="auto",
        help=(
            "auto tries Kafka, then ASAPO/local broker, then MongoDB; all checks "
            "every backend and fails if any backend is unavailable"
        ),
    )
    parser.add_argument("--kafka-bootstrap", default="127.0.0.1:9092")
    parser.add_argument("--kafka-topic", default="planet.watchdog.events")
    parser.add_argument("--kafka-group", default="damnit-web-hzdr-verifier")
    parser.add_argument("--asapo-broker", default="http://127.0.0.1:8765")
    parser.add_argument(
        "--mongo-uri",
        default="mongodb://root:mypasswd@localhost:27018/?authSource=admin",
    )
    parser.add_argument("--mongo-database", default="shotsheet")
    parser.add_argument("--mongo-collection", default="shots")
    parser.add_argument("--mongo-query", type=parse_json_object, default={})
    parser.add_argument("--mongo-shot-field", default="shot_number")
    parser.add_argument("--experiment-id", default="")
    parser.add_argument("--shot-number", type=int)
    parser.add_argument("--timeout", type=float, default=3.0)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    apply_config(args)
    return args


def apply_config(args) -> None:
    """Apply shared connection config defaults when the file exists."""
    if not args.config.exists():
        return
    payload = json.loads(args.config.read_text(encoding="utf-8"))
    connections = payload.get("connections", {})
    kafka = connections.get("kafka", {})
    asapo = connections.get("asapo", {})
    mongo = connections.get("mongo", {})

    args.kafka_bootstrap = kafka.get("bootstrap", args.kafka_bootstrap)
    args.kafka_topic = kafka.get("topic", args.kafka_topic)
    args.asapo_broker = asapo.get("broker", args.asapo_broker)
    args.mongo_uri = mongo.get("uri", args.mongo_uri)
    args.mongo_database = mongo.get("database", args.mongo_database)
    args.mongo_collection = mongo.get("collection", args.mongo_collection)
    args.mongo_shot_field = mongo.get("shotField", args.mongo_shot_field)


def main() -> None:
    """Run the verifier."""
    args = parse_args()
    checks = {
        "kafka": verify_kafka,
        "asapo": verify_asapo,
        "mongo": verify_mongo,
    }

    if args.mode == "all":
        results = []
        errors = {}
        for name, check in checks.items():
            try:
                results.append(check(args))
            except Exception as exc:
                errors[name] = str(exc)
        if errors:
            msg = f"Some backends failed verification: {errors}"
            raise RuntimeError(msg)
        emit_results(args, results)
        return

    if args.mode in checks:
        emit_results(args, [checks[args.mode](args)])
        return

    errors = {}
    for name in ("kafka", "asapo", "mongo"):
        try:
            emit_results(args, [checks[name](args)])
            return
        except Exception as exc:
            errors[name] = str(exc)
    msg = f"No Watchdog backend verified: {errors}"
    raise RuntimeError(msg)


def emit_results(args, results: list[VerifyResult]) -> None:
    """Print verifier results."""
    events = [
        {
            "backend": result.backend,
            "detail": result.detail,
            "event_count": len(result.events),
            "events": result.events,
        }
        for result in results
    ]

    payload = {
        "ok": True,
        "backends": events,
    }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        for result in results:
            print(f"Verified PLANET Watchdog via {result.backend}")
            print(result.detail)
            for event in result.events:
                shot = event.get(
                    "shot_number", event.get("shot", event.get("shot_id", "?"))
                )
                print(f"  shot={shot} keys={sorted(event.keys())}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Verification failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
