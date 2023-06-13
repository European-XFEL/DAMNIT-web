import pandas as pd
from fastapi import Depends, FastAPI
from sqlalchemy import Connection, Select

from .db import get_conn, get_selection

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
