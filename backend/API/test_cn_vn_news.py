
import requests
import urllib.parse
import json

base_url = "http://localhost:8000/news/api/news"
query = "中国股市 OR A股 OR 上證指數 OR 深證成指 OR 滬深300 OR 貴州茅台 OR 騰訊控股 OR 阿里巴巴 OR 工商銀行"
params = {
    "limit": 10,
    "language": "zh",
    "country": "cn",
    "trusted_only": "true"
}

print(f"Testing China News with query: {query}")
encoded_query = urllib.parse.quote(query)
params = {"country": "cn", "limit": 10, "trusted_only": False}
response = requests.get(f"{base_url}/{encoded_query}", params=params)
print(f"Status Code: {response.status_code}")
news = response.json().get('news', [])
print(f"Total News (trusted_only=False): {len(news)}")
for item in news:
    print(f"- [{item.get('source')}] {item.get('title')}")

print("-" * 50)
print(f"Testing China News (trusted_only=True)...")
params["trusted_only"] = True
response = requests.get(f"{base_url}/{encoded_query}", params=params)
news_trusted = response.json().get('news', [])
print(f"Total News (trusted_only=True): {len(news_trusted)}")

print("-" * 50)

# Test Vietnam as well
query_vn = "Thị trường chứng khoán Việt Nam OR VN-Index OR HNX-Index OR VN30 OR Vingroup OR Vietcombank OR Hoa Phat Group OR Masan Group"
params_vn = {
    "limit": 10,
    "language": "vi",
    "country": "vn",
    "trusted_only": "true"
}
encoded_query_vn = urllib.parse.quote(query_vn)

print(f"Testing Vietnam News with query: {query_vn}")
try:
    response = requests.get(f"{base_url}/{encoded_query_vn}", params=params_vn)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Total News: {data.get('total', 0)}")
        for item in data.get('news', [])[:5]:
            print(f"- [{item.get('source')}] {item.get('title')}")
    else:
        print(response.text)
except Exception as e:
    print(f"Error: {e}")
    
print("-" * 50)

# Test Global News
print("Testing Global News (which aggregates all markets)...")
global_url = "http://localhost:8000/news/api/global-news"
try:
    response = requests.get(global_url, params={"limit": 10, "trusted_only": "true"})
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        news = data.get('news', [])
        print(f"Total Global News: {len(news)}")
        
        # Check for China news in global results
        cn_items = [item for item in news if "中国" in (item.get('title') or "") or "A股" in (item.get('title') or "")]
        print(f"China items found in Global News: {len(cn_items)}")
        
        # Check for Vietnam news in global results
        vn_items = [item for item in news if "Việt Nam" in (item.get('title') or "") or "VN-Index" in (item.get('title') or "")]
        print(f"Vietnam items found in Global News: {len(vn_items)}")
        
        for item in news[:5]:
             print(f"- [{item.get('source')}] {item.get('title')}")

    else:
        print(response.text)
except Exception as e:
    print(f"Error: {e}")
