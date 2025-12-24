# 🎓 VITor — Faculty Rating Platform for VIT-AP

**VITor** is a **student-driven faculty rating platform** built exclusively for **VIT-AP University students**.  
It allows students to **anonymously review and rate faculty members** based on multiple academic and support-related parameters, helping others make informed decisions.

> Built **by students, for students** 🤝

---

## 📑 Table of Contents

- [Features](#-features)
- [Evaluation Criteria](#-evaluation-criteria-student-friendly)
- [Privacy & Authenticity](#-privacy--authenticity)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started-local-setup)
- [Deployment](#-deployment-vercel)
- [Contributing](#-contributing)
- [Disclaimer](#-disclaimer)
- [Author](#-author)
- [Support](#-support-the-project)

---

## ✨ Features

- 🔐 **College-only authentication** using official college email IDs  
- 🕵️ **Anonymous reviews** — your identity is never revealed  
- ⭐ **Multi-criteria rating system**
  - Attendance
  - Correction
  - Teaching
  - Approachability
- 📊 **Automatic average stats** and total review count per faculty  
- 🔎 **Search with pagination** for smooth navigation  
- 📱 **Fully responsive UI** (mobile & desktop)  
- 🔥 **Real-time updates** using Firebase  
- 🚀 **Production-ready Next.js application**

---

## 🧠 Evaluation Criteria (Student-Friendly)

Each faculty is evaluated from a **student’s point of view**, focusing on fairness, clarity, and support.

### 📅 Attendance
- Easy and flexible attendance policies  
- Understands genuine student issues  
- Focuses on learning rather than strict rules  

### 📝 Correction
- Fair and unbiased evaluation  
- Timely correction of answer sheets  
- Clear justification for marks  

### 🎓 Teaching
- Clear and simple explanation of concepts  
- Comfortable teaching pace  
- Focus on understanding, not memorization  

### 🤝 Approachability
- Easily approachable for doubts and guidance  
- Friendly and respectful towards students  
- Willing to help beyond classroom hours  

---

## 🔒 Privacy & Authenticity

- ✅ All reviews are **100% anonymous**
- ✅ Only **college email IDs** are allowed to submit reviews
- ✅ One review per user per faculty (users can update their review)
- ✅ Helps prevent spam and ensures authenticity

---

## 🛠 Tech Stack

- **Frontend**: Next.js (App Router), Tailwind CSS  
- **Backend**: Firebase Firestore  
- **Authentication**: Firebase Authentication (Google Sign-In)  
- **Deployment**: Vercel  

---

## 📁 Project Structure

~~~text
app/
 ├─ page.js               # Home page
 ├─ faculty/[id]/page.js  # Faculty detail page
 ├─ api/                  # API routes

components/
 ├─ FacultyCard.js
 ├─ ReviewForm.js
 ├─ LoginButton.js

lib/
 ├─ firebase.js

context/
 ├─ AuthContext.js
~~~

---

## 🚀 Getting Started (Local Setup)

### 1️⃣ Clone the Repository

~~~bash
git clone https://github.com/anantgupta001/vitor.git
cd vitor
~~~

### 2️⃣ Install Dependencies

~~~bash
npm install
~~~

### 3️⃣ Setup Environment Variables

Create a `.env.local` file in the root directory:

~~~env
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
~~~

#### ⚠️ Important

- Never commit `.env.local` to GitHub  
- Ensure `.env.local` is listed in `.gitignore`

### 4️⃣ Run the Project Locally

~~~bash
npm run dev
~~~

Open your browser and visit:

~~~
http://localhost:3000
~~~

---

## 🌍 Deployment (Vercel)

This project is **Vercel-ready**.

### Deployment Steps

- Push the repository to GitHub  
- Visit https://vercel.com  
- Import the GitHub repository  
- Add the same environment variables in  
  **Vercel → Project Settings → Environment Variables**
- Click **Deploy**

🎉 Your application will be live.

---

## 🤝 Contributing

Contributions are welcome and appreciated.

### Steps to Contribute

~~~bash
# Fork the repository
# Create a new branch
git checkout -b feature/your-feature

# Make your changes
git commit -m "Add: short description of your change"

# Push and open a Pull Request
~~~

### Contribution Guidelines

- Keep contributions student-focused  
- Maintain clean and readable code  
- Follow existing project structure  
- ❌ Do not commit secrets or credentials  

---

## 📜 Disclaimer

This platform is an **independent student initiative**  
and is **NOT officially affiliated with VIT-AP University**.

All reviews represent personal student opinions and experiences.  
The platform aims to promote transparency and help students make informed academic decisions.

---

## 👨‍💻 Author

**Anant Gupta**

- GitHub: https://github.com/anantgupta001  
- LinkedIn: https://www.linkedin.com/in/anantgupta7628/

---

## ⭐ Support the Project

If you find this project helpful:

- ⭐ Star the repository on GitHub  
- 📢 Share it with your peers  
- 💡 Contribute ideas, issues, or improvements  

---

Built with ❤️ by students, for students.
