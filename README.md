# Dry Port Command Center

Professional logistics command center for tracking container data and storage billing.

## Setup Instructions

This application uses **Firebase Firestore** for its backend. Follow these steps to connect your own Firebase project:

1. **Create a Firebase Project**: Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. **Enable Firestore**: In the Project Overview, click on "Firestore Database" and create a database. Start in "Production Mode" or "Test Mode".
3. **Enable Auth**: Go to "Authentication" and enable "Google" sign-in provider.
4. **Get Configuration**:
   - Go to Project Settings (gear icon).
   - Under "Your apps", click the web icon (`</>`) to register a new web app.
   - Copy the `firebaseConfig` object.
5. **Update Config**:
   - Locate `/firebase-applet-config.json` in this project.
   - Replace the values with your actual Firebase project keys.
6. **Deploy Rules**:
   - Copy the contents of `/firestore.rules` from this project.
   - Paste them into the "Rules" tab of your Firestore Database in the Firebase Console.
   - Click "Publish".

## Features
- **Search-Centric UI**: Quick search by Owner Code or Container Number.
- **Real-Time Sync**: Changes reflect instantly across all connected clerks.
- **Storage Logic**: Automatic calculation of "Storage Life" in days.
- **Excel Export**: Quick tab-separated string generation for Excel.
- **Dark Mode Aesthetic**: High-performance "Glassmorphism" interface.

Developed for Dry Port Document Teams.
