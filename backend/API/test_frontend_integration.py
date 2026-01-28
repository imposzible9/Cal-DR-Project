from fastapi.testclient import TestClient
from news_api import app
import os

# Ensure environment variables are set if needed (though they are hardcoded in news_api.py now)
# os.environ["NEWS_API_KEY"] = "..." 

# Use TestClient as context manager to trigger lifespan events (init_client)
with TestClient(app) as client:

    def test_frontend_news_request():
        print("Simulating Frontend Request for 'stock market'...")
        
        # Frontend sends:
        # URL: /api/news/stock%20market
        # Params: limit=20, language="en", hours=72
        
        response = client.get(
            "/api/news/stock market",
            params={
                "limit": 20,
                "language": "en",
                "hours": 72
            }
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            news_items = data.get("news", [])
            print(f"Total News Items Returned: {len(news_items)}")
            
            if len(news_items) > 0:
                print("\nFirst 3 Articles:")
                for i, item in enumerate(news_items[:3]):
                    print(f"{i+1}. Title: {item.get('title')}")
                    print(f"   Source: {item.get('source')}")
                    print(f"   Published: {item.get('published_at')}")
                    print("-" * 30)
                
                # Verify structure matches what frontend expects
                first = news_items[0]
                required_fields = ["title", "summary", "published_at", "url", "source"]
                missing = [f for f in required_fields if f not in first]
                if not missing:
                    print("\nSUCCESS: Data structure matches frontend expectations.")
                else:
                    print(f"\nWARNING: Missing fields in response: {missing}")
            else:
                print("\nWARNING: No news items returned. Check API key or Query.")
                # Check if it fell back to Google or just returned empty
                if data.get("cached"):
                    print("Note: Response was served from CACHE.")
        else:
            print(f"Error Response: {response.text}")

    if __name__ == "__main__":
        test_frontend_news_request()
