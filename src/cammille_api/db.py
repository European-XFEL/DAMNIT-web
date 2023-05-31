from fastapi import Depends
from sqlalchemy import (
    Engine,
    MetaData,
    Select,
    Table,
    create_engine,
    select,
)


def get_engine(
    db="/gpfs/exfel/exp/SCS/202301/p003360/usr/Shared/amore/runs.sqlite",
) -> Engine:
    engine = create_engine(f"sqlite:///{db}")
    return engine


def get_conn(engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        yield conn


def get_base_selection(
    engine: Engine = Depends(get_engine), table_name: str = "runs"
) -> Select:
    return select(Table(table_name, MetaData(), autoload_with=engine))


def get_selection(
    selection: Select = Depends(get_base_selection),
    run_number: int | None = None,
    page_size: int = 100,
    offset: int = 0,
):
    if run_number:
        selection = selection.filter_by(runnr=run_number)

    return selection.offset(offset).limit(page_size)
