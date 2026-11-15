"""D-M01: the Kafka consumer's fetch replies must fit what kafka-python accepts."""

from unittest.mock import patch

from damnit_api.consumer import kafka as kafka_consumer


def test_every_fetch_reply_fits_the_clients_receive_limit():
    limits = kafka_consumer.FETCH_LIMITS
    assert limits["max_partition_fetch_bytes"] <= limits["fetch_max_bytes"]
    assert limits["fetch_max_bytes"] < limits["receive_message_max_bytes"]


def test_the_consumer_is_built_with_the_limits():
    with patch("kafka.KafkaConsumer") as built:
        kafka_consumer._build_kafka_consumer("127.0.0.1:9092", ["t"], "group")
    kwargs = built.call_args.kwargs
    for key, value in kafka_consumer.FETCH_LIMITS.items():
        assert kwargs[key] == value
    assert kwargs["enable_auto_commit"] is False
