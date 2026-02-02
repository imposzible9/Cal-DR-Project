
def _is_trusted_source(source_name: str) -> bool:
    TRUSTED_SOURCES = {
        "bloomberg", "reuters", "cnbc", "wall street journal", "financial times", "wsj",
        "marketwatch", "nikkei", "bangkok post", "the nation", "scmp", "caixin",
        "bbc", "cnn", "forbes", "business insider", "techcrunch", "engadget",
        "kaohoon", "thansettakij", "money channel", "efinance thai", "infoquest",
        "settrade", "prachachat", "ประชาชาติ", "กรุงเทพธุรกิจ", "ฐานเศรษฐกิจ",
        "ข่าวหุ้น", "ทันหุ้น", "bangkok biz news"
    }
    
    if not source_name: return False
    s = source_name.lower().strip()
    
    # Debug print
    print(f"Checking '{s}' against trusted list...")
    
    for t in TRUSTED_SOURCES:
        if t in s:
            print(f"  Match found: '{t}' in '{s}'")
            return True
            
    print("  No match found")
    return False

# Test cases
test_sources = [
    "ประชาชาติธุรกิจ",
    "กรุงเทพธุรกิจ",
    "Kaohoon International",
    "Unknown Source"
]

for source in test_sources:
    result = _is_trusted_source(source)
    print(f"Source: {source} -> Trusted: {result}\n")
