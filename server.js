const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = 3000;

// --- Middleware (Handles JSON bodies only) ---
app.use(express.json());
app.use(cors());

// Serve the frontend HTML file (allows loading via http://localhost:3000/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui.html'));
});

// --- MongoDB Setup ---
// FIX: Corrected URI to use a database name instead of a path.
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
    reportedBy: { type: String, required: true }, // Username of the reporter
    location: { type: String, required: true },
    description: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    status: { type: String, enum: ['pending', 'in-progress', 'resolved'], default: 'pending' },
    imageDescription: { type: String }, 
    reportedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date }
});

const User = mongoose.model('User', UserSchema);
const Report = mongoose.model('Report', ReportSchema);

// --- API Routes ---

// 1. Register User
app.post('/api/register', async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        if (err.code === 11000) { // Duplicate key error
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
        // We return the user object (without the password) for simplicity.
        const { password: _, ...userWithoutPass } = user.toObject();
        res.status(200).json({ user: userWithoutPass });
    } catch (err) {
        res.status(500).json({ error: 'Login failed.' });
    }
});

// 3. Get All Reports
app.get('/api/reports', async (req, res) => {
    try {
        // Fetch all reports, sorted by newest first
        const reports = await Report.find().sort({ reportedAt: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reports.' });
    }
});

// 4. Submit New Report (Handles JSON body)
app.post('/api/reports', async (req, res) => {
    // req.body is already parsed as JSON by express.json()
    const { location, description, severity, imageDescription, reportedBy } = req.body;
    
    // Check for mandatory fields
    if (!location || !description || !reportedBy || !severity) {
        return res.status(400).json({ error: 'Missing required fields (location, description, severity).' });
    }

    try {
        const newReport = new Report({
            location,
            description,
            severity,
            imageDescription,
            reportedBy,
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
        updateFields.resolvedAt = null; // Clear if status is changed from resolved
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
        res.status(204).send(); // No content
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete report.' });
    }
});


// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});