const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const pdf = require('pdf-parse'); // Ensure this line is present

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const OpenAI = require('openai'); // Updated import
require('dotenv').config();
const app = express();

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Your existing MongoDB connection and schema definition
mongoose.connect('mongodb://localhost:27017/yourDatabase')
    .then(() => console.log('MongoDB connected successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));
const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'uploads/'); // Set your upload directory
        },
        filename: (req, file, cb) => {
            cb(null, Date.now() + path.extname(file.originalname)); // Append timestamp to the filename
        }
    });
    
    const upload = multer({ storage: storage });
    const checklist = `
Please evaluate the following resume based on these criteria:
1. Clear contact information
2. Professional summary or objective
3. Relevant experience
4. Skills section
5. Education section
6. Tailored keywords (specific to the job/industry)
7. Quantifiable achievements
8. Proper formatting (consistent, clean, readable)
9. Action-oriented language
10. No typos or grammar errors

For each point, provide feedback on whether it is present or missing and any suggestions for improvement.
`;
    // Set up OpenAI
    
    // Endpoint for file upload
    app.post('/upload', upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }
    
        const filePath = path.join(__dirname, req.file.path);
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
        try {
            let text = '';
    
            // Extract text based on file type
            if (fileExtension === '.pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdf(dataBuffer);
                text = pdfData.text;
            } else if (fileExtension === '.doc' || fileExtension === '.docx') {
                // Handle DOC/DOCX files if needed
                return res.status(400).send('DOC/DOCX files are not supported yet.');
            } else {
                return res.status(400).send('Unsupported file type. Please upload a PDF.');
            }
    
            console.log('Extracted Text:', text); // Log extracted text for debugging
    
            // Send the extracted text to OpenAI for feedback
            const chatCompletion = await openai.chat.completions.create({
                model: "gpt-4",  // You can switch to 'gpt-3.5-turbo' if needed
                messages: [
                    { "role": "system", "content": "You are a resume evaluator. If an item is 'GREEN' so it is good to go, just list the number. If multiple items are 'GREEN', list all their numbers. For 'YELLOW' and 'RED' same way, but gor needing revising and changing respectfully" },
                    { "role": "user", "content": `${checklist}\n\nResume Text:\n${text}` }
                ],
            });
    
            const feedback = chatCompletion.choices[0].message.content;
            console.log('Feedback from OpenAI:', feedback); // Log feedback for debugging
    
            // Clean up the uploaded file if needed
            fs.unlinkSync(filePath); // Delete the file after processing
    
            res.send({
                message: feedback
            });
        } catch (error) {
            console.error('Error processing file:', error);
            res.status(500).send('An error occurred while processing the file.');
        }
    });
    
    // Serve the uploads directory (optional)
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define a User schema (adjust fields as needed)
const userSchema = new mongoose.Schema({
    name: String,
    surname: String,
    dob: Date,
    email: { type: String, unique: true },
    password: String,
    specialization: String,
});

const User = mongoose.model('User', userSchema);

app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// Create the uploads folder if it doesn't exist
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}


// Multer middleware

// Endpoint for file upload
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.send({
        message: 'File uploaded successfully!',
        filePath: `/uploads/${req.file.filename}`
    });
});


// Sign-Up Route
app.post('/signup', async (req, res) => {
    const { name, surname, dob, email, password, specialization } = req.body;

    // Basic validation
    if (!name || !surname || !dob || !email || !password || !specialization) {
        return res.status(400).send('All fields are required.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ name, surname, dob, email, password: hashedPassword, specialization });

    try {
        await user.save();
        res.status(201).send('User created successfully');
    } catch (error) {
        res.status(400).send('Error creating user: ' + error.message);
    }
});





// Token validation function
function isValidToken(token) {
    try {
        const decoded = jwt.verify(token, secretKey); // Verifies the token with the secret key
        return decoded; // Return the decoded token if valid
    } catch (err) {
        return false; // Return false if token is invalid
    }
}

// Middleware to authenticate token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Get token from "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ message: 'Token is missing' });
    }

    const validToken = isValidToken(token);
    if (validToken) {
        req.user = validToken; // Attach user info from the token to the request
        next(); // Proceed to the next middleware or route
    } else {
        res.status(403).json({ message: 'Invalid token' });
    }
}


// Sign-In Route
app.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ email: user.email }, 'your_jwt_secret', { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).send('Invalid credentials');
    }
});

// Protected route for accessing user profile
app.get('/profile', authenticateToken, (req, res) => {
    // Access user information from the token (req.user)
    res.json({ message: 'Welcome to your profile', user: req.user });
});

// Serve the auth page
app.get('/auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth.html'));
});



// Start the server
const PORT = process.env.PORT || 3011;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
