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
    app.use(express.json());

    // Endpoint to handle user questions
    app.post('/ask', async (req, res) => {
        const userQuestion = req.body.question;
    
        if (!userQuestion) {
            return res.status(400).send('No question provided.');
        }
    
        try {
            // Send the question to OpenAI for a response
            const chatCompletion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { "role": "system", "content": "You are a knowledgeable assistant who provides answers to technical questions and interview advice. Try to answer most beneficial way possible" },
                    { "role": "user", "content": userQuestion }
                ],
            });
    
            const answer = chatCompletion.choices[0].message.content;
            res.send({
                message: answer
            });
        } catch (error) {
            console.error('Error processing question:', error);
            res.status(500).send('An error occurred while processing the question.');
        }
    });
    app.use('/ask', express.static(path.join(__dirname, 'ask')));
    app.use(express.json());


    app.post('/upload-career', upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }
    
        const filePath = path.join(__dirname, req.file.path);
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
        try {
            let resumeText = '';
    
            // Extract text based on file type
            if (fileExtension === '.pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdf(dataBuffer);
                resumeText = pdfData.text;
            } else if (fileExtension === '.doc' || fileExtension === '.docx') {
                // Handle DOC/DOCX files if needed in the future
                return res.status(400).json({ message: 'DOC/DOCX files are not supported yet.' });
            } else {
                return res.status(400).json({ message: 'Unsupported file type. Please upload a PDF.' });
            }
    
            console.log('Extracted Resume Text:', resumeText); // Log extracted text for debugging
    
            const careerPath = req.body.careerPath; // The career path selected by the user
            const checklist = getChecklistForCareerPath(careerPath); // Get the checklist based on career path
    
            // Send the extracted text and career path to OpenAI for feedback
            const chatCompletion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { "role": "system", "content": "Do concisly. Main points.You are a career advisor. The student will provide their resume and career path. Use this information to check where the student needs help and suggest courses with links." },
                    { "role": "user", "content": `Career Path: ${careerPath}\n\n${checklist}\n\nResume Text:\n${resumeText}` }
                ],
            });
    
            const feedback = chatCompletion.choices[0].message.content;
            console.log('Feedback from OpenAI:', feedback); // Log feedback for debugging
    
            // Clean up the uploaded file after processing
            fs.unlinkSync(filePath);
    
            // Send feedback as JSON response
            res.json({
                message: feedback
            });
        } catch (error) {
            console.error('Error processing file:', error);
            res.status(500).json({ message: 'An error occurred while processing the file.' });
        }
    });
    
    // Helper function to get the checklist based on career path
    function getChecklistForCareerPath(careerPath) {
        switch (careerPath) {
            case 'Data Scientist':
                return `⁠Data Scientist:
    a. Python: Widely used for data manipulation, analysis, and machine learning. Libraries such as Pandas, NumPy, SciPy, Scikit-learn, TensorFlow, and Keras are indispensable.
        URL: https://www.udemy.com/course/python-for-machine-learning-t/?ranMID=39197&ranEAID=JVFxdTr9V80&ranSiteID=JVFxdTr9V80-FO9UQt6ba3RP.x6nKQO20A&utm_source=aff-campaign&utm_medium=udemyads&LSNPUBID=JVFxdTr9V80
    b. R: Known for statistical computing and data visualization. Libraries like ggplot2, dplyr, and caret make it powerful for data analysis.
        URL: https://www.datacamp.com/courses/data-manipulation-with-dplyr
    c. SQL: Used to manage and query relational databases. Essential for handling large datasets and pulling data from databases.
        URL: https://www.codecademy.com/learn/learn-sql
    d. Bash/Shell Scripting: Useful for automating tasks, particularly when dealing with large data pipelines and cloud computing environments.
        URL: https://www.codecademy.com/catalog/language/bash
    e. Hadoop/Spark: Working with large datasets requires knowledge of distributed computing. Spark (with PySpark) and Hadoop are widely used for big data processing.
        URL: https://www.coursera.org/learn/introduction-to-big-data-with-spark-hadoop
    f. Matplotlib/Seaborn/Plotly (Python): For creating static or interactive visualizations.
        URL: https://www.coursera.org/learn/introduction-to-big-data-with-spark-hadoop
    g. NoSQL Databases (e.g., MongoDB): For working with unstructured or semi-structured data.
        URL: https://www.coursera.org/learn/introduction-to-mongodb
    h. Cloud Platforms (e.g., AWS, Google Cloud, Azure): Familiarity with cloud-based data storage and processing tools like AWS S3, Redshift, or Google BigQuery is becoming increasingly important.
        URL: https://www.udemy.com/course/introduction-to-cloud-computing-on-amazon-aws-for-beginners/?couponCode=OF83024F`;
            
            case 'Web Developer':
                return `Web developer:
    a. HTML (HyperText Markup Language): The standard language for structuring content on the web.
        URL: https://www.codecademy.com/learn/learn-html
    b. CSS (Cascading Style Sheets): Used to style the appearance of HTML elements, making websites visually appealing.
        URL: https://www.codecademy.com/learn/learn-css
    c. React.js: A JavaScript library for building user interfaces, particularly for single-page applications (SPAs).
        URL: https://www.codecademy.com/learn/react-101
    d. JavaScript (Node.js): With Node.js, JavaScript is also used on the backend to handle server-side logic, file handling, and databases.
        URL: https://www.codecademy.com/learn/learn-node-js
    e. Python: Often used in web development for backend frameworks like Django and Flask.
        URL: https://www.coursera.org/specializations/django
    f. NoSQL Databases (e.g., MongoDB): For working with unstructured or semi-structured data.
        URL: https://www.coursera.org/learn/introduction-to-mongodb`;
    
            case 'Software Engineer':
                return `Software Engineer:
    a. Python: Known for its simplicity and versatility, Python is used for web development, scripting, data analysis, artificial intelligence, and automation.
        URL: https://www.udemy.com/course/python-for-machine-learning-t/?ranMID=39197&ranEAID=JVFxdTr9V80&ranSiteID=JVFxdTr9V80-FO9UQt6ba3RP.x6nKQO20A&utm_source=aff-campaign&utm_medium=udemyads&LSNPUBID=JVFxdTr9V80
    b. Kotlin: The official language for Android development, replacing Java as Google’s preferred language.
        URL: https://developer.android.com/courses/android-basics-compose/course
    c. JavaScript: The most widely used language for frontend web development, and also used on the backend with Node.js.
        URL: https://www.codecademy.com/learn/learn-node-js
    d. Bash/Shell: Commonly used for writing scripts to automate system tasks, particularly in Linux environments.
        URL: https://www.codecademy.com/catalog/language/bash
    e. NoSQL: For working with non-relational databases, such as MongoDB or Cassandra, particularly in big data applications.
        URL: https://www.coursera.org/learn/introduction-to-mongodb`;
    
            case 'Machine Learning Specialist':
                return `Machine Learning specialist:
     a. Python: Widely used for data manipulation, analysis, and machine learning. Libraries such as Pandas, NumPy, SciPy, Scikit-learn, TensorFlow, and Keras are indispensable.
        URL: https://www.udemy.com/course/python-for-machine-learning-t/?ranMID=39197&ranEAID=JVFxdTr9V80&ranSiteID=JVFxdTr9V80-FO9UQt6ba3RP.x6nKQO20A&utm_source=aff-campaign&utm_medium=udemyads&LSNPUBID=JVFxdTr9V80
    b. R: Known for statistical computing and data visualization. Libraries like ggplot2, dplyr, and caret make it powerful for data analysis.
        URL: https://www.datacamp.com/courses/data-manipulation-with-dplyr
    c. SQL: Used to manage and query relational databases. Essential for handling large datasets and pulling data from databases.
        URL: https://www.codecademy.com/learn/learn-sql
    d. C++: Known for performance-critical applications and is sometimes used to build the underlying infrastructure of machine learning libraries.
        URL: https://www.codecademy.com/learn/learn-c-plus-plus
    e. Hadoop/Spark: Working with large datasets requires knowledge of distributed computing. Spark (with PySpark) and Hadoop are widely used for big data processing.
        URL: https://www.coursera.org/learn/introduction-to-big-data-with-spark-hadoop
    f. NoSQL Databases (e.g., MongoDB): For working with unstructured or semi-structured data.
        URL: https://www.coursera.org/learn/introduction-to-mongodb
`;
    
            case 'Game Developer':
                return `Game Developer:
    a. C++: Core language for game development, especially for AAA console and PC games.
        URL: https://www.coursera.org/specializations/cplusplusunrealgamedevelopment
    b. C#: Primary language for Unity, one of the most popular game engines used for developing 2D, 3D, mobile, and indie games.
        URL: https://www.coursera.org/specializations/programming-unity-game-development
    c. Kotlin: Used for Android game development, especially when not using cross-platform tools like Unity.
        URL: https://developer.android.com/courses/android-basics-compose/course
    d. Blueprints (Unreal Engine): A visual scripting language that allows non-programmers to build game logic within Unreal Engine.
        URL: https://dev.epicgames.com/community/learning/tutorials/ZeEB/unreal-engine-5-full-course-for-free-2024
    e.  Python: Used for prototyping and building simple games.
        URL: https://www.udemy.com/course/pygame-dungeon-crawler/?couponCode=OF83024F`;
    
            default:
                return 'Career path not found.';
        }
    }
    
    // Serve static files from the 'career-path' directory
    app.use('/career-path', express.static(path.join(__dirname, 'career-path')));

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
