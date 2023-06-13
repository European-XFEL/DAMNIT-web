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
    db="/gpfs/exfel/exp/SCS/202202/p002956/usr/Shared/amore/runs.sqlite",
) -> Engine:
    """
    Returns a SQLAlchemy engine instance for the specified database file.
    """
    engine = create_engine(f"sqlite:///{db}")
    return engine


def get_conn(engine: Engine = Depends(get_engine)):
    """
    Returns a SQLAlchemy connection instance for the specified engine.
    """
    with engine.connect() as conn:
        yield conn


def get_base_selection(
    engine: Engine = Depends(get_engine), table_name: str = "runs"
) -> Select:
    """
    Returns a base SQLAlchemy select statement for the specified table name and engine.
    """
    return select(Table(table_name, MetaData(), autoload_with=engine))


def get_selection(
    selection: Select = Depends(get_base_selection),
    run_number: int = None,
    page_size: int = 100,
    offset: int = 0,
):
    """
    Returns a SQLAlchemy select statement with optional filters and pagination.
    """
    if run_number:
        selection = selection.filter_by(runnr=run_number)

    return selection.offset(offset).limit(page_size)
