-- More OpenStreetMap place categories, including food, retail, health, finance,
-- transport, visitor services and tourism. Generic shop catches all mapped shop=* values.
INSERT INTO "LandmarkKind" ("id", "slug", "nameAr", "nameEn", "icon", "color", "geometry", "claimable", "sortOrder") VALUES
  (gen_random_uuid()::text, 'restaurant', 'مطاعم وكافيهات', 'Restaurants & cafes', '🍽️', '#c0392b', 'POINT', false, 22),
  (gen_random_uuid()::text, 'bakery', 'مخابز', 'Bakeries', '🥖', '#b9770e', 'POINT', false, 23),
  (gen_random_uuid()::text, 'pharmacy', 'صيدليات', 'Pharmacies', '💊', '#27ae60', 'POINT', false, 24),
  (gen_random_uuid()::text, 'clinic', 'عيادات ومراكز صحية', 'Clinics & health centres', '🩺', '#16a085', 'POINT', false, 25),
  (gen_random_uuid()::text, 'bank', 'بنوك', 'Banks', '🏦', '#2c3e50', 'POINT', false, 26),
  (gen_random_uuid()::text, 'atm', 'صرافات آلية', 'ATMs', '💳', '#34495e', 'POINT', false, 27),
  (gen_random_uuid()::text, 'fuel', 'محطات وقود', 'Fuel stations', '⛽', '#d35400', 'POINT', false, 28),
  (gen_random_uuid()::text, 'bus_stop', 'مواقف باص', 'Bus stops', '🚏', '#2980b9', 'POINT', false, 29),
  (gen_random_uuid()::text, 'parking', 'مواقف سيارات', 'Parking', '🅿️', '#7f8c8d', 'POINT', false, 30),
  (gen_random_uuid()::text, 'toilets', 'دورات مياه عامة', 'Public toilets', '🚻', '#7f8c8d', 'POINT', false, 31),
  (gen_random_uuid()::text, 'drinking_water', 'مياه شرب', 'Drinking water', '🚰', '#3498db', 'POINT', false, 32),
  (gen_random_uuid()::text, 'library', 'مكتبات عامة', 'Libraries', '📚', '#8e44ad', 'POINT', false, 33),
  (gen_random_uuid()::text, 'hotel', 'فنادق ونُزل', 'Hotels & guest houses', '🛎️', '#8e44ad', 'POINT', false, 34),
  (gen_random_uuid()::text, 'attraction', 'معالم سياحية ونصب', 'Tourist attractions & monuments', '📸', '#d35400', 'POINT', false, 35),
  (gen_random_uuid()::text, 'shop', 'محلات ومتاجر', 'Shops & retail', '🛍️', '#c0392b', 'POINT', false, 36),
  (gen_random_uuid()::text, 'services', 'مكاتب وحرف وخدمات', 'Offices, crafts & services', '🧰', '#5d6d7e', 'POINT', false, 37)
ON CONFLICT ("slug") DO NOTHING;
