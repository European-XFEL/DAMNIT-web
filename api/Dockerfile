FROM python:3.11

WORKDIR /app
RUN python3 -m pip install --upgrade poetry pip
COPY . .
RUN poetry config virtualenvs.create false --local
RUN poetry install
CMD ["uvicorn", "damnit_api.main:app"]
