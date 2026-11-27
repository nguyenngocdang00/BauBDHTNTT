# Bầu Ban điều hành TNTT

Ứng dụng web cho bầu Ban điều hành Xứ đoàn, triển khai giao diện trên GitHub Pages và dùng Firebase Authentication, Cloud Firestore.

## Chạy thử

```bash
npm install
npm run dev
```

Ứng dụng không dùng số liệu mẫu khi Firebase chưa được cấu hình.

## Đăng nhập bằng mã, không dùng SMS

HDT đăng nhập bằng mã do admin cấp. Mã ngẫu nhiên 12 ký tự, chỉ dùng một lần, có thể đổi trong 4 giờ kể từ lúc cấp. Firebase chỉ lưu SHA-256 của mã; mã rõ chỉ hiện cho admin một lần sau khi cấp. Sau khi đăng nhập, trình duyệt giữ phiên Firebase Anonymous Auth cho đến khi người dùng đăng xuất hoặc xóa dữ liệu trình duyệt.

1. Trong Firebase Console, bật **Authentication → Sign-in method → Anonymous**. Bật thêm **Google** để admin đoàn đăng nhập.
2. Bật **Cloud Firestore** trong dự án Firebase Spark.
3. Đăng ký ứng dụng Web; sao chép `.env.example` thành `.env.local` và điền cấu hình Firebase.
4. Thêm domain GitHub Pages trong **Authentication → Settings → Authorized domains**.
5. Cài Firebase CLI, đăng nhập và liên kết đúng project:

   ```powershell
   npm.cmd install -g firebase-tools
   $npmGlobal = (npm.cmd config get prefix).Trim()
   & "$npmGlobal\firebase.cmd" login
   & "$npmGlobal\firebase.cmd" use --add
   ```

6. Tài khoản admin cần có document `users/{uid}` với `role: "admin"` và `active: true`.
7. Triển khai Firestore Rules:

   ```powershell
   & "$npmGlobal\firebase.cmd" deploy --only firestore:rules
   ```

8. Admin đăng nhập Google, mở **Danh sách HDT → Thêm HDT**, nhập biểu mẫu hoặc import `.xlsx`/`.csv`. Họ tên và ngành là bắt buộc; ngày sinh và email tùy chọn. Nếu trước đó đã nhập danh sách theo luồng Google cũ trong `approvedVoters`, hãy import lại danh sách để tạo hồ sơ mới trong `voterRoster`.
9. Trong danh sách HDT, admin có thể chọn **Cấp mã cho N HDT** để tạo hàng loạt, sao chép danh sách hoặc tải CSV; cũng có thể cấp riêng từng người. Gửi từng mã riêng cho đúng Huynh trưởng, không gửi file/danh sách vào nhóm chung vì mỗi mã cấp quyền đăng nhập cho người mang mã. Nếu chưa sử dụng sau 4 giờ, cấp mã mới. Mã chưa dùng cũ tự bị vô hiệu khi cấp mã khác.
10. HDT mở trang, nhập mã và đăng nhập. Không cần tài khoản Google, số điện thoại, SMS hay Cloud Functions cho bước đăng nhập và thêm danh sách.

Tài khoản admin hiện đăng nhập bằng Google. Không bật đăng nhập Google công khai cho HDT; mã chỉ cấp từ trang quản trị.

## Cấu hình kỳ bầu cử trên giao diện

Admin mở mục **Kỳ bầu cử** để nhập tên kỳ, nhiệm kỳ, mô tả và hạn kết thúc. Nhấn **Lưu cấu hình**, sau đó chọn **Đồng bộ danh sách HDT** để đưa các Huynh trưởng đang hoạt động vào danh sách ứng viên. Có thể loại ứng viên trước khi mở vòng 1.

Khi đã rà soát danh sách, nhấn **Mở vòng 1**. Sau khi đóng vòng 1, admin kiểm tra số phiếu và đánh dấu đúng 11 người trúng cử; nếu hòa ở ranh giới, tổ chức vòng phụ trước khi chốt. Khi đủ 11 người, nhấn **Mở vòng 2**. Đóng vòng khi hết hạn hoặc hoàn tất. Mọi thao tác cấu hình và mở/đóng được lưu vào `elections/current` trên Firestore; danh sách ứng viên lưu trong `elections/current/candidates`.

**Không mở bầu cử thật trên Spark ở phiên bản hiện tại.** Giao diện cấu hình, đồng bộ ứng viên và trạng thái kỳ bầu cử dùng Firestore; việc ghi phiếu vẫn gọi Cloud Function `submitBallot`, cần Blaze để triển khai. Có thể chuẩn bị dữ liệu, nhưng phiếu sẽ không gửi được nếu Function chưa hoạt động.

## Giới hạn chi phí và triển khai

Đăng nhập bằng mã và lưu danh sách dùng Firebase Authentication Anonymous + Firestore, không dùng SMS và không cần Cloud Functions. Việc sử dụng vẫn nằm trong hạn mức miễn phí Spark; Google có thể từ chối thao tác khi vượt hạn mức Spark.

**Chức năng gửi phiếu hiện vẫn dùng `submitBallot` Cloud Function.** Firebase yêu cầu gói Blaze để triển khai Cloud Functions, nên hiện tại chưa thể bỏ phiếu thật trên Spark. Không nâng gói hoặc mở kỳ bầu cử thật nếu chưa quyết định cách xử lý backend này. Khi triển khai Function về sau, phiếu đã được gắn với `voterId` cố định của hồ sơ để mã cấp lại không tạo thêm lượt bầu.

Workflow `.github/workflows/deploy.yml` build khi push lên nhánh `main`. Trong GitHub chọn **Settings → Pages → Build and deployment → GitHub Actions** và khai báo các `VITE_FIREBASE_*` repository variables.

## Thể lệ đã xác nhận

- Cả hai vòng: HDT trong Xứ đoàn được bỏ phiếu; được tự bầu cho mình.
- Vòng 1 bầu 11 người. Nếu hòa ở vị trí thứ 11, mở vòng phụ giữa những người đồng phiếu.
- Vòng 2 bầu 5 người trong danh sách 11. Nếu hòa ở vị trí thứ 5, mở vòng phụ giữa những người đồng phiếu.
- 5 người Ban Thường vụ nhận các chức vụ Trưởng đoàn, hai Phó đoàn, Thư ký, Thủ quỹ. 6 thành viên còn lại được Ban Thường vụ phân công 5 trưởng ngành và Ủy viên Truyền thông.
- Công bố đầy đủ số phiếu chi tiết; danh tính cử tri và điều chỉnh trạng thái dành cho admin đoàn.
