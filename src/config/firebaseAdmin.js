'use strict';

const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.projectId;

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
  });
}

module.exports = admin;
