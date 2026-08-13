CREATE DATABASE IF NOT EXISTS surprise_draw
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE surprise_draw;

CREATE TABLE IF NOT EXISTS students (
  student_id VARCHAR(32) NOT NULL,
  student_name VARCHAR(64) NOT NULL,
  class_name VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (student_id),
  KEY idx_students_name (student_name),
  KEY idx_students_active (is_active, deleted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS draw_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(32) NOT NULL,
  prize_id TINYINT UNSIGNED NOT NULL,
  drawn_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeemed_at DATETIME NULL,
  redeemed_by VARCHAR(64) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_draw_student (student_id),
  CONSTRAINT fk_draw_student FOREIGN KEY (student_id)
    REFERENCES students (student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_users (
  username VARCHAR(32) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (username),
  KEY idx_admin_users_active (is_active)
) ENGINE=InnoDB;

-- Initial administrator passwords are stored as bcrypt hashes, never plaintext.
-- Change these initial passwords before opening the management page to the internet.
INSERT IGNORE INTO admin_users (username, display_name, password_hash) VALUES
  ('shiqi', '诗琪', '$2b$12$79AZogSaLcwW3wtN0pAnlew8hWGR0su7LXP/lF9AAbxsnJZemMNKq'),
  ('yujing', '余婧', '$2b$12$G9rfOT9xyZchnBcMmalLju9GDxUn6TFuDRLBOD0S6dm0WN4QZjPD.');

CREATE TABLE IF NOT EXISTS admin_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_name VARCHAR(64) NOT NULL,
  action VARCHAR(50) NOT NULL,
  student_id VARCHAR(32) NULL,
  detail VARCHAR(500) NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_created (created_at),
  KEY idx_logs_student (student_id)
) ENGINE=InnoDB;

-- Create this account on the independent MySQL server and restrict HOST to
-- the Ubuntu application's private IP instead of using '%'.
-- CREATE USER 'surprise_app'@'172.24.10.24' IDENTIFIED BY 'strong-password';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON surprise_draw.* TO 'surprise_app'@'172.24.10.24';
-- FLUSH PRIVILEGES;
