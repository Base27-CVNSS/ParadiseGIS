# ParadiseGIS WebGIS

Giao diện mã nguồn mở trên OpenStreetMap, lấy cảm hứng thao tác từ MetaSleuth: chọn nút, bảng chứng cứ, lọc cạnh, tìm đường liên kết và chuyển giữa bản đồ / đồ thị. Đây là triển khai độc lập, không dùng mã hoặc API MetaSleuth.

## Mở ứng dụng

Mở `webgis/index.html` trực tiếp bằng Chrome/Edge. Leaflet 1.9.4 và dữ liệu được đóng gói tại chỗ; không cần npm, khóa API hay Neo4j. Nền OSM và các trang hồ sơ gốc cần Internet. Khi mất Internet, dùng tab **Đồ thị**. Không tải hàng loạt hoặc prefetch tile OSM.

Hoặc từ thư mục gốc chạy `python -m http.server 8000`, mở `http://localhost:8000/webgis/`.

**GitHub Pages:** Settings → Pages → Build and deployment → GitHub Actions. Nếu dùng GitHub Actions làm nguồn Pages, chạy workflow `webgis-pages.yml` thủ công trên main để xuất bản thư mục webgis. Repo hiện dùng xuất bản theo nhánh: tệp index.html tại gốc chuyển người dùng vào webgis/. Workflow kiểm tra chạy trên nhánh/PR. Các ví dụ Neo4j/GraphQL ban đầu vẫn nằm nguyên tại chỗ.

## Nguồn thật và phạm vi

Tải chính thức ICIJ ngày 10/10/2026, archive `GENERATED_ON_20260909.txt`.

- 672 nút có mã quốc gia `VNM`.
- Thêm **tất cả quan hệ trực tiếp** và đầu kia của chúng: 1.090 nút, 1.191 quan hệ.
- 178 nút chưa có vị trí đại diện; giữ lại trong đồ thị và tra cứu.
- Không có giao dịch ngân hàng hoặc on-chain trong tập ICIJ này.
- Tìm kiếm trong giao diện áp dụng tập đang mở. **Tra cứu toàn bộ ICIJ** mở truy vấn trên website chính thức; không giả lập một API công khai. API REST trên trang schema được ghi là private/beta.
- ICIJ có nhiều phiên bản bộ hồ sơ và giới hạn thời gian riêng. Trường `valid_until` được giữ ở bảng chi tiết; ngày tải không phải ngày cập nhật sự kiện.

Tọa độ thủ đô trong pipeline là điểm đại diện quốc gia/nơi đăng ký, không phải địa chỉ pháp nhân hay người liên quan. Jurisdiction của pháp nhân được ưu tiên trước countries. Quốc gia mơ hồ, nhiều quốc gia hoặc không nằm trong bảng tham chiếu được để null. Các hồ sơ cùng điểm được gom thành vòng tròn; không dùng jitter để tạo vị trí giả. Đường nối cùng một điểm đại diện có chiều dài bằng 0 và có thể không nhìn thấy; quan hệ vẫn nằm trong bảng và đồ thị.

Dữ liệu lưu EPSG:4326; bản đồ tile hiển thị EPSG:3857. Không dùng tuyến này để đo quãng đường hoặc suy ra đường đi vật lý của tiền. Nét đứt là quan hệ; đường liền đỏ và mũi tên là giao dịch do người dùng nhập. Phân biệt bằng kiểu nét và nhãn, không chỉ màu. Tắt hoạt ảnh khi người dùng bật reduced motion.

## Tái tạo dữ liệu

Python 3.11+, không cần thư viện ngoài. Tải ZIP tại https://offshoreleaks.icij.org/pages/database rồi chạy từ gốc repo:

```text
python scripts/prepare_icij.py full-oldb.LATEST.zip --country VNM --output webgis/data
```

Có thể thay VNM bằng mã quốc gia khác. Pipeline giữ đầy đủ một bước quan hệ và xuất kế toán số lượng, checksum, ngày và phạm vi. Script đọc tất cả nút vào RAM (bản nguồn hơn 2 triệu nút); dự kiến cần vài GB RAM. Một quốc gia lớn có thể vượt giới hạn trình duyệt 5.000 nút/10.000 cạnh; cần tạo phạm vi nhỏ hơn hoặc backend chỉ phục vụ các vùng lân cận trước khi sử dụng. Không tải toàn bộ graph vào Leaflet.

`icij.json` dùng cho nhập/xử lý; `icij.js` chứa cùng dữ liệu để mở bằng file://. Không chỉnh một tệp mà bỏ tệp kia. Bản nguồn ZIP lớn không đưa vào git.

## Nhập giao dịch thực tế của bạn

Nút **Nhập hồ sơ** nhận JSON dưới 12 MB. `nodes` tối đa 5.000, `edges` tối đa 10.000. ID duy nhất, ID tham chiếu tồn tại. Tọa độ số hoặc cả lat/lon đều null. URL phải HTTPS.

```json
{
  "meta": {"provider": "Tên nguồn của bạn", "scope": "Tập chứng cứ giao dịch"},
  "nodes": [
    {"id": "A", "name": "Điểm A", "type": "entities", "lat": 10.0, "lon": 106.0, "location_basis": "Ghi rõ căn cứ định vị"},
    {"id": "B", "name": "Điểm B", "type": "entities", "lat": 1.0, "lon": 103.0, "location_basis": "Ghi rõ căn cứ định vị"}
  ],
  "edges": [
    {"id": "T1", "from": "A", "to": "B", "kind": "transaction", "amount": 100, "currency": "USD", "timestamp": "2026-01-01T00:00:00Z", "evidence_url": "https://example.org/replace-with-real-evidence", "source": "Ví dụ cấu trúc, không phải giao dịch thật"}
  ]
}
```

