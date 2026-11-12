# 🎓 VITor — Faculty Rating Platform for VIT

**VITor** is a student-driven faculty rating platform for students across VIT Vellore, Chennai, Bhopal, and AP campuses.

Students can anonymously rate and review faculty members based on attendance, correction, teaching, and approachability — helping peers make informed academic decisions.

---

## ✨ Features

- 🏫 Multi-campus support — Vellore, Chennai, Bhopal, and AP.
- 🔐 College email authentication using Google Sign-In.
- 🕵️ Anonymous faculty reviews.
- ⭐ Four-criteria faculty rating system.
- 📊 Faculty average ratings and review counts.
- 🔎 Faculty search and discovery.
- 📄 Paginated reviews.
- 🌙 Dark and light themes.
- 📱 Responsive design for mobile and desktop.

---

## 🧠 Evaluation Criteria

| Criteria | What Students Evaluate |
|---|---|
| 📅 Attendance | Attendance flexibility, fairness, and understanding of genuine concerns. |
| 📝 Correction | Fair evaluation, timely correction, and clarity of marking. |
| 🎓 Teaching | Concept clarity, teaching pace, and explanation quality. |
| 🤝 Approachability | Accessibility, guidance, and willingness to resolve doubts. |

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 16, React 19 |
| Styling & UI | Tailwind CSS, Material UI, Lucide |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| Architecture | Service and Repository Pattern |
| Hosting | Vercel |

---

## 🏗 Architecture

| Layer | Responsibility |
|---|---|
| Presentation | Next.js pages, React components, and context providers. |
| Service | Business logic, input validation, and application workflows. |
| Repository | Firestore data access and database operations. |
| Infrastructure | Firebase Authentication, Firestore, and security rules. |

---

## 🔒 Privacy & Security

- Reviews are publicly anonymous; Firebase UID is used internally for ownership validation.
- Only eligible VIT student accounts can submit reviews.
- One review per user per faculty, with update support.
- Firestore security rules enforce ownership, campus authorization, and data validation.
- Strict validation for ratings, review text, and user profiles.
- Default-deny Firestore access policy and HTTP security headers.

---

## 🧪 Testing

VITor includes automated testing across multiple layers.

| Testing Layer | Framework | Tests |
|---|---|---:|
| Unit | Node.js Test Runner | 87 |
| Integration | Firebase Emulator | 37 |
| Component | Vitest + Testing Library | 72 |
| End-to-End | Playwright | 25 |
| Security | Firebase Rules Unit Testing | 37 |
| **Total** | | **258** |

### Run Tests

```bash
npm test
npm run test:integration
npm run test:components
npm run test:e2e
npm run test:security
```

### Additional Checks

```bash
npm run lint
npm run build
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js and npm
- A Firebase project with Authentication and Cloud Firestore enabled
- Google Sign-In configured in Firebase

### 1. Clone the Repository

```bash
git clone https://github.com/anantgupta001/vitor.git
cd vitor
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Never commit `.env.local` or private credentials.

### 4. Run Locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## 🌍 Deployment

VITor is configured for deployment on [Vercel](https://vercel.com).

1. Import the GitHub repository into Vercel.
2. Add the required Firebase environment variables.
3. Deploy the application.
4. Ensure Firebase Authentication domains and Firestore security rules are configured for production.

To deploy Firestore rules:

```bash
firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and add relevant tests.
4. Commit and push your changes.
5. Open a Pull Request.

Please follow the existing architecture, maintain readable code, and never commit secrets or credentials.

---

## 📜 Disclaimer

VITor is an independent student initiative and is **not officially affiliated with Vellore Institute of Technology (VIT) or any of its campuses**.

All reviews reflect individual student opinions and experiences.

---

## 👨‍💻 Author

**Anant Gupta**

[GitHub](https://github.com/anantgupta001) · [LinkedIn](https://www.linkedin.com/in/anantgupta7628/)

If you find VITor useful, consider giving the repository a ⭐.

**Built with ❤️ by students, for students.**
