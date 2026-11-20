FROM python:3.13-slim

WORKDIR /app/python

COPY python/requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY python/backend/ ./backend/
COPY contracts/examples/valid/response-*.json /app/contracts/examples/valid/
COPY contracts/schemas/*.schema.json /app/contracts/schemas/

USER 10001:10001

EXPOSE 3100

CMD ["python", "-B", "-m", "backend"]