Thay toàn bộ giá trị ví dụ bằng dữ liệu và chứng cứ thật. Kiểm tra schema không xác thực độc lập chứng cứ. Không suy ra tọa độ ví blockchain từ địa chỉ ví hoặc gán giao dịch cho người chỉ do trùng tên. Tệp nhập thay tập đang mở, được xử lý trong trình duyệt, không tải lên server; **Đặt lại** khôi phục ICIJ đóng gói. Không lưu hồ sơ nhập qua phiên làm việc.

Tìm tuyến dùng BFS O(V+E): quan hệ pháp nhân duyệt hai chiều; giao dịch chỉ gửi → nhận. **Chỉ giao dịch có hướng** bỏ các cạnh quan hệ. Không cộng số tiền từ các đồng tiền khác nhau. Khi không tìm thấy tuyến, chỉ kết luận về tập đang mở. Đồ thị mặc định giới hạn 180 nút, bảng 300 cạnh, kết quả 150 hồ sơ; chọn nút hoặc tìm kiếm để thu hẹp. Bấm đường nối hoặc bảng cạnh để xem chứng cứ. Có kéo/zoom đồ thị và nút vừa toàn cảnh bản đồ.

**GeoJSON** xuất đối tượng đang hiển thị, bảo toàn nguồn và kind; tách tuyến qua kinh tuyến 180° thành MultiLineString. ID nút/cạnh thiếu tọa độ được liệt kê trong `unmapped_nodes` / `unmapped_edges`, không bị bỏ âm thầm.

## Kiểm tra và giới hạn

```text
node --check webgis/app.js
node --test tests/core.test.cjs
python -W error::ResourceWarning -m unittest discover -s tests -p "test_*.py"
```

Kiểm tra hướng giao dịch, BFS, tham chiếu, tọa độ, antimeridian, chứng cứ bắt buộc, dữ liệu thật và pipeline idempotent. Kiểm tra ba quan hệ/thuộc tính thực tế so với CSV nguồn. QA trình duyệt trực quan chưa chạy trong môi trường tạo bản này; cần xác nhận popup, tương tác cảm ứng và tải OSM trên trình duyệt mục tiêu. Đây là ứng dụng tĩnh không có dịch vụ nền, không giám sát giao dịch realtime.

Rollback: revert commit WebGIS; các ví dụ Neo4j gốc không bị thay đổi. Không dùng credential Neo4j trực tiếp trong client. Nếu tích hợp backend sau này, truy vấn phải được tham số hóa và phân trang.

## Giấy phép

Mã mới trong `webgis` (trừ vendor và data), `scripts/prepare_icij.py` và tests: MIT, xem `LICENSE`. Leaflet: BSD-2-Clause, xem `vendor/LICENSE`. Dữ liệu ICIJ: ODbL, nội dung CC-BY-SA; phải giữ ghi nguồn và các yêu cầu chia sẻ tương thích, xem `DATA_SOURCES.md`. Không áp MIT lên dữ liệu hoặc mã có sẵn của repo.

## Harmony Visualization / Trace Chain (10/10/2026)

URL repository root now opens `webgis/` automatically. The repository currently publishes from a branch through GitHub Pages. `webgis-pages.yml` is an optional manual workflow: run it only if Settings → Pages is configured for GitHub Actions. It no longer competes with the existing branch deployment on every push.

**Harmony** is the default view: deep navy OSM basemap, multi-source route colors, great-circle display arcs, representative location hubs and labels. The **OSM** tab restores the ordinary basemap; **Đồ thị** uses a logical layout. **⛶** opens the canvas in full screen on browsers supporting the Fullscreen API.

- **Gom tuyến trùng:** group edges sharing representative endpoint coordinates, source and kind. Relationships are grouped without asserting direction; transactions retain their direction. Width follows the count of records, never the value of money. Original edge IDs remain in the popup, table and GeoJSON.
- The packaged ICIJ data becomes **39 distinct geographic route groups**; **337 same-position relationships** have no geographic length and **380 relationships** have at least one unlocated endpoint. All remain in graph/table/trace. These are counts of relationships, distinct from the 178 unlocated nodes.
- **Chuỗi mẫu ICIJ** selects an actual connected path in the loaded graph, prioritizing varied locations and limiting to 12 steps. No records or links are synthesized. The example selector explores up to 20 candidate starts, bounded BFS depth 12; shortest-path tracing remains O(V+E).
- **Trace Chain** presents ordered record cards. Click a card to highlight its representative map hub and incoming connection while keeping the entire chain visible. Click the connector to inspect the underlying relationship/source. Previous/next and play/pause browse records at a fixed 1.8-second interval. This is navigation, not the time taken for money to move. Playback stops on manual selection, reset/import/filter change, or backgrounding the page.
- In graph mode an active trace uses a readable serpentine sequence with at most 5 cards per row; clicking a card keeps the trace. Records with missing coordinates remain in this chain and the inspector.
- Color shows the data collection, dashes indicate relationship, arrows indicate imported transactions. Curves and glow illustrate connectivity, not an observed movement or a route measurement. Same-position records are aggregated, never jittered.
- Great-circle display samples are separate from the existing GeoJSON contract. GeoJSON exports representative endpoint connections with antimeridian splitting; it does not export the decorative glow or infer real-world itinerary.

11 core tests cover the new great-circle degeneracies, wrap continuity, directional aggregation, count accounting and genuine sample-chain adjacency. Syntax and source/asset checks also run. Visual browser QA is still unavailable in the authoring environment; verify labels and touch interactions on your target device.
