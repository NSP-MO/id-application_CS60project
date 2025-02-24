const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'your_postgres_password',
  port: 5432,
});

async function setupDatabase() {
  try {
    await pool.query('CREATE DATABASE "id-application"');
    console.log('Database created');
  } catch (err) {
    console.log('Database already exists');
  }

  const appPool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'id-application',
    password: '797985',
    port: 5432,
  });

  await appPool.query(`
    CREATE TABLE IF NOT EXISTS applicants (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      address TEXT NOT NULL,
      region VARCHAR(50) NOT NULL,
      submission_time TIMESTAMP DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'pending'
    )
  `);
  
  console.log('Tables created successfully');
  process.exit();
}

setupDatabase();