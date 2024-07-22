from contextlib import asynccontextmanager
import fastapi
from starlette.middleware.sessions import SessionMiddleware
from pathlib import Path

import pandas as pd
from fastapi import Depends, FastAPI
from sqlalchemy import Connection, Select


from .const import DEFAULT_PROPOSAL, FILL_VALUE, Type
from .db import (
    get_column_datum, get_column_names, get_conn, get_damnit_path,
    get_selection)
from .utils import convert, get_run_data, map_dtype
from .graphql import add_graphql_router
from . import auth
from .settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    auth.configure()
    # add_graphql_router(app, dependencies=[Depends(auth.check_auth)])
    app.router.include_router(db_router)
    app.router.include_router(auth.router)
    yield

app = FastAPI(
    lifespan=lifespan,
    swagger_ui_init_oauth = {
        "usePkceWithAuthorizationCodeGrant": True,
        "clientId": settings.auth.client_id,
    }
)

def get_column_schema(
    column_names: list = Depends(get_column_names),
    column_data = Depends(get_column_datum),
    conn: Connection = Depends(get_conn)) -> dict:
    """
    Returns a dictionary of the column names of the specified table and their data type.

    Parameters:
    - `column_names`: A list of the column names for the specified table name and engine.
    - `column_datum`: A function that generates a SQLAlchemy select statement
       that fetches one non-null value from the specified column
    - `conn`: A SQLAlchemy connection instance for the specified engine.

    Returns:
    - A dictionary of the column names of the specified table and their data type.
    """
    def get_dtype(column, default='string'):
        series =  pd.read_sql(column_data(column), conn)[column]
        return (map_dtype(type(series[0]), default).value
                if not series.empty else default)

    schema = {column: {'id': column, 'dtype': get_dtype(column)}
              for column in column_names}

    # REMOVEME: Get dtype from hardcoded column names
    known_dtypes = {
        'start_time': Type.TIMESTAMP,
        'added_at': Type.TIMESTAMP,
        'hrixs_spectrum': Type.ARRAY,
    }
    for name, dtype in known_dtypes.items():
        schema[name]['dtype'] = dtype

    return schema


def get_extracted_path(
        proposal_number: str = DEFAULT_PROPOSAL,
        damnit_path: str = Depends(get_damnit_path),
        ) -> str:
    """Returns a function that generates the extracted data path"""
    def inner(run_number):
        return str(Path(damnit_path) / "extracted_data"
                   / f"p{proposal_number}_r{run_number}.h5")
    return inner


db_router = fastapi.APIRouter(
    prefix="/db"  #, dependencies=[fastapi.Depends(auth.check_auth)]
)


@db_router.get("/db")
def index(
    selection: Select = Depends(get_selection),
    schema: dict = Depends(get_column_schema),
    extracted_path = Depends(get_extracted_path),
    conn: Connection = Depends(get_conn),
) -> dict:
    """
    Returns a list of dictionaries representing the rows in the specified database table.

    Parameters:
    - `selection`: A SQLAlchemy select statement with optional filters and pagination.
    - `schema`: A dictionary of the column names of the specified table and their data type
    - `conn`: A SQLAlchemy connection instance for the specified engine.

    Returns:
    - A list of dictionaries representing the rows in the specified database table.
    """
    # Read the selected data from the database into a pandas DataFrame
    df = pd.read_sql(selection, conn)

    # Convert columns according to some rules
    for k, v in df.dtypes.to_dict().items():
        dtype = Type(schema[k]['dtype'])
        # Attempt to convert any columns with dtype 'object' according to schema
        if v == "object":
            df[k] = df[k].apply(lambda x: convert(x, dtype))
        # Fetch the extracted array from the run file
        elif dtype == Type.ARRAY:
            df[k] = df.apply(lambda row:
                             get_run_data(extracted_path(row.runnr), k).tolist(),
                             axis=1)
        elif dtype == Type.TIMESTAMP:
            # Convert from UNIX to EPOCH timestamp
            df[k] = df[k].apply(lambda t: t * 1000)

    # Fill any NaN values in the DataFrame with the string 'None'
    df.fillna(FILL_VALUE, inplace=True)

    # Convert the DataFrame to a dictionary with run number as key
    return df.set_index("runnr", drop=False).to_dict(orient="index")


@db_router.get("/db/schema")
def db_schema(schema: dict = Depends(get_column_schema)) -> dict:
    return schema


app.add_middleware(
    SessionMiddleware, secret_key=settings.session_secret.get_secret_value()
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("damnit_api.main:app", reload=True)
