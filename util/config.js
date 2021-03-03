// Programmer Name     : Lim Wei Hau
// Program Name        : config.js
// Description         : configuration for firebase
// First Written on    : 25 December 2020
// Last Edited on      : 03 March 2021

require("dotenv/config");

module.exports = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
