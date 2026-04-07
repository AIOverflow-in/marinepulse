FROM python:3.11-slim

WORKDIR /app

# pymupdf pre-built wheels work on slim, no extra system deps needed
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
