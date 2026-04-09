def create_run_variables(values, proposal=1234, run=1, timestamp=1000):
    return [
        {
            "proposal": proposal,
            "run": run,
            "timestamp": timestamp,
            "name": name,
            "value": value,
        }
        for name, value in values.items()
    ]


def create_run_info(proposal=1234, run=1, start_time=500, added_at=1000):
    return {
        "proposal": proposal,
        "run": run,
        "start_time": start_time,
        "added_at": added_at,
    }
