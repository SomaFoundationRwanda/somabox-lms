import express from 'express';
import cors from 'cors';
import { config } from './src/config/index.js';

// Import services
import cloudServices from './src/services/cloud.services.js';
import contentServices from './src/services/content.services.js';
import authServices from './src/services/auth.services.js';
import userServices from "./src/services/users.service.js";
import libraryServices from "./src/services/library.services.js";
import coursesServices from "./src/services/courses.services.js";
import solServices from "./src/services/sol.services.js";
import analyticsServices from "./src/services/analytics.services.js";
import notificationsServices from "./src/services/notifications.service.js";

const app = express();

// CORS configuration (covers dev hosts and LAN IPs)
const corsOptions = {
    origin: [
        'http://localhost:3001',
        'http://localhost:3002',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002',
        'http://10.0.0.62:3001',
        'http://192.168.1.186:3001',
        'https://9c38c031342a.ngrok-free.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Express 5 + path-to-regexp v6 disallow bare '*' routes; use regex to cover all
app.options(/.*/, cors(corsOptions));
app.use(express.json());

const loggingMiddleware = (req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
};
app.use(loggingMiddleware);

// API Routes
app.use("/cloud", cloudServices);
app.use("/content", contentServices);
app.use("/auth", authServices);
app.use("/users", userServices);
app.use("/library", libraryServices);
app.use("/courses", coursesServices);
app.use("/sol", solServices);
app.use("/analytics", analyticsServices);
app.use("/notifications", notificationsServices);

// Static Content Serving
app.use("/khan-academy", express.static(config.paths.static.khan));
app.use("/w3schools", express.static(config.paths.static.w3schools));
app.use("/wikipedia", express.static(config.paths.static.wikipedia));
app.use("/lessons", express.static(config.paths.lessons));
app.use("/library-book-covers", express.static(config.paths.libraryCovers));
app.use("/course-covers", express.static(config.paths.courseCovers));
app.use("/course-files", express.static(config.paths.courseFiles));
app.use("/pdf-book-covers", express.static(config.paths.pdfCovers));

// Server Start
app.listen(config.port)
  .on('listening', () => console.log(`Server running on port ${config.port}`))
  .on('error', err => {
      if (err.code === 'EADDRINUSE') {
          console.error(`Port ${config.port} is already in use`);
          process.exit(1);
      } else {
          throw err;
      }
  });
