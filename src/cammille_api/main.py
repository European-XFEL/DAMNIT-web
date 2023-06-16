import pandas as pd
from fastapi import Depends, FastAPI
from sqlalchemy import Connection, Select

from .db import get_column_datum, get_column_names, get_conn, get_selection
from .utils import map_dtype

app = FastAPI()


@app.router.get("/db")
def index(
    selection: Select = Depends(get_selection), conn: Connection = Depends(get_conn)
) -> dict:
    """
    Returns a list of dictionaries representing the rows in the specified database table.

    Parameters:
    - `selection`: A SQLAlchemy select statement with optional filters and pagination.
    - `conn`: A SQLAlchemy connection instance for the specified engine.

    Returns:
    - A list of dictionaries representing the rows in the specified database table.
    """
    # Read the selected data from the database into a pandas DataFrame
    df = pd.read_sql(selection, conn)

    # Attempt to convert any columns with dtype 'object' to string type
    for k, v in df.dtypes.to_dict().items():
        if v == "object":
            try:
                df[k] = df[k].apply(lambda x: str(x))
            except Exception as e:
                # If an error occurs, drop the column from the DataFrame
                print(e)
                df.drop(columns=k, inplace=True)

    # Fill any NaN values in the DataFrame with the string 'None'
    df.fillna("None", inplace=True)

    # Convert the DataFrame to a dictionary with run number as key
    return df.set_index("runnr", drop=False).to_dict(orient="index")


@app.router.get("/db/schema")
def db_schema(
    column_names: list = Depends(get_column_names),
    column_datum = Depends(get_column_datum),
    conn: Connection = Depends(get_conn)
) -> dict:
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
        series =  pd.read_sql(column_datum(column), conn)[column]
        return (map_dtype(type(series[0]), default)
                if not series.empty else default)
    
    return {column: get_dtype(column) for column in column_names}
