"""
รันฟังก์ชัน populate_accuracy_on_startup() เพื่ออัปเดตข้อมูล accuracy
"""
import sys
sys.path.insert(0, '.')

# Import ฟังก์ชันจาก ratings_api_dynamic
from ratings_api_dynamic import populate_accuracy_on_startup

if __name__ == "__main__":
    print("🔄 รัน populate_accuracy_on_startup()...")
    populate_accuracy_on_startup()
    print("\n✅ เสร็จสิ้น!")
