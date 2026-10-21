-- More kinds of public places: places of worship, schools, offices, transport, culture, neighbourhoods.
-- The private-capable ones (schools, universities) can be claimed by their owner like a private hospital.
INSERT INTO "LandmarkKind" ("id", "slug", "nameAr", "nameEn", "icon", "color", "geometry", "claimable", "sortOrder") VALUES
  (gen_random_uuid()::text, 'church', 'كنيسة', 'Church', '⛪', '#8e5a2b', 'POINT', false, 5),
  (gen_random_uuid()::text, 'school', 'مدرسة', 'School', '🏫', '#e67e22', 'POINT', true, 6),
  (gen_random_uuid()::text, 'kindergarten', 'روضة', 'Kindergarten', '🧸', '#f1a208', 'POINT', true, 7),
  (gen_random_uuid()::text, 'university', 'جامعة / معهد', 'University / college', '🎓', '#2c3e90', 'POINT', true, 8),
  (gen_random_uuid()::text, 'government', 'دائرة حكومية', 'Government office', '🏛️', '#5d6d7e', 'POINT', false, 9),
  (gen_random_uuid()::text, 'police', 'مخفر شرطة', 'Police station', '🚓', '#1f3a93', 'POINT', false, 10),
  (gen_random_uuid()::text, 'fire_station', 'إطفاء', 'Fire station', '🚒', '#c0392b', 'POINT', false, 11),
  (gen_random_uuid()::text, 'post_office', 'بريد', 'Post office', '📮', '#d35400', 'POINT', false, 12),
  (gen_random_uuid()::text, 'bus_station', 'كراج باصات وسرافيس', 'Bus & minibus station', '🚌', '#16a085', 'POINT', false, 13),
  (gen_random_uuid()::text, 'train_station', 'محطة قطار', 'Train station', '🚉', '#34495e', 'POINT', false, 14),
  (gen_random_uuid()::text, 'airport', 'مطار', 'Airport', '✈️', '#2980b9', 'POINT', false, 15),
  (gen_random_uuid()::text, 'stadium', 'ملعب', 'Stadium', '🏟️', '#27ae60', 'POINT', false, 16),
  (gen_random_uuid()::text, 'museum', 'متحف', 'Museum', '🏺', '#a0522d', 'POINT', false, 17),
  (gen_random_uuid()::text, 'historic', 'قلعة / موقع أثري', 'Castle / historic site', '🏰', '#8d6e63', 'POINT', false, 18),
  (gen_random_uuid()::text, 'market', 'سوق شعبي', 'Market', '🛒', '#b9770e', 'POINT', false, 19),
  (gen_random_uuid()::text, 'square', 'ساحة', 'Square', '⛲', '#3498db', 'POINT', false, 20),
  (gen_random_uuid()::text, 'neighborhood', 'حي', 'Neighbourhood', '🏘️', '#7f8c8d', 'POINT', false, 21)
ON CONFLICT ("slug") DO NOTHING;
