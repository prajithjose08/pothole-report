const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;

// --- Middleware ---
app.use(express.json());
app.use(cors());

// Serve the frontend HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui.html'));
});

// --- MongoDB Setup ---
const MONGO_URI = 'mongodb://localhost:27017/report';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schemas ---
const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['citizen', 'admin'], default: 'citizen' }
});

const ReportSchema = new mongoose.Schema({
  reportedBy: { type: String, required: true },
  location: { type: String, required: true },
  latitude: { type: Number },
  longitude: { type: Number },
  description: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  status: { type: String, enum: ['pending', 'in-progress', 'resolved'], default: 'pending' },
  imageDescription: { type: String },
  imageFilename: { type: String },
  reportedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date }
});

const User = mongoose.model('User', UserSchema);
const Report = mongoose.model('Report', ReportSchema);

// Multer Storage setup for photo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniquePrefix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// --- API Routes ---

// 1. Register User
app.post('/api/register', async (req, res) => {
  try {
    const newUser = new User(req.body);
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// 2. Login User
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const { password: _, ...userWithoutPass } = user.toObject();
    res.status(200).json({ user: userWithoutPass });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// 3. Get All Reports
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await Report.find().sort({ reportedAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports.' });
  }
});

// 4. Submit New Report with photo upload
app.post('/api/reports', upload.single('image'), async (req, res) => {
  const { location, description, severity, imageDescription, reportedBy, latitude, longitude } = req.body;

  if (!location || !description || !reportedBy || !severity) {
    return res.status(400).json({ error: 'Missing required fields (location, description, severity).' });
  }

  try {
    const imageFilename = req.file ? req.file.filename : null;

    const newReport = new Report({
      location,
      description,
      severity,
      imageDescription,
      reportedBy,
      imageFilename,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      reportedAt: new Date()
    });

    await newReport.save();
    res.status(201).json(newReport);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create report.' });
  }
});

// 5. Update Report Status (Admin)
app.put('/api/reports/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Missing required field: status.' });
  }

  let updateFields = { status };
  if (status === 'resolved') {
    updateFields.resolvedAt = new Date();
  } else {
    updateFields.resolvedAt = null;
  }

  try {
    const updatedReport = await Report.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!updatedReport) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    res.json(updatedReport);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report.' });
  }
});

// 6. Delete Report (Admin)
app.delete('/api/reports/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deletedReport = await Report.findByIdAndDelete(id);
    if (!deletedReport) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    
    // Delete associated image file if it exists
    if (deletedReport.imageFilename) {
      const imagePath = path.join(__dirname, 'uploads', deletedReport.imageFilename);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete report.' });
  }
});

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Server Startup
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
