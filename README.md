# Bầu Ban điều hành TNTT

Ứng dụng web tiếng Việt cho quy trình bầu Ban điều hành Xứ đoàn, triển khai tĩnh qua GitHub Pages và dùng Firebase cho xác thực, dữ liệu khi cấu hình dự án.

## Chạy thử

```bash
npm install
npm run dev
```

Giao diện hiện có dữ liệu minh họa để xem tổng quan, phiếu bầu hai vòng, kết quả và phân công chức vụ. Không dùng dữ liệu mẫu để tổ chức bầu cử thật.

## Cấu hình Firebase

1. Tạo dự án Firebase, bật Authentication (Google hoặc phương thức đăng nhập phù hợp với đoàn) và Firestore.
2. Sao chép `.env.example` thành `.env.local`, điền cấu hình ứng dụng web Firebase.
3. Cài Firebase CLI, đăng nhập và deploy rules: `firebase deploy --only firestore:rules`.
4. Tạo tài liệu `users/{uid}` cho từng HDT với `active: true`, `role: "voter"`; cấp `role: "admin"` cho tài khoản admin đoàn. Chỉ admin quản lý danh sách và trạng thái tài khoản.

Phần kết nối UI với Firebase và các thao tác kiểm phiếu có quyền máy chủ vẫn cần hoàn thiện trước khi dùng thật. Không mở kỳ bầu cử thật chỉ với cấu hình frontend.

## GitHub Pages

Workflow tại `.github/workflows/deploy.yml` build ứng dụng khi push lên nhánh `main`. Trong GitHub, chọn **Settings → Pages → Build and deployment → GitHub Actions**. Nếu tên repository khác `BauBDHTNTT`, sửa `base` trong `vite.config.js` cho khớp. Đặt các biến `VITE_FIREBASE_*` làm GitHub Actions repository variables nếu build bản có kết nối Firebase.

## Thể lệ đã xác nhận

- Cả hai vòng: HDT trong Xứ đoàn được bỏ phiếu; được tự bầu cho mình.
- Vòng 1 bầu 11 người. Nếu hòa ở vị trí thứ 11, mở vòng phụ cho những người đồng phiếu.
- Vòng 2 bầu 5 người trong danh sách 11. Nếu hòa ở vị trí thứ 5, mở vòng phụ giữa những người đồng phiếu.
- 5 người Ban Thường vụ nhận các chức vụ Trưởng đoàn, hai Phó đoàn, Thư ký, Thủ quỹ. 6 thành viên còn lại được Ban Thường vụ phân công 5 trưởng ngành và Ủy viên Truyền thông.
- Người đã được bầu nhận nhiệm vụ; công bố đầy đủ số phiếu chi tiết. Danh tính cử tri và điều chỉnh trạng thái dành cho admin đoàn.
