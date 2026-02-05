
TRUSTED_SOURCES = {
    "bloomberg", "reuters", "cnbc", "wall street journal", "financial times", "wsj",
    "marketwatch", "nikkei", "bangkok post", "the nation", "scmp", "caixin",
    "bbc", "cnn", "forbes", "business insider", "techcrunch", "engadget",
    "kaohoon", "thansettakij", "money channel", "efinance thai", "infoquest",
    "settrade", "prachachat", "ประชาชาติ", "กรุงเทพธุรกิจ", "ฐานเศรษฐกิจ",
    "ข่าวหุ้น", "ทันหุ้น", "bangkok biz news"
}

def _is_trusted_source(source_name: str) -> bool:
    if not source_name: return False
    s = source_name.lower()
    for t in TRUSTED_SOURCES:
        if t in s:
            print(f"Matched '{t}' in '{s}'")
            return True
    return False

source = "ประชาชาติธุรกิจ"
print(f"Checking '{source}': {_is_trusted_source(source)}")
