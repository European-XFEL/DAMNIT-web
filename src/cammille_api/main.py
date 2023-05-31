import pandas as pd
from fastapi import Depends, FastAPI
from sqlalchemy import Connection, Select

from .db import get_conn, get_selection

app = FastAPI()


@app.router.get("/db")
def index(
    selection: Select = Depends(get_selection), conn: Connection = Depends(get_conn)
) -> list[dict]:
    df = pd.read_sql(selection, conn)
    for k, v in df.dtypes.to_dict().items():
        if v == "object":
            try:
                df[k] = df[k].apply(lambda x: str(x))
            except Exception as e:
                print(e)
                df.drop(columns=k, inplace=True)
    df.fillna("None", inplace=True)
    return df.to_dict(orient="records")
