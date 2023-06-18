from pathlib import Path

import pandas as pd
from fastapi import Depends, FastAPI
from sqlalchemy import Connection, Select

from .const import FILL_VALUE, Type
from .db import (
    get_column_datum, get_column_names, get_conn, get_damnit_path,
    get_selection)
from .utils import convert, get_run_data, map_dtype

app = FastAPI()


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
    
    schema = {column: get_dtype(column) for column in column_names}
    # return schema

    # REMOVEME: Get array from hardcoded column names
    arrays = ['hrixs_spectrum']
    return {**schema, **{col: Type.ARRAY for col in arrays}}


def get_extracted_path(
        proposal_number: str,
        damnit_path: str = Depends(get_damnit_path),
        ) -> str:
    """Returns a function that generates the extracted data path"""
    def inner(run_number):
        return str(Path(damnit_path) / "extracted_data"
                   / f"p{proposal_number}_r{run_number}.h5")
    return inner


@app.router.get("/db")
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
        dtype = Type(schema[k])
        # Attempt to convert any columns with dtype 'object' according to schema
        if v == "object":
            df[k] = df[k].apply(lambda x: convert(x, dtype))
        # Fetch the extracted array from the run file
        elif dtype == Type.ARRAY:
            df[k] = df.apply(lambda row:
                             get_run_data(extracted_path(row.runnr), k).tolist(),
                             axis=1)

    # Fill any NaN values in the DataFrame with the string 'None'
    df.fillna(FILL_VALUE, inplace=True)

    # Convert the DataFrame to a dictionary with run number as key
    return df.set_index("runnr", drop=False).to_dict(orient="index")


@app.router.get("/db/schema")
def db_schema(schema: dict = Depends(get_column_schema)) -> dict:
    return schema
