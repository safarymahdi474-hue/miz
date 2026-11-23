CREATE TABLE {{p}}users (
 id CHAR(32) PRIMARY KEY,email VARCHAR(190) NOT NULL UNIQUE,display_name VARCHAR(32) NOT NULL,password_hash VARCHAR(255) NOT NULL,recovery_hash CHAR(64) NOT NULL,role VARCHAR(16) NOT NULL DEFAULT 'member',goal INT NOT NULL DEFAULT 120,session_version INT NOT NULL DEFAULT 1,created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE {{p}}subjects (
 user_id CHAR(32) NOT NULL,id VARCHAR(64) NOT NULL,name VARCHAR(40) NOT NULL,color CHAR(7) NOT NULL,position INT NOT NULL DEFAULT 0,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES {{p}}users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE {{p}}study_sessions (
 user_id CHAR(32) NOT NULL,id VARCHAR(80) NOT NULL,subject_id VARCHAR(64) NOT NULL,subject_name VARCHAR(40) NOT NULL,color CHAR(7) NOT NULL,start_ms BIGINT NOT NULL,end_ms BIGINT NOT NULL,active_ms BIGINT NOT NULL,elapsed_ms BIGINT NOT NULL,segments LONGTEXT NOT NULL,thoughts LONGTEXT NOT NULL,interrupted TINYINT NOT NULL DEFAULT 0,PRIMARY KEY(user_id,id),INDEX(user_id,start_ms),FOREIGN KEY(user_id) REFERENCES {{p}}users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE {{p}}study_groups (
 id CHAR(32) PRIMARY KEY,name VARCHAR(48) NOT NULL,invite_code CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,owner_id CHAR(32) NOT NULL,created_at BIGINT NOT NULL,camera_required TINYINT NOT NULL DEFAULT 0,FOREIGN KEY(owner_id) REFERENCES {{p}}users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE {{p}}group_members (
 group_id CHAR(32) NOT NULL,user_id CHAR(32) NOT NULL,status VARCHAR(16) NOT NULL,requested_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,PRIMARY KEY(group_id,user_id),INDEX(user_id,status),FOREIGN KEY(group_id) REFERENCES {{p}}study_groups(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES {{p}}users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE {{p}}room_presence (
 user_id CHAR(32) PRIMARY KEY,group_id CHAR(32) NOT NULL,visit_id CHAR(32) NOT NULL,mode VARCHAR(12) NOT NULL DEFAULT 'manual',active_ms BIGINT NOT NULL DEFAULT 0,studying TINYINT NOT NULL DEFAULT 0,entered_at BIGINT NOT NULL,last_seen BIGINT NOT NULL,INDEX(group_id,last_seen),FOREIGN KEY(user_id) REFERENCES {{p}}users(id) ON DELETE CASCADE,FOREIGN KEY(group_id) REFERENCES {{p}}study_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE {{p}}rate_limits (bucket CHAR(64) PRIMARY KEY,attempts INT NOT NULL,expires_at BIGINT NOT NULL,INDEX(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE {{p}}room_history (visit_id CHAR(32) PRIMARY KEY,user_id CHAR(32) NOT NULL,group_id CHAR(32) NOT NULL,active_ms BIGINT NOT NULL,entered_at BIGINT NOT NULL,last_seen BIGINT NOT NULL,mode VARCHAR(12) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX {{p}}history_group_idx ON {{p}}room_history(group_id,user_id,last_seen);
