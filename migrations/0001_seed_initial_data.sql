-- 0001_seed_initial_data.sql
-- Seed Initial Categories & System Settings

-- 1. Initial Categories
INSERT OR IGNORE INTO categories (id, name, slug, description, status, sort_order, created_at, updated_at) VALUES
('cat_gov_jobs', 'Government Jobs', 'government-jobs', 'Latest central and state government job vacancies, notifications, and recruitment updates across India.', 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_results', 'Results', 'results', 'Check Sarkari exam results, scorecards, merit lists, and cut-off marks for competitive exams.', 'active', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_admit_cards', 'Admit Cards', 'admit-cards', 'Download hall tickets, call letters, and admit cards for upcoming government entrance and recruitment examinations.', 'active', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_answer_keys', 'Answer Keys', 'answer-keys', 'Official and provisional answer keys, question papers, and objection submission links.', 'active', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_exams', 'Exams', 'exams', 'Upcoming exam dates, examination schedules, time tables, and important alerts.', 'active', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_scholarships', 'Scholarships', 'scholarships', 'National and state scholarship schemes, financial aid, eligibility criteria, and application dates.', 'active', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_syllabus', 'Syllabus', 'syllabus', 'Detailed syllabus, exam pattern, marking schemes, and preparation guides for all major exams.', 'active', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_schemes', 'Government Schemes', 'government-schemes', 'Central & State Government welfare initiatives, portals, eligibility, and citizen benefits.', 'active', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_updates', 'Important Updates', 'important-updates', 'Latest recruitment press releases, circulars, date extensions, and administrative notices.', 'active', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 2. Initial Settings
INSERT OR IGNORE INTO settings (id, key, value, type, updated_at) VALUES
('set_site_name', 'site_name', 'RealSarkariExam — Indian Govt Jobs & Results Portal', 'string', CURRENT_TIMESTAMP),
('set_site_desc', 'site_description', 'Fast, accurate, and verified updates for Indian Government Jobs, Exam Results, Admit Cards, and Answer Keys.', 'string', CURRENT_TIMESTAMP),
('set_contact_email', 'contact_email', 'support@realsarkariexam.com', 'string', CURRENT_TIMESTAMP),
('set_maintenance', 'maintenance_mode', 'false', 'boolean', CURRENT_TIMESTAMP),
('set_footer_disclaimer', 'footer_disclaimer', 'This website is an informational portal and is not affiliated with any government organization or entity. Always refer to official government notifications for verified details.', 'string', CURRENT_TIMESTAMP);

-- 3. Default Admin Account (Email: admin@realsarkariexam.com | Default Pass: Admin@12345)
-- Salt: 6f8e7d2a1b9c3e4f | PBKDF2-HMAC-SHA256 (100000 iterations)
INSERT OR IGNORE INTO admins (id, email, password_hash, salt, name, role, status, created_at, updated_at) VALUES
('adm_default_01', 'admin@realsarkariexam.com', 'c774b23879bb772e1fc9fc7a19668f3ee6a266bca13803311ad5d6006324282c', '6f8e7d2a1b9c3e4f', 'Super Administrator', 'superadmin', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
