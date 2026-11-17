# Finance Pro — Hướng Dẫn Chạy Thử, Kết Nối Supabase & Triển Khai Vercel

Ứng dụng quản lý chi tiêu thông minh đa người dùng (**Standard Mode cho Sinh viên** & **Senior Mode Chữ Lớn WCAG AAA cho Bố Mẹ**), tích hợp **Google Gemini AI** bóc tách câu nói tiếng Việt tự nhiên và kiến trúc **Local-First → Supabase Cloud Ready**.

---

## 1. Chạy Thử Ngay Trên Máy (Không Cần Cấu Hình Supabase)

Dự án đã được thiết lập sẵn khóa `GEMINI_API_KEY` trong tệp `.env.local` (tệp này đã được chặn chặt trong `.gitignore` để bảo mật).

```bash
cd d:\Duan\Finance-pro

# 1. Kiểm thử bộ phân tích tiếng Việt & kết nối Gemini API thực tế
npm run test:parser

# 2. Khởi chạy máy chủ phát triển (http://localhost:3000)
npm run dev
```

### Cách trải nghiệm nhanh trên trình duyệt:
- **Chuyển đổi chế độ trên thanh đầu trang:**
  - **Sinh viên (Standard):** Thanh nhập nhanh AI Omnibar, tách nhiều khoản chi trong 1 câu nói (VD: *"sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi"*), biểu đồ tỷ trọng danh mục, cảnh báo hạn mức Tuần/Tháng, xuất CSV.
  - **Bố / Mẹ (Chữ Lớn - Senior Mode):** Giao diện độ tương phản cao chuẩn WCAG AAA, nút Micro khổng lồ **"BẤM ĐỂ NÓI CHI TIÊU"**, tự động đọc xác nhận bằng giọng tiếng Việt (`speechSynthesis vi-VN`), nút **"HOÀN TÁC (XÓA KHOẢN VỪA GHI)"** 1 chạm, và bàn phím phụ gợi ý mệnh giá nhanh.

---

## 2. Cách Gắn Supabase Cloud Sau Này (Đa Thiết Bị & Phân Quyền RLS)

Khi bạn muốn đồng bộ dữ liệu giữa điện thoại của Bố Mẹ và máy tính của bạn:

1. Đăng nhập [Supabase Dashboard](https://supabase.com/dashboard) và tạo một Project miễn phí.
2. Vào mục **SQL Editor** → tạo truy vấn mới → dán toàn bộ nội dung tệp [`supabase/schema.sql`](./supabase/schema.sql) và nhấn **Run** (tự động tạo 5 bảng `profiles`, `wallets`, `wallet_members`, `categories`, `transactions`, 10 danh mục mặc định, Trigger tạo ví khi đăng ký và khóa bảo mật Row-Level Security).
3. Vào **Project Settings → API**, sao chép `Project URL` và `anon public key` điền vào tệp `.env.local`:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-or-publishable-key"
   ```
4. Khởi động lại web → Bấm nút **Local-First (Đám mây)** ở góc phải trên cùng để đăng ký/đăng nhập và bấm **"Đồng bộ dữ liệu thử nghiệm lên đám mây"**.

---

## 3. Triển Khai Lên Vercel Miễn Phí & Chống Ngủ Đông 24/7

1. Đẩy thư mục `Finance-pro` lên GitHub (tệp `.gitignore` đã chặn `.env.local` nên khóa API của bạn hoàn toàn an toàn).
2. Vào [Vercel Dashboard](https://vercel.com/new) → Import repository `Finance-pro`.
3. Trong mục **Environment Variables** trên Vercel, thêm:
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL` (nếu đã dùng Supabase)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nếu đã dùng Supabase)
4. Nhấn **Deploy**. Tệp [`vercel.json`](./vercel.json) đã cấu hình sẵn **Vercel Cron** gọi tới `/api/health` định kỳ mỗi 3 ngày (`0 3 */3 * *`), giữ cho cơ sở dữ liệu Supabase Free không bao giờ bị ngủ đông sau 7 ngày vắng truy cập.
