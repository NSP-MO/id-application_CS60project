const express = require('express');
const { Pool } = require('pg');
const app = express();

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'id-application',
  password: '797985',
  port: 5432,
});

pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1); // Exit if connection fails
  } else {
    console.log('Successfully connected to PostgreSQL');
  }
});

app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Helper function for formatted time
const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Main route with sorting
app.get('/', async (req, res) => {
  try {
    let sortBy = req.query.sort || 'submission_time';
    const validSorts = ['submission_time', 'region'];
    if (!validSorts.includes(sortBy)) sortBy = 'submission_time';

    const { rows } = await pool.query({
      text: `SELECT *, 
              TO_CHAR(submission_time, 'YYYY-MM-DD HH24:MI:SS') as formatted_time 
             FROM applicants 
             WHERE status = 'pending'
             ORDER BY ${sortBy}`,
      values: []
    });

    // Format times for display
    rows.forEach(row => {
      row.formatted_time = formatTime(row.submission_time);
    });

    res.render('index', { 
      queue: rows,
      currentSort: sortBy,
      successMessage: req.query.success,
      errorMessage: req.query.error
    });
  } catch (err) {
    console.error(err);
    res.status(500).redirect('/?error=Database+error');
  }
});

// Submit application
app.post('/submit', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { name, address, region } = req.body;
    const id = `${region}-${Date.now()}`;

    await client.query(
      'INSERT INTO applicants (id, name, address, region) VALUES ($1, $2, $3, $4)',
      [id, name, address, region]
    );

    await client.query('COMMIT');
    res.redirect('/?success=Application+submitted');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', err);
    res.redirect('/?error=Submission+failed');
  } finally {
    client.release();
  }
});

// Process verification
app.post('/process', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      `UPDATE applicants 
       SET status = 'verified' 
       WHERE id = (
         SELECT id FROM applicants 
         WHERE status = 'pending' 
         ORDER BY submission_time 
         LIMIT 1
       )
       RETURNING *`
    );

    if (result.rows.length > 0) {
      console.log('Verified application:', result.rows[0]);
      await client.query('COMMIT');
      res.redirect('/?success=Application+verified');
    } else {
      console.log('No applications to verify');
      await client.query('ROLLBACK');
      res.redirect('/?error=No+applications+to+verify');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Verification error:', err);
    res.redirect('/?error=Verification+failed');
  } finally {
    client.release();
  }
});

// Edit application
app.post('/edit/:id', async (req, res) => {
  const { name, address, region } = req.body;
  
  try {
    // Save current state to revisions
    const { rows: [current] } = await pool.query(
      'SELECT * FROM applicants WHERE id = $1',
      [req.params.id]
    );

    await pool.query(
      'INSERT INTO revisions (applicant_id, name, address, region) VALUES ($1, $2, $3, $4)',
      [current.id, current.name, current.address, current.region]
    );

    // Update application
    await pool.query(
      `UPDATE applicants 
       SET name = $1, address = $2, region = $3, status = 'revision' 
       WHERE id = $4`,
      [name, address, region, req.params.id]
    );

    res.redirect('/?success=Application+updated');
  } catch (err) {
    console.error(err);
    res.redirect('/?error=Update+failed');
  }
});

// Undo revision
app.post('/undo/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `WITH last_revision AS (
         DELETE FROM revisions 
         WHERE id = (
           SELECT id FROM revisions 
           WHERE applicant_id = $1 
           ORDER BY modified_at DESC 
           LIMIT 1
         )
         RETURNING *
       )
       UPDATE applicants 
       SET name = lr.name, 
           address = lr.address, 
           region = lr.region 
       FROM last_revision lr 
       WHERE applicants.id = $1`,
      [req.params.id]
    );

    if (rows.length > 0) {
      res.redirect('/?success=Revision+undone');
    } else {
      res.redirect('/?error=No+revisions+found');
    }
  } catch (err) {
    console.error(err);
    res.redirect('/?error=Undo+failed');
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));