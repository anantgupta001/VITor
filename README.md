# 🎓 VITor — Faculty Rating Platform for VIT

**VITor** is a **student-driven faculty rating platform** for **VIT students** across **Vellore, Chennai, Bhopal, and AP** campuses.  
Students **anonymously rate and review faculty** on attendance, correction, teaching, and approachability — helping peers make informed academic decisions.

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🧠 Evaluation Criteria](#-evaluation-criteria-student-friendly)
- [🔒 Privacy & Authenticity](#-privacy--authenticity)
- [🛠 Tech Stack](#-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started-local-setup)
- [🌍 Deployment](#-deployment-vercel)
- [🤝 Contributing](#-contributing)
- [📜 Disclaimer](#-disclaimer)
- [👨‍💻 Author](#-author)
- [⭐ Support](#-support-the-project)

---

## ✨ Features

- 🏫 **Multi-campus support** — Vellore, Chennai, Bhopal, AP; choose campus and view faculty per campus  
- 🔐 **College-only authentication** using official VIT student email IDs  
- 🕵️ **Anonymous reviews** — student identities are never revealed  
- ⭐ **Multi-criteria rating system**
  - Attendance
  - Correction
  - Teaching
  - Approachability
- 📊 **Automatic average ratings** and total review count per faculty  
- 🔎 **Search with pagination** for smooth navigation  
- 🌙 **System-aware Dark / Light mode** with manual toggle  
- 📱 **Fully responsive UI** (mobile & desktop; short campus names on small screens)  
- 🔥 **Real-time updates** powered by Firebase Firestore  
- 📄 **Reviews in batches** — 3 reviews initially, then “Show more” to load 3 at a time  
- 🚀 **Production-ready Next.js application**

---

## 🧠 Evaluation Criteria (Student-Friendly)

Each faculty is evaluated from a **student’s perspective**, focusing on fairness, clarity, and approachability.

### 📅 Attendance
- Flexible and student-friendly attendance policies  
- Understands genuine student concerns  
- Prioritizes learning over strict rules  

### 📝 Correction
- Fair and unbiased evaluation  
- Timely correction of answer sheets  
- Clear justification for marks  

### 🎓 Teaching
- Clear and structured explanation of concepts  
- Comfortable teaching pace  
- Focus on understanding rather than rote learning  

### 🤝 Approachability
- Easily approachable for doubts and guidance  
- Friendly and respectful interaction  
- Willing to help beyond classroom hours  

---

## 🔒 Privacy & Authenticity

- ✅ **100% anonymous reviews**
- ✅ Only **official college email IDs** can submit reviews
- ✅ **One review per user per faculty** (users may update their review)
- ✅ Prevents spam and ensures authenticity of feedback

---

## 🛠 Tech Stack

- **Frontend:** Next.js (App Router), Tailwind CSS  
- **Backend:** Firebase Firestore  
- **Authentication:** Firebase Authentication (Google Sign-In)  
- **Theming:** System-aware Dark / Light mode  
- **Deployment:** Vercel  

---

## 📁 Project Structure

~~~text
app/
 ├─ page.js                    # Home route (campus selector)
 ├─ layout.js                  # Root layout
 ├─ providers.js               # Theme + auth providers
 ├─ [campus]/
 │   ├─ page.jsx                # Route only → CampusHome
 │   └─ [id]/page.jsx           # Route only → FacultyDetail
 ├─ context/
 │   └─ auth-context.js         # Auth state & useAuth

components/
 ├─ CampusSelector.jsx          # Campus picker (home)
 ├─ CampusHome.jsx              # Campus faculty list (used by [campus]/page)
 ├─ FacultyDetail.jsx           # Single faculty profile (used by [campus]/[id]/page)
 ├─ Navbar.jsx, Footer.jsx
 ├─ FacultyCard.jsx, ReviewForm.jsx
 ├─ InfoCard.jsx, FeatureItem.jsx
 ├─ LoginButton.jsx, ThemeToggle.jsx

lib/
 ├─ firebase-config.js         # Firebase app, auth, Firestore
 ├─ campus-config.js           # Campus slugs & helpers
 ├─ faculty-helpers.js         # e.g. getFacultyPhoto
 ├─ campus-home-content.js    # Feature bullets & criteria copy
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

Create a **`.env.local`** file in the project root:

~~~env
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
~~~

#### ⚠️ Important Notes
- Never commit **`.env.local`** to GitHub  
- Ensure **`.env.local`** is included in **`.gitignore`**

### 4️⃣ Run the Project Locally

~~~bash
npm run dev
~~~

Open your browser and visit:

~~~text
http://localhost:3000
~~~

---

## 🌍 Deployment (Vercel)

This project is **Vercel-ready**.

### Deployment Steps

- Push the repository to GitHub  
- Visit **https://vercel.com**  
- Import the GitHub repository  
- Add the same environment variables under  
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
git commit -m "feat: short description of your change"

# Push and open a Pull Request
~~~

### Contribution Guidelines

- Keep contributions student-focused  
- Maintain clean and readable code  
- Follow the existing project structure  
- ❌ Do not commit secrets or credentials  

---

## 📜 Disclaimer

VITor is an **independent student initiative**  
and is **NOT officially affiliated with VIT or any of its campuses**.

All reviews reflect personal student opinions and experiences.  
The platform aims to promote transparency and help students make informed academic decisions.

---

## 👨‍💻 Author

**Anant Gupta**

- GitHub: https://github.com/anantgupta001  
- LinkedIn: https://www.linkedin.com/in/anantgupta7628/

---

## ⭐ Support the Project

If you find this project useful:

- ⭐ Star the repository on GitHub  
- 📢 Share it with your peers  
- 💡 Suggest improvements or contribute  

Built with ❤️ by students, for students.
