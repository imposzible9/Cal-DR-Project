# Cal-DR Project

โปรเจคสำหรับคำนวณและติดตามข้อมูลหุ้น Depositary Receipt (DR) พร้อมระบบข่าวสารและปฏิทินการซื้อขาย

## 📋 คุณสมบัติหลัก

- **DR List** - แสดงรายการหุ้น DR ทั้งหมดพร้อมข้อมูลราคาและอัตราการแลกเปลี่ยน
- **Calculation DR** - คำนวณค่า DR และวิเคราะห์ความแตกต่างของราคา
- **Suggestion** - แนะนำหุ้น DR ที่น่าสนใจตามเกณฑ์การวิเคราะห์
- **Calendar** - ปฏิทินแสดงกำหนดการซื้อขายหุ้น DR
- **News** - ข่าวสารหุ้นแบบเรียลไทม์จากแหล่งข้อมูลต่างๆ

## 🛠️ เทคโนโลยีที่ใช้

### Frontend
- React 18
- Vite
- React Router DOM
- Axios
- TailwindCSS

### Backend
- FastAPI (Python)
- httpx
- python-dotenv
- uvicorn

### APIs
- **news_api.py** - API สำหรับดึงข่าวสารหุ้นจาก NewsAPI, Google News และ Finnhub
- **dr_calculation_api.py** - API คำนวณค่า DR
- **earnings_api.py** - API ข้อมูลกำไรของบริษัท
- **ratings_api_dynamic.py** - API เรตติ้งหุ้นแบบไดนามิก

## 🚀 การติดตั้งและรัน

### ด้วย Docker (แนะนำ)

```bash
# Build และรัน containers ทั้งหมด
docker-compose up --build

# รันในโหมด detached (background)
docker-compose up -d

# หยุดการทำงาน
docker-compose down
```

### รันแบบปกติ

#### 1. ติดตั้ง Backend

```bash
# เข้าโฟลเดอร์ backend
cd backend/API

# สร้าง virtual environment
python -m venv .venv

# เปิดใช้งาน virtual environment
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Mac/Linux

# ติดตั้ง dependencies
pip install fastapi uvicorn httpx python-dotenv

# รัน News API
python news_api.py

# รัน APIs อื่นๆ (ในเทอร์มินัลแยก)
python dr_calculation_api.py
python earnings_api.py
python ratings_api_dynamic.py
```

#### 2. ติดตั้ง Frontend

```bash
# เข้าโฟลเดอร์ frontend
cd frontend

# ติดตั้ง dependencies
npm install

# รัน development server
npm run dev
```

## 🌐 URLs

- **Frontend**: http://localhost:5173 (Vite dev server) หรือ http://localhost:8082 (Docker)
- **News API**: http://localhost:8003
- **DR Calculation API**: http://localhost:8333
- **Earnings API**: http://localhost:8001
- **Ratings API**: http://localhost:8002

## 📁 โครงสร้างโปรเจค

```
Cal-DR-Project/
├── backend/
│   └── API/
│       ├── news_api.py              # API ข่าวสาร
│       ├── dr_calculation_api.py    # API คำนวณ DR
│       ├── earnings_api.py          # API ข้อมูลกำไร
│       ├── ratings_api_dynamic.py   # API เรตติ้ง
│       └── *.json                   # Cache files
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── navbar.jsx          # แถบนำทาง
│   │   │   ├── DRList.jsx          # หน้ารายการ DR
│   │   │   ├── CalDR.jsx           # หน้าคำนวณ DR
│   │   │   ├── suggestion.jsx      # หน้าแนะนำหุ้น
│   │   │   ├── calendar.jsx        # หน้าปฏิทิน
│   │   │   ├── News.jsx            # หน้าข่าวสาร
│   │   │   └── index.jsx           # Export components
│   │   ├── App.jsx                 # Main app component
│   │   └── main.jsx                # Entry point
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml               # Docker compose configuration
├── Dockerfile.backend               # Backend Docker image
├── Dockerfile.frontend              # Frontend Docker image
└── README.md
```

## ⚙️ การตั้งค่า Environment Variables

สร้างไฟล์ `.env` ในโฟลเดอร์ `backend/API/`:

```env
# NewsAPI (https://newsapi.org/)
NEWS_API_KEY=your_newsapi_key_here
NEWS_TTL_SECONDS=300

# Finnhub (https://finnhub.io/)
FINNHUB_TOKEN=your_finnhub_token_here
```

## 📝 คำแนะนำการใช้งาน

### หน้า News
1. เลือกสัญลักษณ์หุ้นที่ต้องการดูข่าว
2. ระบบจะแสดงข่าวล่าสุดพร้อมราคาหุ้นแบบเรียลไทม์
3. คลิกที่ข่าวเพื่ออ่านเนื้อหาฉบับเต็ม

### หน้า DR List
1. ดูรายการหุ้น DR ทั้งหมดพร้อมราคาปัจจุบัน
2. เปรียบเทียบราคา DR กับราคาหุ้นต้นทาง
3. ตรวจสอบอัตราแลกเปลี่ยนและส่วนต่างราคา

### หน้า Calculation DR
1. ใส่ข้อมูลหุ้น DR ที่ต้องการคำนวณ
2. ระบบจะแสดงผลการคำนวณและวิเคราะห์

### หน้า Calendar
1. ดูกำหนดการซื้อขายหุ้น DR
2. ตรวจสอบวันหยุดและวันสำคัญ
3. รับการแจ้งเตือนกำหนดการที่สำคัญ

## 🐛 การแก้ไขปัญหา

### Backend ไม่สามารถเชื่อมต่อได้
- ตรวจสอบว่า Python virtual environment ถูกเปิดใช้งาน
- ตรวจสอบว่าติดตั้ง dependencies ครบถ้วน
- ตรวจสอบว่า port ไม่ถูกใช้งานโดยโปรแกรมอื่น

### Frontend แสดงข้อผิดพลาด CORS
- ตรวจสอบว่า Backend APIs กำลังทำงานอยู่
- ตรวจสอบ URL ของ APIs ใน frontend code

### ไม่มีข่าวแสดง
- ตรวจสอบว่าตั้งค่า API keys ใน `.env` ถูกต้อง
- ตรวจสอบว่า News API server กำลังทำงาน (port 8003)

## 📄 License

MIT License

## 👥 ผู้พัฒนา

Cal-DR Project Team

---

**หมายเหตุ**: โปรเจคนี้พัฒนาเพื่อวัตถุประสงค์ทางการศึกษาและการวิเคราะห์ข้อมูล ไม่ใช่คำแนะนำในการลงทุน
