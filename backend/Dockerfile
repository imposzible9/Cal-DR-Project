FROM python:3.14-slim

WORKDIR /app/backend/API
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY API /app/backend/API

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]