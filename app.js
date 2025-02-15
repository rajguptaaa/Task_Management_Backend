require('dotenv').config();
require("./config/dbConfig");
const bcrypt = require('bcrypt');
const morgan = require('morgan');
const cors = require('cors');
const jwt = require("jsonwebtoken");
const { generateOtp } = require('./utils/optHelpers');
const { sendOtpEmail } = require('./utils/emailHelpers');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 1814;
const OTP = require('./models/otpModel');
const User = require('./models/userModel');
const Task = require('./models/taskModel');
const cookieParser = require('cookie-parser');
//middlewares
app.use(cors());    //1st
app.use(express.json()); //2nd
app.use((req, res, next) => { //3rd
    console.log('request received -->', req.url);
    next();
})

app.get('/', (req, res) => {
    res.send("<h1>Server Started</h1>")
});

app.use(morgan("dev")); //4th ->get,post

app.use(
    cors({
        credentials: true,
        origin: process.env.FRONTEND_URL,
    })
);

//otp
app.post("/otps", async (req, res) => {
    const { email } = req.query;

    //email verify
    const emailVerify = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVerify.test(email)) {
        return res.status(400).json({
            status: "failed",
            message: "Invalid email format",
        });
    }

    if (!email) {
        res.status(400).json({
            status: "failed",
            message: 'Missing required parameter: "email"',
        });
        return;
    }
    //create a otp
    const otp = generateOtp();
    //send the otp to email
    //dont send otp if it has been already sent within 10 minutes
    const isEmailSent = await sendOtpEmail(email, otp);
    if (!isEmailSent) {
        res.status(500).json({
            status: "fail",
            message: "Email could not be sent!",
        });
        return;
    }
    //store it somewhere to compare it later
    //encrypt
    const newSalt = await bcrypt.genSalt(15);
    const newHash = await bcrypt.hash(otp.toString(), newSalt);
    const newOtp = await OTP.create({
        email,
        otp: newHash,
    });

    res.status(201).json({
        status: "Success",
        message: `OTP sent to ${newOtp.email}`,
    })
    //send the success resopnse
});

//creates a new user
//it stores the passwors in secure way
// app.post("/users/register", async (req, res) => {
//     try {
//         const { email, password, otp } = req.body;

//         // Fetch the latest OTP document
//         const otpDoc = await OTP.findOne({ email }).sort("createdAt");
//         if (!otpDoc) {
//             return res.status(400).json({
//                 status: "Fail",
//                 message: "Invalid OTP",
//             });
//         }

//         const { otp: newHashedOtp } = otpDoc;

//         // Compare OTP with hashed OTP
//         const isOtpCorrect = await bcrypt.compare(otp, newHashedOtp);
//         if (!isOtpCorrect) {
//             return res.status(401).json({
//                 status: "Failed",
//                 message: "Invalid OTP",
//             });
//         }

//         // Hash the password
//         const hashedPassword = await bcrypt.hash(password, 14);

//         // Create new user
//         const newUser = await User.create({
//             email,
//             password: hashedPassword,
//         });

//         res.status(201).json({
//             status: "Success",
//             data: {
//                 user: {
//                     email: newUser.email,
//                     fullName: newUser.fullName,
//                 },
//             },
//         });
//     } catch (err) {
//         console.log("Error in POST /users/register", err);

//         if (err.name === "ValidationError") {
//             return res.status(400).json({
//                 status: "Failed",
//                 message: "Data validation failed",
//             });
//         } else if (err.code === 11000) {
//             return res.status(400).json({
//                 status: "Failed",
//                 message: "Email already exists",
//             });
//         } else {
//             return res.status(500).json({
//                 status: "Failed",
//                 message: "Internal Server Error: " + err.message,
//             });
//         }
//     }
// });
app.post("/users/register", async (req, res) => {
    try {
        const { email, password, otp } = req.body;
        //Verify the otp from the database, and the user otp:
        const otpDoc = await OTP.findOne({
            email: email,
        }).sort("-createdAt");
        // console.log(otpDoc);
        if (!otpDoc) {
            res.status(400);
            res.json({
                status: "fail",
                msg: "Otp is not sent or is expired.",
            });
            return;
        }
        //otp ko destructure karke rename kar rahe here: 
        const { otp: hashedOtp } = otpDoc;
        const isOtpCorrect = await bcrypt.compare(otp.toString(), hashedOtp);
        if (!isOtpCorrect) {
            res.status(401); //unauthorized
            res.json({
                status: "fail",
                msg: "Invalid OTP!",
            });
            return;
        }

        //register the user securely <3
        const hashedPasscode = await bcrypt.hash(password, 14);

        const newUser = await User.create({
            email,
            password: hashedPasscode,
        });
        res.status(201);
        res.json({
            status: "success",
            data: {
                user: {
                    email: newUser.email,
                    fullName: newUser.fullName,
                },
            },
        });
    } catch (err) {
        console.log("Error in /POST users");
        console.log(err.name, err.code);
        console.log(err.message);
        if (err.name === "ValidationError") {
            res.status(400);
            res.json({
                status: "fail",
                message: "Data validation failed: " + err.message,
            });
        } else if (err.code === 11000) {
            res.status(400);
            res.json({
                status: "fail",
                message: "Email already exists",
            });
        } else {
            res.status(500);
            res.json({
                status: "fail",
                message: "Internal Server Error",
            });
        }
    }
});

