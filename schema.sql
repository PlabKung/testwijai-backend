-- ========================================================
-- 1. สร้างตาราง places ใน PostgreSQL
-- ========================================================
CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    opening_hours VARCHAR(100) DEFAULT '08:00 - 18:00 น.',
    rating NUMERIC(2, 1) DEFAULT 4.5,
    image TEXT,
    time_spent INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================
-- 1.1 สร้างตาราง admins สำหรับผู้ดูแลระบบ
-- ========================================================
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    fullname VARCHAR(100),
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- บัญชีแอดมินทั้ง 3 คน (สามารถเปลี่ยนรหัสผ่านของใครของมันได้)
INSERT INTO admins (username, password, fullname) VALUES 
('admin1', 'password1', 'แอดมินคนที่ 1'),
('admin2', 'password2', 'แอดมินคนที่ 2'),
('admin3', 'password3', 'แอดมินคนที่ 3')
ON CONFLICT (username) DO UPDATE
SET fullname = EXCLUDED.fullname;

-- ========================================================
-- 2. ข้อมูลตัวอย่างสถานที่ท่องเที่ยวจังหวัดขอนแก่น (Sample Data)
-- ========================================================
INSERT INTO places (name, category, description, latitude, longitude, opening_hours, rating, image, time_spent)
VALUES 
(
    'พระมหาธาตุแก่นนคร (บึงแก่นนคร)',
    'วัด/สถานที่ศักดิ์สิทธิ์',
    'พระธาตุ 9 ชั้นที่สวยงามและเป็นสัญลักษณ์ของจังหวัดขอนแก่น มองเห็นวิวเมืองและบึงแก่นนครแบบ 360 องศา',
    16.4172,
    102.8344,
    '07:00 - 17:00 น.',
    4.8,
    'https://images.unsplash.com/photo-1590766940554-638092019c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    60
),
(
    'พิพิธภัณฑสถานแห่งชาติ ขอนแก่น',
    'พิพิธภัณฑ์',
    'แหล่งเรียนรู้ประวัติศาสตร์ โบราณคดี และศิลปวัฒนธรรมที่สำคัญของภาคอีสาน จัดแสดงใบเสมาหินทรายและโบราณวัตถุยุคก่อนประวัติศาสตร์',
    16.4402,
    102.8362,
    '09:00 - 16:00 น. (ปิดจันทร์-อังคาร)',
    4.5,
    'https://images.unsplash.com/photo-1541336032412-2048a678540d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    90
),
(
    'ตลาดต้นตาล (Ton Tann Market)',
    'ตลาด/ช้อปปิ้ง',
    'ตลาดนัดกลางคืนสุดชิค บรรยากาศในสวน รวบรวมอาหารอร่อย สินค้าแฟชั่น เสื้อผ้า ของแฮนด์เมด ดนตรีสด และพื้นที่พักผ่อน',
    16.4184,
    102.8156,
    '16:00 - 23:00 น.',
    4.7,
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    120
),
(
    'สวนสัตว์ขอนแก่น (เขาสวนกวาง)',
    'ธรรมชาติ/สวนสัตว์',
    'สวนสัตว์ขนาดใหญ่ท่ามกลางธรรมชาติ มีสะพาน Sky Walk ชมวิวทิวทัศน์ ให้อาหารสัตว์นานาชนิดอย่างใกล้ชิด เหมาะสำหรับครอบครัว',
    16.8524,
    102.8808,
    '08:00 - 16:30 น.',
    4.6,
    'https://images.unsplash.com/photo-1534567153574-2b12153a87f0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    180
),
(
    'บึงสีฐาน มหาวิทยาลัยขอนแก่น',
    'ธรรมชาติ',
    'สถานที่พักผ่อนหย่อนใจยอดนิยม มีเลนวิ่งออกกำลังกาย ลานศิลปวัฒนธรรม และจุดชมพระอาทิตย์ตกริมน้ำที่สวยงามที่สุดแห่งหนึ่งในเมือง',
    16.4468,
    102.8252,
    'เปิด 24 ชั่วโมง',
    4.5,
    'https://images.unsplash.com/photo-1506744626753-1fa44f4a4df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    60
),
(
    'Columbo Craft Village',
    'คาเฟ่/ถ่ายรูป',
    'หมู่บ้านงานคราฟต์สุดชิคในบรรยากาศร่มรื่นใต้ร่มไม้ มีคาเฟ่ เวิร์กช็อปเซรามิก งานปั้น งานผ้า และมุมถ่ายรูปสไตล์มินิมอล',
    16.4747,
    102.8183,
    '09:00 - 18:00 น. (ปิดวันอังคาร)',
    4.4,
    'https://images.unsplash.com/photo-1524143986875-3b098d78b363?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    90
),
(
    'อุทยานแห่งชาติภูเวียง',
    'ธรรมชาติ',
    'แหล่งค้นพบซากฟอสซิลไดโนเสาร์แห่งแรกของประเทศไทย เส้นทางศึกษาธรรมชาติ ลานหิน น้ำตก และพิพิธภัณฑ์ไดโนเสาร์ภูเวียง',
    16.6667,
    102.2500,
    '08:30 - 16:30 น.',
    4.7,
    'https://images.unsplash.com/photo-1518091043644-c1d44579d2c1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    240
);

-- ตรวจสอบข้อมูลหลังเพิ่ม
SELECT * FROM places ORDER BY id ASC;
