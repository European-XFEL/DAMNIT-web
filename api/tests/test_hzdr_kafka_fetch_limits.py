"""D-M01: the Kafka consumer's fetch replies must fit what kafka-python accepts."""

from unittest.mock import patch

from damnit_api.consumer import kafka as kafka_consumer


def test_every_fetch_reply_fits_the_clients_receive_limit():
    limits = kafka_consumer.FETCH_LIMITS
    assert limits["max_partition_fetch_bytes"] <= limits["fetch_max_bytes"]
    assert limits["fetch_max_bytes"] < limits["receive_message_max_bytes"]


def test_the_consumer_is_built_with_the_limits_it_knows():
    with patch("kafka.KafkaConsumer") as built:
        built.DEFAULT_CONFIG = dict.fromkeys(kafka_consumer.FETCH_LIMITS)
        kafka_consumer._build_kafka_consumer("127.0.0.1:9092", ["t"], "group")
    kwargs = built.call_args.kwargs
    for key, value in kafka_consumer.FETCH_LIMITS.items():
        assert kwargs[key] == value
    assert kwargs["enable_auto_commit"] is False


def test_a_limit_the_client_does_not_know_is_left_out():
    known = {"max_partition_fetch_bytes": 0, "fetch_max_bytes": 0}
    assert set(kafka_consumer.supported_fetch_limits(known)) == set(known)


def test_the_installed_client_accepts_the_consumer_settings():
    """The real client, not a mock: an unknown setting stopped the API's start."""
    from kafka import KafkaConsumer

    limits = kafka_consumer.supported_fetch_limits(KafkaConsumer.DEFAULT_CONFIG)
    unknown = set(limits) - set(KafkaConsumer.DEFAULT_CONFIG)
    assert not unknown
    assert limits["max_partition_fetch_bytes"] <= limits["fetch_max_bytes"]