app.post("/users/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400);
            res.json({
                status: "fail",
                message: "Email and password is required!",
            });
        }
        // Use findOne instead of find, and add await
        const currUser = await User.findOne({ email: email });

        if (!currUser) {
            return res.status(400).json({
                status: "Failed",
                message: "User is not registered",
            });
        }

        const { password: hashedPassword, fullName, _id } = currUser;

        // Compare password
        const isPasswordCorrect = await bcrypt.compare(password, hashedPassword);
        if (!isPasswordCorrect) {
            return res.status(401).json({
                status: "Failed",
                message: "Invalid email or password",
            });
        }

        const token = jwt.sign({
            email,
            _id,
            fullName,
        }, //payload
            process.env.JWT_SECRET_KEY, {
            expiresIn: "1d",
        }
        );

        console.log(token);
        res.cookie("authorization", token, {
            httpOnly: true, // it cannot be accessed by JS code on client machine
            secure: true, // it will be only sent on https connections
            sameSite: "None", // currently our backend is on separate domain and frontend is on separate domain
            // in production, when you host BE and FE on same domain, make it "Strict"
        });

        res.status(200).json({
            status: "Success",
            message: "User logged in",
            data: {
                user: {
                    email,
                    fullName,
                },
            },
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            status: "Failed",
            message: "Internal Server Error",
        });
    }
});

//middleware 
app.use(cookieParser());
app.use((req, res, next) => {
    //get token from cookies
    //use cookies parser midddleware
    try {
        const { authorization } = req.cookies;

        if (!authorization) {
            res.status(401).json({
                status: "Failed",
                message: "Authorization failed",
            });
            return;
        }
        jwt.verify(authorization, process.env.JWT_SECRET_KEY, (error, data) => {
            if (error) {
                //invalid
                res.status(401);
                res.json({
                    status: "fail",
                    message: "Authorization failed!",
                });
            }
            else {
                console.log(data);
                req.currUser = data;
                next();
            }
        })
    } catch (err) {
        res.status(400).json({
            status: "Failed",
            message: "Authorization Error",
        })
    }
});

app.get('/users', async (req, res) => {
    try {


    } catch (err) {
        console.log("Error in GET /users");
        console.log(err.message);
        res.status(500).json(
            {
                status: "Failed",
                message: "Internal Server Error" + err.message,
            }
        )
    }
})

app.get("/tasks", async (req, res) => {
});

//create a task
app.post("/tasks", async (req, res) => {
    try {
        const { assignor, ...taskInfo } = req.body;
        const { email } = req.currUser;
        // 1. get the data from request
        taskInfo.assignor = email;
        // 2. validate the data :: now mongoose does that
        // 3. save the data in db :: MongoDB (online --> ATLAS) (offline is pain to setup :: in deployment we will mostly prefer online)
        const newTask = await Task.create({
            ...taskInfo,
            assignor: email,
        });

        res.status(201); //created
        res.json({
            status: "success",
            data: {
                task: newTask,
            },
        });
    } catch (err) {

        console.log("Error in POST /tasks", err.message);
        if (err.name === "ValidationError") {
            res.status(400).json({ status: "fail", message: err.message });
        } else if (err.code === 11000) {
            res.status(400).json({ status: "fail", message: err.message });
        } else {
            res.status(500).json({ status: "fail", message: "Internal Server Error" });
        }
    }
});


app.listen(PORT, () => {
    console.log(`---Server running on port ${PORT}---`);
    console.log(`link: http://localhost:${PORT}/`)
})

