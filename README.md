# Bầu Ban điều hành TNTT

Ứng dụng web tiếng Việt cho quy trình bầu Ban điều hành Xứ đoàn, triển khai tĩnh qua GitHub Pages và dùng Firebase cho xác thực, dữ liệu khi cấu hình dự án.

## Chạy thử

```bash
npm install
npm run dev
```

Giao diện chờ cấu hình Firebase và dữ liệu Firestore; khi chưa cấu hình, trang sẽ hiện hướng dẫn thay vì số liệu giả.

## Kết nối Firebase

Ứng dụng đọc Firestore theo thời gian thực; HDT đăng nhập bằng mã cá nhân do admin cấp, Google, hoặc SMS tùy chọn. Mã cá nhân được tạo bằng Cloud Function, lưu dạng SHA-256 và đổi thành Firebase custom token sau khi kiểm tra hồ sơ HDT. Frontend không đọc danh sách mã và không tự tạo phiên đăng nhập.

1. Tạo dự án Firebase, bật **Authentication → Google**, **Authentication → Phone** (chỉ cần nếu muốn SMS) và **Cloud Firestore**.
2. Đăng ký ứng dụng Web; sao chép `.env.example` thành `.env.local` và điền cấu hình Firebase.
3. Thêm domain GitHub Pages tại Authentication → Settings → Authorized domains.
4. Cài Firebase CLI (`npm install -g firebase-tools`), đăng nhập (`firebase login`) và liên kết dự án (`firebase use --add`).
5. Tài khoản admin cần `role: "admin"`. Sau khi triển khai Cloud Functions ở bước 8, admin có thể mở **Danh sách HDT → Thêm HDT** để nhập từng hồ sơ bằng biểu mẫu hoặc import Excel `.xlsx`/`.csv` (cột Họ tên, Ngành, Ngày sinh, Email). Ngành được chọn trong danh sách; ngày sinh là tùy chọn. Hồ sơ trùng tên và ngành sẽ được bỏ qua.
6. Tạo `elections/current` với các trường: `name`, `term`, `description`, `status: "closed"`, `activeRound: 1`, `voterCount` (số HDT active), `round1VotedCount: 0`, `round2VotedCount: 0`.
7. Tạo ứng viên trong `elections/current/candidates/{candidateId}` với `name`, `sector`, `active: true`, `electedRound1: false`.
8. Cài và triển khai backend cùng Security Rules: chạy `npm install` trong `functions`, quay lại thư mục dự án rồi chạy `firebase deploy --only functions,firestore:rules`.
9. Admin đăng nhập, mở **Danh sách HDT**, nhấn **Cấp / đổi mã** ở từng người rồi gửi mã riêng cho người đó. Cấp lại sẽ thu hồi mã cũ; mã chỉ hiển thị một lần.
10. Nếu muốn SMS dự phòng, bật Phone provider, giới hạn SMS region và thêm `voterPhones/{+84...}` với `name`, `sector`, `active: true`.
11. Sau khi rà danh sách, admin mở vòng bằng cách sửa `elections/current` trong Firebase Console. Khi kết thúc vòng 1, chốt 11 người bằng `electedRound1: true`, rồi mở vòng 2. Khi hoàn tất, đóng kỳ bầu cử.
12. Đặt các biến `VITE_FIREBASE_*` làm GitHub Actions repository variables rồi deploy frontend.

Phiếu được lưu tại `elections/current/ballots/{uid}/rounds/{round}`; quyền đọc phiếu được giới hạn cho chính cử tri và admin. Số phiếu tổng hợp nằm trong `elections/current/tallies/round{n}/candidates/{candidateId}` và cập nhật trực tiếp. Thông tin lượt bỏ phiếu được phản ánh lên hồ sơ user để admin theo dõi.

**Lưu ý:** workspace chưa có thông tin Firebase project, tài khoản HDT hay danh sách ứng viên; vì vậy tích hợp đã được viết nhưng chưa thể kết nối hoặc nạp dữ liệu thật. Chức năng xử lý hòa bằng vòng phụ, xuất biên bản, giao diện quản lý kỳ bầu cử và phân công chức vụ vẫn cần hoàn thiện trước khi sử dụng chính thức. Không mở bầu cử thật trước khi kiểm tra Security Rules và luồng bỏ phiếu trên dự án của đoàn.

Mã cá nhân không tốn phí SMS và không cần email. Đây là mã bí mật dạng bearer: ai có mã có thể đăng nhập tài khoản đó. Mã được tạo ngẫu nhiên, lưu dạng băm, giới hạn tốc độ thử và có thể thu hồi bằng cách cấp lại. Admin nên gửi mã riêng, không đăng lên nhóm chung. SMS vẫn là lựa chọn phụ, có thể phát sinh phí và kém an toàn hơn Google. [Firebase custom auth](https://firebase.google.com/docs/auth/admin/create-custom-tokens) · [Phone Auth](https://firebase.google.com/docs/auth/web/phone-auth)

Triển khai Cloud Functions yêu cầu dự án ở gói Blaze có liên kết billing. Có mức sử dụng miễn phí, nhưng hạ tầng triển khai hoặc mức dùng vượt hạn mức có thể phát sinh phí; nên đặt budget alert trước khi deploy. [Firebase Cloud Functions billing](https://firebase.google.com/docs/functions/faq-and-troubleshooting#cloud_functions_pricing)

## GitHub Pages

Workflow tại `.github/workflows/deploy.yml` build ứng dụng khi push lên nhánh `main`. Trong GitHub, chọn **Settings → Pages → Build and deployment → GitHub Actions**. Nếu tên repository khác `BauBDHTNTT`, sửa `base` trong `vite.config.js` cho khớp. Đặt các biến `VITE_FIREBASE_*` làm GitHub Actions repository variables nếu build bản có kết nối Firebase.

## Thể lệ đã xác nhận

- Cả hai vòng: HDT trong Xứ đoàn được bỏ phiếu; được tự bầu cho mình.
- Vòng 1 bầu 11 người. Nếu hòa ở vị trí thứ 11, mở vòng phụ cho những người đồng phiếu.
- Vòng 2 bầu 5 người trong danh sách 11. Nếu hòa ở vị trí thứ 5, mở vòng phụ giữa những người đồng phiếu.
- 5 người Ban Thường vụ nhận các chức vụ Trưởng đoàn, hai Phó đoàn, Thư ký, Thủ quỹ. 6 thành viên còn lại được Ban Thường vụ phân công 5 trưởng ngành và Ủy viên Truyền thông.
- Người đã được bầu nhận nhiệm vụ; công bố đầy đủ số phiếu chi tiết. Danh tính cử tri và điều chỉnh trạng thái dành cho admin đoàn.
