FROM python:3.13-slim

WORKDIR /app/python

COPY python/backend/ ./backend/
COPY contracts/examples/valid/response-*.json /app/contracts/examples/valid/

USER 10001:10001

EXPOSE 3100

CMD ["python", "-B", "-m", "backend"]
