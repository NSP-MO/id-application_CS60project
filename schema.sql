-- schema.sql
CREATE TABLE applicants (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    region VARCHAR(50) NOT NULL,
    submission_time TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending'
);

CREATE TABLE revisions (
    id SERIAL PRIMARY KEY,
    applicant_id VARCHAR(50) REFERENCES applicants(id),
    name VARCHAR(100),
    address TEXT,
    region VARCHAR(50),
    modified_at TIMESTAMP DEFAULT NOW()
);