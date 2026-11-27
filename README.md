# Bầu Ban điều hành TNTT

Ứng dụng web tiếng Việt cho quy trình bầu Ban điều hành Xứ đoàn, triển khai tĩnh qua GitHub Pages và dùng Firebase cho xác thực, dữ liệu khi cấu hình dự án.

## Chạy thử

```bash
npm install
npm run dev
```

Giao diện chờ cấu hình Firebase và dữ liệu Firestore; khi chưa cấu hình, trang sẽ hiện hướng dẫn thay vì số liệu giả.

## Kết nối Firebase

Ứng dụng dùng Firebase Spark, Google Authentication và Cloud Firestore. Admin thêm HDT trực tiếp vào danh sách email được duyệt; HDT đăng nhập Google bằng email đó để tự liên kết hồ sơ. Luồng thêm HDT không dùng Cloud Functions hoặc SMS.

1. Tạo dự án Firebase, bật **Authentication → Google** và **Cloud Firestore**.
2. Đăng ký ứng dụng Web; sao chép `.env.example` thành `.env.local` và điền cấu hình Firebase.
3. Thêm domain GitHub Pages tại Authentication → Settings → Authorized domains.
4. Cài Firebase CLI (`npm install -g firebase-tools`), đăng nhập (`firebase login`) và liên kết dự án (`firebase use --add`).
5. Tài khoản admin cần có hồ sơ `users/{uid}` với `role: "admin"` và `active: true`. Admin mở **Danh sách HDT → Thêm HDT** để nhập bằng biểu mẫu hoặc import `.xlsx`/`.csv` (Họ tên, Ngành, Ngày sinh, Email). Email Google là bắt buộc; ngành chọn trong danh sách; ngày sinh tùy chọn.
6. Tạo `elections/current` với các trường: `name`, `term`, `description`, `status: "closed"`, `activeRound: 1`, `voterCount` (số HDT active), `round1VotedCount: 0`, `round2VotedCount: 0`.
7. Tạo ứng viên trong `elections/current/candidates/{candidateId}` với `name`, `sector`, `active: true`, `electedRound1: false`.
8. Triển khai quy tắc Firestore miễn phí bằng `firebase deploy --only firestore:rules`.
9. Admin đăng nhập Google và thêm danh sách HDT. Mỗi Huynh trưởng đăng nhập bằng đúng email Google đã khai báo; hồ sơ tự liên kết lần đầu.
10. Sau khi rà danh sách, admin mở vòng bằng cách sửa `elections/current` trong Firebase Console. Khi kết thúc vòng 1, chốt 11 người bằng `electedRound1: true`, rồi mở vòng 2. Khi hoàn tất, đóng kỳ bầu cử.
11. Đặt các biến `VITE_FIREBASE_*` làm GitHub Actions repository variables rồi deploy frontend.

Phiếu được lưu tại `elections/current/ballots/{uid}/rounds/{round}`; quyền đọc phiếu được giới hạn cho chính cử tri và admin. Số phiếu tổng hợp nằm trong `elections/current/tallies/round{n}/candidates/{candidateId}` và cập nhật trực tiếp. Thông tin lượt bỏ phiếu được phản ánh lên hồ sơ user để admin theo dõi.

**Lưu ý:** workspace chưa có thông tin Firebase project, tài khoản HDT hay danh sách ứng viên; vì vậy tích hợp đã được viết nhưng chưa thể kết nối hoặc nạp dữ liệu thật. Chức năng xử lý hòa bằng vòng phụ, xuất biên bản, giao diện quản lý kỳ bầu cử và phân công chức vụ vẫn cần hoàn thiện trước khi sử dụng chính thức. Không mở bầu cử thật trước khi kiểm tra Security Rules và luồng bỏ phiếu trên dự án của đoàn.

**Giới hạn trên Firebase Spark:** thêm HDT và đăng nhập Google không cần Cloud Functions. Chức năng gửi phiếu hiện vẫn gọi `submitBallot` Cloud Function; vì vậy chưa thể tổ chức bầu cử trên Spark cho đến khi chuyển phần xử lý phiếu sang backend khác hoặc bật Blaze. Không mở kỳ bầu cử thật trước khi xử lý giới hạn này.

## GitHub Pages

Workflow tại `.github/workflows/deploy.yml` build ứng dụng khi push lên nhánh `main`. Trong GitHub, chọn **Settings → Pages → Build and deployment → GitHub Actions**. Nếu tên repository khác `BauBDHTNTT`, sửa `base` trong `vite.config.js` cho khớp. Đặt các biến `VITE_FIREBASE_*` làm GitHub Actions repository variables nếu build bản có kết nối Firebase.

## Thể lệ đã xác nhận

- Cả hai vòng: HDT trong Xứ đoàn được bỏ phiếu; được tự bầu cho mình.
- Vòng 1 bầu 11 người. Nếu hòa ở vị trí thứ 11, mở vòng phụ cho những người đồng phiếu.
- Vòng 2 bầu 5 người trong danh sách 11. Nếu hòa ở vị trí thứ 5, mở vòng phụ giữa những người đồng phiếu.
- 5 người Ban Thường vụ nhận các chức vụ Trưởng đoàn, hai Phó đoàn, Thư ký, Thủ quỹ. 6 thành viên còn lại được Ban Thường vụ phân công 5 trưởng ngành và Ủy viên Truyền thông.
- Người đã được bầu nhận nhiệm vụ; công bố đầy đủ số phiếu chi tiết. Danh tính cử tri và điều chỉnh trạng thái dành cho admin đoàn.
