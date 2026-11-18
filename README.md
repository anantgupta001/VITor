
# 🎓 VITor — Faculty Review Platform

VITor is a student-driven faculty review platform for VIT Vellore, Chennai, Bhopal, and AP campuses.

It helps students make informed faculty choices during FFCS through anonymous reviews and ratings.

**Built for students, by a student.**

## ✨ Features

- 🏫 Support for all 4 VIT campuses.
- 🔐 Google Sign-In for eligible VIT students.
- 🕵️ Anonymous faculty reviews.
- ⭐ Four-criteria faculty rating system.
- 🔎 Faculty search and discovery.
- 📄 Secure cursor-based review pagination.
- 📊 Faculty ratings and review statistics.
- 🌙 Dark and light themes.
- 📱 Responsive UI.

## 🛠 Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS
- **Authentication:** Firebase Authentication
- **Database:** Cloud Firestore
- **Backend:** Next.js API Routes, Firebase Admin SDK
- **Testing:** Node.js Test Runner, Vitest, Firebase Emulator, Playwright
- **Hosting:** Vercel

## 🔒 Security & Reliability

- Server-side authentication and authorization.
- Transaction-safe review operations.
- Input validation, rate limiting, and idempotency protection.
- Firestore security rules with restricted client-side writes.
- Secure review ownership and anonymous public responses.
- Automated backup, migration verification, and recovery support.
- Application logging and security headers.

## 🧪 Testing

VITor includes automated unit, integration, component, security, and end-to-end tests.

Run the test suites:

```bash
npm test
npm run test:integration
npm run test:components
npm run test:security
npm run test:e2e
```

Additional checks:

```bash
npm run lint
npm run build
```

## 🚀 Getting Started

### Prerequisites

- Node.js and npm
- Firebase project with Authentication and Cloud Firestore enabled
- Google Sign-In configured in Firebase

### Installation

```bash
git clone https://github.com/anantgupta001/VITor.git
cd VITor
npm install
```

Create `.env.local` using `.env.example` and configure the required Firebase environment variables.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and add relevant tests.
4. Open a Pull Request.

Please follow the existing code structure and never commit secrets or credentials.

## 📜 Disclaimer

VITor is an independent student initiative and is not officially affiliated with Vellore Institute of Technology (VIT).

Reviews represent individual student opinions and experiences.

## 👨‍💻 Author

**Anant Gupta**

[GitHub](https://github.com/anantgupta001) · [LinkedIn](https://www.linkedin.com/in/anantgupta7628/)

If you find VITor useful, consider giving the repository a ⭐.

**Built with ❤️ for students, by a student.**
