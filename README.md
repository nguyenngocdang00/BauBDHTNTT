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

Admin mở mục **Kỳ bầu cử** để nhập tên kỳ, nhiệm kỳ, mô tả, hạn kết thúc và số người được bầu ở mỗi vòng. Mặc định vòng 1 là 11, vòng 2 là 5; có thể thay đổi trước khi kỳ bắt đầu. Nhấn **Lưu cấu hình**, sau đó chọn **Chọn HDT từ danh sách** và tích những Huynh trưởng đủ điều kiện tham gia ứng cử trong kỳ này. Danh sách ứng viên của mỗi kỳ được chọn độc lập với danh sách HDT chung.

Khi đã rà soát danh sách, nhấn **Mở vòng 1**. Sau khi đóng vòng 1, nhấn **Tổng hợp phiếu**. Nếu hòa tại ranh giới số người cấu hình vòng 1, phần **Tạo vòng phụ** gợi ý nhóm người hòa theo kết quả hiện có; admin chọn nhóm đồng phiếu, nhập số suất còn thiếu và hạn bỏ phiếu rồi mở đợt phụ. HDT bỏ một phiếu phụ riêng; phiếu và bảng điểm vòng 1 không bị sửa. Đóng vòng phụ, kiểm tra số phiếu, chọn đúng số người thắng rồi chốt. Khi đủ số người vòng 1, nhấn **Mở vòng 2**. Sau khi đóng vòng 2 và tổng hợp phiếu, admin đánh dấu đúng số người đã cấu hình trong mục **Chốt kết quả vòng 2** rồi xác nhận; phiếu và tally vòng 2 không đổi. Phiếu phụ lưu dưới collection con `runoffs/{id}` của kỳ đang chọn; dữ liệu ballot/tally vòng 1 không đổi.

## Nhiều kỳ bầu cử

Mục **Kỳ bầu cử** có bộ chọn kỳ và nút **Tạo kỳ bầu cử mới**. Dữ liệu cũ `elections/current` được giữ nguyên; mỗi kỳ mới có document ID riêng cùng các collection ứng viên, phiếu và kết quả riêng. Kỳ đang được dùng chung lưu tại `appSettings/activeElection`, nên khi admin chuyển kỳ, trang của các thành viên cũng chuyển theo. Không cho đổi kỳ khi một vòng đang mở. Sau khi tạo kỳ mới, admin nhập tên/nhiệm kỳ, lưu cấu hình, chọn HDT đủ điều kiện ứng cử, rồi mới mở vòng 1.

## Giới hạn chi phí và triển khai

Đăng nhập bằng mã, lưu danh sách và gửi phiếu dùng Firebase Authentication + Firestore, không dùng SMS và không gọi Cloud Functions. Rules chỉ cho phép mỗi hồ sơ HDT tạo một phiếu cho mỗi vòng; phiếu không thể sửa/xóa và chỉ admin đọc được danh tính cùng lựa chọn. Sau khi đóng vòng, admin dùng trang cấu hình để tổng hợp phiếu thành bảng kết quả công khai. Việc sử dụng vẫn trong hạn mức miễn phí Spark (có thể bị giới hạn nếu vượt quota).

Workflow `.github/workflows/deploy.yml` build khi push lên nhánh `main`. Trong GitHub chọn **Settings → Pages → Build and deployment → GitHub Actions** và khai báo các `VITE_FIREBASE_*` repository variables.

## Thể lệ đã xác nhận

- Cả hai vòng: HDT trong Xứ đoàn được bỏ phiếu; được tự bầu cho mình.
- Số người được bầu mỗi vòng do admin cấu hình riêng cho từng kỳ (mặc định vòng 1 là 11, vòng 2 là 5). Nếu hòa tại ranh giới số ghế, admin mở vòng phụ giữa toàn bộ người đồng phiếu để chọn số suất còn thiếu; phiếu vòng chính được giữ nguyên.
- 5 người Ban Thường vụ nhận các chức vụ Trưởng đoàn, hai Phó đoàn, Thư ký, Thủ quỹ. 6 thành viên còn lại được Ban Thường vụ phân công 5 trưởng ngành và Ủy viên Truyền thông.
- Công bố đầy đủ số phiếu chi tiết; danh tính cử tri và điều chỉnh trạng thái dành cho admin đoàn.
