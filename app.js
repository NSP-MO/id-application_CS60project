const express = require('express');
const { Pool } = require('pg');
const app = express();

// Data Structures
class Node {
  constructor(data) {
    this.data = data;
    this.next = null;
    this.prev = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
    this.tail = null;
    this.size = 0;
    this.idMap = new Map();
  }

  append(data) {
    const newNode = new Node(data);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.prev = this.tail;
      this.tail.next = newNode;
      this.tail = newNode;
    }
    this.idMap.set(data.id, newNode);
    this.size++;
  }

  remove(node) {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.head) this.head = node.next;
    if (node === this.tail) this.tail = node.prev;
    this.idMap.delete(node.data.id);
    this.size--;
  }

  findById(id) {
    return this.idMap.get(id) || null;
  }

  toSortedArray(compareFn) {
    const arr = [];
    let current = this.head;
    while (current) {
      arr.push(current.data);
      current = current.next;
    }
    return arr.sort(compareFn);
  }
}

class RevisionStack {
  constructor() {
    this.top = null;
    this.size = 0;
  }

  push(data) {
    const newNode = new Node(data);
    newNode.next = this.top;
    this.top = newNode;
    this.size++;
  }

  pop() {
    if (!this.top) return null;
    const data = this.top.data;
    this.top = this.top.next;
    this.size--;
    return data;
  }
}

// Application Core
class KtpSystem {
  constructor() {
    this.applications = new LinkedList();
    this.verificationQueue = new LinkedList();
    this.revisions = new RevisionStack();
    this.pool = new Pool({
      user: 'postgres',
      host: 'localhost',
      database: 'id-application',
      password: '797985',
      port: 5432,
    });
  }

  async initialize() {
    await this.loadFromDatabase();
  }

  async loadFromDatabase() {
    const { rows } = await this.pool.query('SELECT * FROM applicants');
    rows.forEach(row => {
      this.applications.append(row);
      if (row.status === 'pending') {
        this.verificationQueue.append(row);
      }
    });
  }

  async saveToDatabase() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing data
      await client.query('DELETE FROM applicants');
      
      // Save current state
      let current = this.applications.head;
      while (current) {
        await client.query(
          'INSERT INTO applicants (id, name, address, region, status) VALUES ($1, $2, $3, $4, $5)',
          [current.data.id, current.data.name, current.data.address, 
           current.data.region, current.data.status]
        );
        current = current.next;
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  submitApplication(data) {
    const application = {
      ...data,
      id: `${data.region}-${Date.now()}`,
      status: 'pending',
      submissionTime: new Date()
    };
    
    this.applications.append(application);
    this.verificationQueue.append(application);
    return application;
  }

  processVerification() {
    if (!this.verificationQueue.head) return null;
    
    const node = this.verificationQueue.head;
    node.data.status = 'verified';
    this.verificationQueue.remove(node);
    return node.data;
  }

  editApplication(id, newData) {
    const node = this.applications.findById(id);
    if (!node) return null;

    // Save to revisions
    this.revisions.push({ ...node.data });
    
    // Update application
    Object.assign(node.data, newData);
    node.data.status = 'revision';
    return node.data;
  }

  undoRevision(id) {
    const node = this.applications.findById(id);
    if (!node) return null;

    const previousState = this.revisions.pop();
    if (!previousState) return null;

    Object.assign(node.data, previousState);
    return node.data;
  }

  sortApplications(sortBy) {
    const compareFn = sortBy === 'region' 
      ? (a, b) => a.region.localeCompare(b.region)
      : (a, b) => a.submissionTime - b.submissionTime;

    return this.applications.toSortedArray(compareFn);
  }
}

// Initialize System
const ktpSystem = new KtpSystem();
ktpSystem.initialize().then(() => {
  app.use(express.urlencoded({ extended: true }));
  app.set('view engine', 'ejs');

  // Routes
  app.get('/', async (req, res) => {
    const sortBy = req.query.sort || 'time';
    const applications = ktpSystem.sortApplications(sortBy);
    
    res.render('index', {
      queue: applications,
      currentSort: sortBy,
      successMessage: req.query.success,
      errorMessage: req.query.error
    });
  });

  app.post('/submit', async (req, res) => {
    try {
      ktpSystem.submitApplication(req.body);
      await ktpSystem.saveToDatabase();
      res.redirect('/?success=Application+submitted');
    } catch (err) {
      res.redirect('/?error=Submission+failed');
    }
  });

  // Add other routes (process, edit, undo) following same pattern

  app.listen(3000, () => console.log('Server running on http://localhost:3000'));
});